# Deploy na Vercel — Celebrai

Guia do que precisa estar configurado para a API funcionar em produção.

---

## Arquitetura do deploy

| Parte | Onde roda | Configuração |
|---|---|---|
| Frontend (React + Vite) | CDN da Vercel (estático) | `outputDirectory: packages/web/dist` |
| API (Fastify) | Vercel Function | `api/index.ts` (entrypoint) |
| Banco (PostgreSQL) | **externo** (Neon, Supabase, RDS…) | `DATABASE_URL` |
| Roteamento | `vercel.json` → `rewrites` | `/api/*` → função; resto → SPA |

O banco **não** roda na Vercel: funções são efêmeras e sem disco persistente.
SQLite não funciona em produção por esse motivo.

---

## Root Directory do projeto na Vercel
**Deve ficar vazio (ou `.`)** — apontando para a raiz do repositório.

Sintoma quando está errado (`packages/api`):

```
Error: Cannot find module '/vercel/path0/packages/api/scripts/build-vercel.mjs'
Error: Command "node scripts/build-vercel.mjs" exited with 1
```

O caminho resolvido termina em `/packages/api/scripts/` porque o comando é
executado **de dentro** de `packages/api`. Com isso, todas as declarações do
`vercel.json` ficam deslocadas em um nível:

| Declaração | Resolvido como | Existe? |
|---|---|---|
| `buildCommand` | `packages/api/scripts/build-vercel.mjs` | ❌ |
| `outputDirectory: packages/web/dist` | `packages/api/packages/web/dist` | ❌ |
| `functions: api/index.ts` | `packages/api/index.ts` | ❌ |

É por isso que corrigir o `vercel.json` não tinha efeito: os arquivos estavam
certos, mas sendo lidos a partir da raiz errada.

### Defesa em profundidade
O `scripts/build-vercel.mjs` **se auto-localiza** a partir do próprio caminho
(`<raiz>/scripts/` → sobe um nível) e roda todos os comandos com esse `cwd`, em
vez de assumir o diretório de trabalho. Assim ele funciona mesmo se o Root
Directory estiver em `packages/api`, e registra um aviso explícito nesse caso.

O `buildCommand` usa `npm run build:vercel --prefix ../..`: o `--prefix` faz o
npm encontrar o `package.json` da raiz **antes** de executar o script, o que
funciona independente do cwd. (Note que `--prefix ..` não serve — o npm o
resolve como `packages/`, não como a raiz.)

> ⚠️ `outputDirectory` e `functions` **não** têm como se defender sozinhos: eles
> são resolvidos pela Vercel contra o Root Directory, antes de qualquer código
> do projeto rodar. Corrigir o Root Directory no painel continua sendo
> necessário.

---

## Por que o erro `No Output Directory named "dist"` acontecia
O build terminava certo, mas a Vercel procurava o bundle em `./dist` na raiz —
e o frontend é gerado em `packages/web/dist` (é o `outDir` do Vite do workspace).
Como a checagem do output directory acontece **depois** do build, o log mostrava
"Build completed" seguido de:

```
Error: No Output Directory named "dist" found after the Build completed.
```

Três coisas se somavam:

1. `outputDirectory` apontava para `dist` na raiz.
2. `framework: "vite"` fazia a Vercel aplicar o preset do Vite, que também
   sobrescreve o output directory e o build command declarados no arquivo.
3. `scripts/build-vercel.mjs` espelhava `packages/web/dist` em `./dist`. Além de
   ser uma pasta de 2º nível com o `@vercel/static-build` (ele copia `dist/`
   para dentro de `dist/dist/`), a cópia correspondia a `.gitignore: dist/` —
   ou seja, a Vercel podia receber apenas o `dist/` da raiz, que ficava de fora
   do repositório.

A correção é apontar o output directory para o local real do bundle, desligar o
preset (`"framework": null`, que preserva o build customizado do `vercel.json`)
e deixar o script apenas validar que `packages/web/dist/index.html` existe —
assim uma falha do frontend aponta a causa real em vez de um erro genérico de
output directory.

> A Vercel **não** usa `outputDirectory` em runtime: no deploy ela empacota a
> pasta indicada em `.vercel/output/static`. O `.gitignore` pode continuar
> listando `dist/` e `packages/web/dist/`.

---

## Por que o `405 Method Not Allowed` acontecia

O `vercel.json` original mandava **tudo** para o `index.html`:

```json
"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
```

Com isso, `POST /api/auth/login` era resolvido para `/index.html`. Como
`index.html` é um **arquivo estático**, a Vercel não aceita `POST` nele e
responde `405 Method Not Allowed` — a função da API **nunca era executada**.

