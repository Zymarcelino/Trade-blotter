/// <reference types="vite/client" />

// Typed access to the optional Vite dev-only overrides. Both are optional; when
// unset the same-origin defaults in src/config/env.ts apply. This is the single
// place these variable names are declared for TypeScript.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// CSS Modules typing so `import styles from './x.module.css'` is well-typed.
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
