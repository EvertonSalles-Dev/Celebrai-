/// <reference types="vite/client" />

/**
 * Tipagem das variáveis de ambiente expostas pelo Vite.
 * Apenas variáveis com prefixo `VITE_` chegam ao cliente.
 */
interface ImportMetaEnv {
  /** URL base da API. Vazio usa o proxy do Vite (mesmo origin). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Se o `tsc` reportar muitos `TS7026`/`TS7006` ("JSX element implicitly has
 * type 'any'", "Parameter implicitly has an 'any' type") apontando para
 * páginas variadas, NÃO corrija as páginas.
 *
 * A causa é a ausência dos tipos do React: sem `@types/react`, o TypeScript
 * não declara `JSX.IntrinsicElements`, o tipo do parâmetro do `onChange` se
 * perde junto, e o resultado são ~1.900 erros espalhados por todo o `src`,
 * fazendo parecer que cada arquivo tem defeito próprio.
 *
 * Verifique se as devDependencies foram instaladas:
 *
 *   npm ls @types/react @types/react-dom
 *   npm install --include=dev
 *
 * Na Vercel isso acontece quando o `installCommand` roda sem `--include=dev`
 * (o painel pode marcar "Install Command" padrão, que ignora devDependencies
 * por padrão em alguns cenários).
 */
