/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO?: string;
  readonly VITE_API_BASE_URL?: string;
}

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
