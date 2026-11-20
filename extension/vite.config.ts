import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// One bundle for every browser; scripts/build.mjs adds the OCR engine, writes per-browser manifests and zips.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: '', // relative URLs: extension pages are served from the extension root
  build: {
    outDir: 'dist/bundle',
    emptyOutDir: true,
    target: ['chrome120', 'firefox128'],
    sourcemap: mode === 'development',
    minify: mode !== 'development',
    modulePreload: false, // the preload polyfill injects inline code, which the extension CSP forbids
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        panel: resolve(import.meta.dirname, 'panel.html'),
        workspace: resolve(import.meta.dirname, 'workspace.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
      },
      output: {
        // The manifest points at background.js, so its name must not be hashed.
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
}));
