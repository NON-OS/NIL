import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.NONOS_API || 'http://localhost:3000';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    // keep every asset a real file so the strict CSP never has to allow data: URLs
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true },
    },
  },
});
