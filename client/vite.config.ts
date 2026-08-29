import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxies /api to the backend during local dev so the client never needs a
// hardcoded absolute URL. See server/.env.example for CORS_ORIGIN — this must
// match the port Vite prints when it starts.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.CLIENT_PORT) || 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 4000}`,
        changeOrigin: true,
      },
    },
  },
});
