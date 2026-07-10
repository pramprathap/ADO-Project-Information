import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

/**
 * Azure DevOps loads a contribution's HTML inside a sandboxed iframe whose base
 * URL is not predictable across organisations. To avoid asset-path resolution
 * problems we inline every bundled asset (JS + CSS) into a single, self-contained
 * HTML file. This also satisfies the security requirement of not loading any
 * third-party JavaScript from a CDN at runtime — everything is bundled.
 */
export default defineConfig({
  root: 'src',
  base: './',
  server: {
    // Open the extension entry page directly (there is no index.html).
    open: '/project-information.html',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    // vite-plugin-singlefile inlines chunks/css; keep sourcemaps off for the
    // shipped artifact so we never leak source paths into the package.
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/project-information.html'),
    },
  },
  plugins: [react(), viteSingleFile()],
});
