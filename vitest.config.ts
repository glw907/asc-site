import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  // The delivery barrel (@glw907/cairn-cms/delivery) re-exports the CairnHead.svelte component
  // next to the pure data helpers, so any test that imports the content layer pulls a .svelte
  // file into the graph; the contact and donate islands (completion-pass manifest item 2) go
  // further and pull in a `.remote.ts` module, which only resolves `$app/server` through
  // SvelteKit's own Vite plugin. The full `sveltekit()` plugin (not the bare `svelte()` plugin)
  // covers both: it transforms `.svelte` files, resolves every `$app/*` virtual module, and reads
  // `$chassis`/`$theme` straight from svelte.config.js's own `kit.alias`, so this file no longer
  // restates them.
  plugins: [sveltekit()],
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
  },
});
