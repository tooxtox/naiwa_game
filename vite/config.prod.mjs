import { defineConfig } from 'vite';

// Based on the official Phaser Vite TypeScript template.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
    minify: 'terser',
    terserOptions: { compress: { passes: 2 }, mangle: true, format: { comments: false } },
  },
});
