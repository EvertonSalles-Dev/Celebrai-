# ============================================================================
# Celebrai API — imagem de produção
# Build em estágios: compila o TypeScript no primeiro e leva apenas o runtime
# necessário para a imagem final (menor superfície de ataque).
# ============================================================================

# ---------------------------------------------------------------------------
# Estágio 1 — dependências
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Copia apenas os manifestos para aproveitar o cache de camadas do Docker.
COPY package.json package-lock.json* ./
COPY packages/api/package.json ./packages/api/

# Instala TODAS as dependências do workspace da API (inclui dev, necessárias
# para compilar). `--ignore-scripts` evita executar scripts de terceiros.
RUN npm ci --ignore-scripts --workspace @celebrai/api --include-workspace-root

# ---------------------------------------------------------------------------
# Estágio 2 — build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY package.json package-lock.json* ./
COPY packages/api/package.json ./packages/api/
COPY packages/api/tsconfig.json packages/api/tsconfig.build.json ./packages/api/
COPY packages/api/prisma ./packages/api/prisma
COPY packages/api/src ./packages/api/src
COPY packages/api/scripts ./packages/api/scripts

WORKDIR /app/packages/api

# Gera o Prisma Client a partir do schema de PRODUÇÃO (PostgreSQL) e compila.
RUN npx prisma generate --schema prisma/schema.prisma
RUN npx tsc -p tsconfig.build.json

# ---------------------------------------------------------------------------
# Estágio 3 — runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# `tini` garante que sinais (SIGTERM) cheguem ao Node — shutdown gracioso.
RUN apk add --no-cache tini

# Usuário sem privilégios.
RUN addgroup -g 1001 -S celebrai && adduser -S celebrai -u 1001

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3333

# Dependências de produção do workspace.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules

# Cliente Prisma gerado + artefatos compilados + schema/migrations.
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/api/node_modules/.prisma ./packages/api/node_modules/.prisma
COPY packages/api/prisma ./packages/api/prisma
COPY packages/api/package.json ./packages/api/package.json
COPY package.json ./

# Remove dependências de desenvolvimento após o build.
RUN npm prune --omit=dev --workspace @celebrai/api --include-workspace-root

USER celebrai

WORKDIR /app/packages/api

EXPOSE 3333

# Healthcheck usado pelo docker-compose e por orquestradores.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:${PORT}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
