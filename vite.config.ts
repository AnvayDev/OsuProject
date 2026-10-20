import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@fw': fileURLToPath(new URL('./src/framework', import.meta.url)),
      '@game': fileURLToPath(new URL('./src/game', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000 },
  server: {
    // dev-only proxies mirroring vercel.json rewrites
    proxy: {
      '/mirror/catboy': { target: 'https://catboy.best', changeOrigin: true, rewrite: (p) => p.replace(/^\/mirror\/catboy/, '') },
      '/mirror/osudirect': { target: 'https://osu.direct', changeOrigin: true, rewrite: (p) => p.replace(/^\/mirror\/osudirect/, '') },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
  },
} as any);
