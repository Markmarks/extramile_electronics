/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Storefront base URL for cache refreshes; defaults to https://www.dnvmart.com. */
  readonly VITE_STOREFRONT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
