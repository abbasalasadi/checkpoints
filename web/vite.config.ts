import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Ports per docs/v1-contracts.md: API 8157, Vite 5203.
// /api, /healthz and the WebSockets are proxied to the backend so the browser
// sees one origin: no CORS, and the session cookie stays same-origin.
const API_PORT = Number(process.env.API_PORT ?? 8157);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5203);

export default defineConfig({
  plugins: [react()],
  server: {
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
      '/healthz': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
      '/ws': { target: `ws://127.0.0.1:${API_PORT}`, ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
