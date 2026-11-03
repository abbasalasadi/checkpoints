/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOG_ENABLED?: string;
  readonly VITE_LOG_LEVEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
