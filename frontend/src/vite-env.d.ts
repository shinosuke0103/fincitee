/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" when running in demo mode (vite --mode mock / VITE_USE_MOCK=true) */
  readonly VITE_USE_MOCK?: string;
  /** Backend origin; empty string = same origin (dev proxy or co-hosted build) */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
