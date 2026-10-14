import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
//
// Modes
//   default  → talks to the FastAPI backend. In dev, /api is proxied to
//              VITE_PROXY_TARGET (default http://localhost:8000) so no CORS
//              setup is needed. In production set VITE_API_URL or serve the
//              single-file build from the same origin as the API.
//   mock     → `vite --mode mock` / `npm run dev:mock`: in-browser demo
//              transport with a seeded corpus; no backend required.
export default defineConfig(({ mode }) => {
  const useMock = mode === "mock" || process.env.VITE_USE_MOCK === "true";
  const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:8000";

  return {
    plugins: [react(), tailwindcss(), viteSingleFile()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    define: {
      "import.meta.env.VITE_USE_MOCK": JSON.stringify(useMock ? "true" : "false"),
    },
    server: {
      host: true,
      port: 5173,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: true,
      port: 4173,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