A correção é declarar a rota da API **antes** do fallback da SPA, e excluir
`/api` do fallback:

```json
"rewrites": [
  { "source": "/api/(.*)", "destination": "/api/index" },
  { "source": "/:path((?!api/).*)", "destination": "/index.html" }
]
```

A ordem importa: a primeira regra que casa é aplicada.

---

## Variáveis de ambiente obrigatórias

Configure em **Project Settings → Environment Variables**. Sem qualquer uma
delas a função falha na inicialização.

| Variável | Valor em produção | Observação |
|---|---|---|
| `NODE_ENV` | `production` | Habilita HSTS e a checagem de segredos fracos |
| `DATABASE_URL` | `postgresql://…` do seu provedor | Inclua `?sslmode=require` se o provedor exigir |
| `JWT_ACCESS_SECRET` | string aleatória ≥ 32 chars | **Não** use o valor de exemplo |
| `JWT_REFRESH_SECRET` | outra string aleatória ≥ 32 chars | Diferente da de acesso |
| `INVITATION_TOKEN_SECRET` | outra string aleatória ≥ 32 chars | Diferente das duas acima |
| `APP_URL` | `https://seu-projeto.vercel.app` | Usada nos links de convite — use domínio **estável** (ver abaixo) |
| `API_URL` | `https://seu-projeto.vercel.app` | |
| `CORS_ORIGINS` | `https://seu-projeto.vercel.app` | Lista separada por vírgula |

> ℹ️ As URLs de preview da Vercel (`…-<hash>-….vercel.app`) são liberadas
> **automaticamente**: o código lê `VERCEL_URL` e `VERCEL_PROJECT_PRODUCTION_URL`,
> que a própria Vercel injeta em cada deployment. Não é preciso atualizar
> `CORS_ORIGINS` a cada push — e, como o formato de preview é um único label DNS
> com hífens, um wildcard `*.dominio.com` **não** funcionaria.

---

## `APP_URL` nos links de convite (e o erro `404 DEPLOYMENT_NOT_FOUND`)

O link entregue ao convidado é montado como `${APP_URL}/convite/<token>`
(ver `buildInviteLink`). Se `APP_URL` for apontado para um **host de deployment
efêmero** da Vercel — no formato `projeto-<hash>-….vercel.app` —, esse endereço
deixa de existir no próximo deploy. O convite que o usa passa a responder:

```
This page doesn't exist
404 DEPLOYMENT_NOT_FOUND
```

Isso **não é bug do código**: é o host morrendo. Por isso o código resolve a URL
pública com `resolveAppUrl` (`packages/api/src/config/env.ts`), que:

1. usa `APP_URL` quando ele é um domínio **estável** (ex.: `https://celebrai.com`);
2. se `APP_URL` for efêmero, cai para `VERCEL_PROJECT_PRODUCTION_URL` — o domínio
   estável de produção que a Vercel injeta (ex.: `https://seu-projeto.vercel.app`);
3. sem nada disso (local), usa o `APP_URL` do `.env` (`http://localhost:5173`).

Na prática: **sempre prefira um domínio estável em `APP_URL`** (domínio próprio, se
tiver DNS apontado, ou o domínio `…vercel.app` do projeto). O fallback evita o
`404` quando essa variável fica com um host de deployment, mas o correto é não
depender dele. Convites **já enviados** com um host efêmero continuam quebrados —
eles só podem ser regerados/reemviados.

> Para conferir a URL que está sendo usada, acesse `GET /api/meta`: o campo
> `appUrl` mostra o valor já resolvido.

> ⚠️ O servidor **recusa iniciar** em produção se `JWT_ACCESS_SECRET`,
> `JWT_REFRESH_SECRET` ou `INVITATION_TOKEN_SECRET` ainda tiverem os valores
> padrão do `.env.example`. Gere os três:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Opcionais

| Variável | Quando definir |
|---|---|
| `MAIL_DRIVER` | `disabled` (padrão) ou `smtp` + `SMTP_*` |
| `WHATSAPP_DRIVER` | `disabled` (padrão) ou `cloud_api` + credenciais |
| `GOOGLE_MAPS_API_KEY` | Se o mapa do convite precisar funcionar |
| `RATE_LIMIT_MAX` | Padrão `300` por minuto |

### Escolha do banco

O `prisma/schema.prisma` usa `provider = "postgresql"`. Rode as migrations
**uma vez**, apontando para o banco de produção:

