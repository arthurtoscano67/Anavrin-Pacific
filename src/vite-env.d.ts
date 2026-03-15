/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOBBY_WS_URL?: string;
  readonly VITE_ITEMS_ADMIN_CAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
