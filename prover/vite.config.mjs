import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

// The prover is its own program, built into its own file next to the web app and loaded only as
// a Web Worker. Nothing in the app imports it, and nothing in it comes from the app.
export default defineConfig({
  root: here,
  logLevel: 'warn',
  build: {
    outDir: path.join(here, '../dist/prover'),
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: path.join(here, 'src/worker.js'),
      formats: ['iife'],
      name: 'NilProver',
      fileName: () => 'prover-worker.js',
    },
    rollupOptions: {
      output: { banner: '/*! Nil prover. GNU GPL v3 or later. Source: the prover folder of the Nil repository. */' },
    },
  },
});
