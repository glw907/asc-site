import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  // The delivery barrel (@glw907/cairn-cms/delivery) re-exports the CairnHead.svelte component
  // next to the pure data helpers, so any test that imports the content layer pulls a .svelte
  // file into the graph. The Svelte plugin lets vitest transform it.
  plugins: [svelte()],
  resolve: {
    alias: {
      $chassis: resolve(__dirname, 'src/chassis'),
      $theme: resolve(__dirname, 'src/theme'),
      '$admin-club': resolve(__dirname, 'src/admin-club'),
    },
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
  },
});
