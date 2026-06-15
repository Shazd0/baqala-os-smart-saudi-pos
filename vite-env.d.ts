/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVELOPER_TELEMETRY_ENDPOINT?: string;
  readonly VITE_PUBLIC_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
