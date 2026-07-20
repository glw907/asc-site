import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { cairnManifest } from '@glw907/cairn-cms/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    // Verify the committed content manifest against the corpus on every build, and back the
    // cairn-manifest regenerate bin. It fails the build outside the prerender lifecycle, so a
    // stale manifest fails red regardless of the inherited prerender.handleHttpError: 'warn'
    // policy.
    cairnManifest({
      configModule: '/src/theme/cairn.config.ts',
      content: {
        posts: '/src/content/posts/*.md',
        pages: '/src/content/pages/*.md',
        bulletins: '/src/content/bulletins/*.md',
        fragments: '/src/content/fragments/*.md',
        documents: '/src/content/documents/*.md',
      },
      manifestPath: '/src/content/.cairn/index.json',
    }),
  ],
});
