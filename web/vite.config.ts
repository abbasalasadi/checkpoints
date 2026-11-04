import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// monaco-vim's "browser" export is a UMD file that fails under Vite ("define is
// not defined"); use its ES module build.
const monacoVimEsm = join(dirname(require.resolve('monaco-vim/package.json')), 'dist/index.mjs');

// Ports per docs/v1-contracts.md: API 8157, Vite 5203.
// /api, /healthz and the WebSockets are proxied to the backend so the browser
// sees one origin: no CORS, and the session cookie stays same-origin.
const API_PORT = Number(process.env.API_PORT ?? 8157);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5203);

export default defineConfig({
  plugins: [react()],
  // monaco-vim imports Monaco's pre-0.56 entry path; point it at the package
  // entry so both share one Monaco instance (V2 Vim keybindings, D24).
  resolve: {
    alias: [
      { find: /^monaco-vim$/, replacement: monacoVimEsm },
      { find: /^monaco-editor\/esm\/vs\/editor\/editor\.api(\.js)?$/, replacement: 'monaco-editor' },
      // Monaco 0.56 exports deep files as monaco-editor/<path> (mapped to
      // esm/vs/<path>.js); monaco-vim still asks for monaco-editor/esm/vs/<path>.
      { find: /^monaco-editor\/esm\/vs\/(.+?)(\.js)?$/, replacement: 'monaco-editor/$1' },
    ],
  },
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
