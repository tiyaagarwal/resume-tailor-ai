import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Proxies /api to the backend during local dev so the client never needs a
// hardcoded absolute URL. See server/.env.example for CORS_ORIGIN — this must
// match the port Vite prints when it starts.
export default defineConfig(({ mode }) => {
  // The project's .env lives at the repo root, not client/, and holds
  // unprefixed keys (CLIENT_PORT, PORT) — loadEnv with an empty prefix is
  // required to read those in here, since Vite doesn't expose them via
  // process.env on its own.
  const env = loadEnv(mode, resolve(__dirname, '..'), '');

  return {
    plugins: [react()],
    server: {
      port: Number(env.CLIENT_PORT) || 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${env.PORT || 4000}`,
          changeOrigin: true,
        },
      },
    },
  };
});
