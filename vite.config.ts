import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import buildStamp from './client/vite/buildStamp';
import devProver from './client/vite/devProver';
import pdfAssets from './client/vite/pdfAssets';

const API = process.env.NONOS_API || 'http://localhost:3000';
// where npm run build:prover puts the prover, a separate program the app runs as a Web Worker
const PROVER_BUILD = new URL('./dist/prover', import.meta.url).pathname;

// Libraries change far less often than the app, so the ones the first screen needs anyway get
// chunks of their own that stay cached across deploys. Everything else (crypto, zero-knowledge
// proofs, deck export) follows the screen that loads it.
function vendorChunk(id: string) {
  if (!id.includes('/node_modules/')) return undefined;
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
  if (id.includes('/node_modules/@dnd-kit/')) return 'dnd';
  if (id.includes('/node_modules/lucide-react/')) return 'icons';
  return undefined;
}

export default defineConfig({
  root: 'client',
  plugins: [react(), buildStamp(), devProver(PROVER_BUILD), pdfAssets()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    // keep every asset a real file so the strict CSP never has to allow data: URLs
    assetsInlineLimit: 0,
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true },
    },
  },
});
