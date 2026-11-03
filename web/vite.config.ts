import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 5190 is registered in 0.My_Strategy/ports_used.md.
// /api and /ws/terminal are proxied to the backend so the browser sees one
// origin: no CORS, and the session cookie stays same-origin (docs/05-backend.md).
const API_PORT = Number(process.env.API_PORT ?? 8128);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5190);

export default defineConfig({
  plugins: [react()],
  server: {
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
      '/healthz': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
      '/ws/terminal': { target: `ws://127.0.0.1:${API_PORT}`, ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
