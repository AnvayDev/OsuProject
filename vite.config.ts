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
  // ffmpeg.wasm starts its worker from a URL relative to its own module, which pre-bundling would move.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] },
  // bench.html is the measurement page (docs/GAMEPLAY-PLAN.md §2); it is built and deployed next to the game.
  build: {
    target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), bench: fileURLToPath(new URL('./bench.html', import.meta.url)) } },
  },
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
