/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVELOPER_TELEMETRY_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
