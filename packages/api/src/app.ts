import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
// `env` é usado tanto na configuração quanto no hook de diagnóstico (abaixo).
import { env, corsOrigins, isDev, isOriginAllowed } from './config/env.js';
import { logger } from './config/logger.js';
import { disconnectPrisma } from './config/prisma.js';
import authPlugin from './plugins/auth.plugin.js';
import { registerRoutes } from './routes/index.js';

/**
 * Bootstrap da API Celebrai.
 *
 * Segurança aplicada de forma centralizada:
 *  - Helmet: headers de proteção (CSP, HSTS, noSniff, frameguard...).
 *  - CORS: lista explícita de origens, credenciais habilitadas.
 *  - Rate limiting global + limites específicos por rota (auth/check-in).
 *  - Erros nunca vazam stack trace para o cliente.
 *  - Shutdown gracioso fecha o pool do banco.
 */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // usamos nosso logger estruturado
    trustProxy: true, // respeita X-Forwarded-For atrás de proxy/load balancer
    bodyLimit: 5 * 1024 * 1024, // 5MB (importação de CSV)
    disableRequestLogging: true,
  });

  // -------------------------------------------------------------------------
  // Body JSON tolerante a corpo vazio
  // -------------------------------------------------------------------------
  //
  // Por padrão o Fastify rejeita um POST que declara `Content-Type:
  // application/json` e envia corpo vazio (ou Content-Length: 0):
  //
  //   FST_ERR_CTP_EMPTY_JSON_BODY (400)
  //   "Body cannot be empty when content-type is set to 'application/json'"
  //
  // Isso quebra rotas cujo payload não vem do corpo — `POST /auth/refresh` e
  // `POST /auth/logout` usam o cookie httpOnly, então o front as envia sem body
  // (apenas o Content-Type, herança de um cliente que sempre o definia).
  //
  // Tratamos o corpo vazio como `{}` em vez de erro: a validação das rotas já
  // distingue o que é obrigatório, e assim clientes antigos em cache — que
  // continuam mandando o header — não recebem 400 numa operação legítima.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      const raw = (body as string).trim();
      if (raw === '') {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch (error) {
        // Mantém o comportamento do Fastify para JSON inválido (400).
        const err = error as Error & { statusCode?: number };
        err.statusCode = 400;
        done(err, undefined);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Segurança
  // -------------------------------------------------------------------------
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        // Tipografia do convite vem do Google Fonts.
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        connectSrc: ["'self'", ...corsOrigins],
        frameSrc: ["'self'", 'https://www.google.com', 'https://maps.google.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  });

  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      // Requisições sem Origin (curl, apps mobile nativos) são permitidas.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      logger.security(`CORS bloqueou origem não autorizada: ${origin}`);
      callback(new Error('Origem não autorizada pelo CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
  });

  await app.register(fastifyRateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    allowList: isDev ? ['127.0.0.1', '::1'] : [],
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Muitas requisições. Aguarde alguns instantes e tente novamente.',
      },
    }),
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });

  // -------------------------------------------------------------------------
  // Autenticação / autorização
  // -------------------------------------------------------------------------
  await app.register(authPlugin);

  // -------------------------------------------------------------------------
  // Rotas
  // -------------------------------------------------------------------------
  await registerRoutes(app);

  // -------------------------------------------------------------------------
  // Tratamento uniforme de erros
  // -------------------------------------------------------------------------
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Rota não encontrada: ${request.method} ${request.url}`,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Diagnóstico de roteamento (serverless)
  // -------------------------------------------------------------------------
  //
  // Na Vercel a função recebe a URL por `rewrites`, e é fácil ela chegar aqui
  // sem o prefixo `/api` (ou com o caminho capturado na query string). Nesse
  // caso todas as rotas caem no 404 acima com uma mensagem genérica que não
  // diz se o problema foi a URL recebida ou o registro das rotas.
  //
  // Aqui apenas LOGAMOS o que o Fastify realmente enxergou. Nada é reescrito:
  // alterar o caminho de uma requisição é responsabilidade do entrypoint
  // serverless (`api/index.ts`), que tem acesso ao `req.url` original. O log
  // fica no painel da Vercel (Logs) e resolve o caso sem ambiguidade.
  app.addHook('onRequest', (request, _reply, done) => {
    logger.debug(`${request.method} ${request.url}`, {
      rawUrl: request.raw.url,
      host: request.headers.host,
      apiPrefix: env.API_PREFIX,
    });
    done();
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Erros de validação do framework.
    if (error.validation) {
      reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos na requisição.',
          details: error.validation,
        },
      });
      return;
    }

    if (statusCode >= 500) {
      logger.error(`Erro interno em ${request.method} ${request.url}`, {
        message: error.message,
        stack: isDev ? error.stack : undefined,
      });
      // Nunca expõe detalhes internos.
      reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' },
      });
      return;
    }

    reply.status(statusCode).send({
      error: {
        code: error.code ?? 'ERROR',
        message: error.message,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Encerramento gracioso
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Recebido ${signal}. Encerrando...`);
    try {
      await app.close();
      await disconnectPrisma();
      logger.info('Encerrado com sucesso.');
      process.exit(0);
    } catch (error) {
      logger.error('Falha ao encerrar', { error });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  return app;
}

/** Inicia o servidor HTTP. */
export async function startServer(): Promise<void> {
  const app = await buildServer();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`🚀 Celebrai API ouvindo em ${env.API_URL} (${env.NODE_ENV})`);
    logger.info(`   Prefixo: ${env.API_PREFIX}`);
    logger.info(`   CORS: ${corsOrigins.join(', ')}`);
  } catch (error) {
    logger.error('Falha ao iniciar o servidor', { error });
    process.exit(1);
  }
}

export { resolve, fastifyStatic };