```bash
cd packages/api
DATABASE_URL="postgresql://..." npx prisma migrate deploy
DATABASE_URL="postgresql://..." npx prisma db seed   # opcional: dados de exemplo
```

> Não rode `db seed` em produção se não quiser os dados de demonstração — o seed
> apaga todas as tabelas antes de inserir.

---

## `DATABASE_PROVIDER` na Vercel

**Não defina** `DATABASE_PROVIDER` na Vercel. O default do código é
`postgresql`, que é o correto em produção.

Essa variável existe apenas para o modo SQLite local. Se ficar ausente, o
`postinstall` (`scripts/bootstrap-db.mjs`) mantém o Client gerado a partir do
schema de produção — que é o comportamento desejado.

---

## Scripts do projeto
| Comando | O que faz | Quando usar |
|---|---|---|
| `npm run dev` | API + front em paralelo | Desenvolvimento |
| `npm run build` | Build da API e do front (front em `packages/web/dist`) | CI / reproduzir a Vercel |
| `npm run build:vercel` | Valida que o bundle do front foi gerado | É o que o `buildCommand` da Vercel roda |
| `npm run build:local` | Build **+ restaura o Client do `.env`** | Build na sua máquina |
| `npm run build:web` | Só o frontend | Deploy (é o que a Vercel roda) |
| `npm run db:bootstrap` | Regenera o Client conforme o `.env` | Após `npm run build` |

### Por que `build:local` e não `build`

O `npm run build` da API roda `prisma generate` com o schema de **produção**
(PostgreSQL). Isso é o correto na Vercel, mas na sua máquina deixa o projeto
inconsistente:

```
Client = PostgreSQL   +   DATABASE_URL = file:./dev.db
```

Toda consulta passa a falhar com `the URL must start with the protocol
postgresql://` e, como o erro é mascarado em `500 INTERNAL_ERROR`, o sintoma é
**"não consigo fazer login"**.

O `build:local` faz o build e, ao final, regenera o Client com o provider que o
`.env` declara. Para pular a restauração:

```powershell
$env:SKIP_RESTORE=1; npm run build:local
```

---

## Lock do engine do Prisma no Windows
Se a API estiver rodando (`npm run dev`), o processo mantém
`query_engine-windows.dll.node` carregado e o Windows recusa substituí-lo:

```
EPERM: operation not permitted, rename
  '...query_engine-windows.dll.node.tmp3888'
  -> '...query_engine-windows.dll.node'
```

**Não é erro de configuração** — é o lock do arquivo. Pare o servidor antes de
buildar. O `build:local` detecta a porta ocupada e avisa antes de falhar.

Para forçar a liberação:

```powershell
Get-NetTCPConnection -LocalPort 3333 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
Remove-Item "node_modules\.prisma\client\*.tmp*" -Force -ErrorAction SilentlyContinue
```

---

## Checklist antes de subir
```bash
# 1. Type-check do entrypoint serverless (api/index.ts)
npx tsc -p tsconfig.json
# 2. Build do frontend
npm run build:web
# 3. Migrations no banco de produção
cd packages/api && npx prisma migrate deploy
```

> **Nota sobre `npx tsc -p tsconfig.json` em máquina local com SQLite:**
> o `tsconfig.json` da raiz inclui `api/**/*.ts`, e o TypeScript segue o import
> até `packages/api/src`. Se o seu Prisma Client local foi gerado para SQLite
> (sem enums, sem `QueryMode`, sem tipos de relação), você verá erros como
> `Module '"@prisma/client"' has no exported member 'Role'`.
>
> **Isso é esperado e não afeta a Vercel**, onde o Client é gerado do schema
> PostgreSQL. Para confirmar que o entrypoint em si está limpo, rode com o
> Client de produção:
>
> ```bash
> cd packages/api && npx prisma generate --schema prisma/schema.prisma
> cd ../.. && npx tsc -p tsconfig.json
> # depois volte ao modo local, se necessário:
> cd packages/api && node scripts/set-provider.mjs sqlite
> ```

Depois do deploy, valide:

```bash
curl -i https://seu-projeto.vercel.app/api/health
# esperado: HTTP 200 + {"status":"ok",...}

curl -i -X POST https://seu-projeto.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"voce@exemplo.com","password":"sua-senha"}'
# esperado: HTTP 200 + {"data":{"accessToken":"..."}}
```

Se `/api/health` responder `404`, o problema é de roteamento (rewrites).
Se responder `500` com `[celebrai] Configuração de ambiente inválida`, veja a
mensagem — ela lista exatamente qual variável está faltando.
