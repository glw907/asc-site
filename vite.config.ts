import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { cairnManifest } from '@glw907/cairn-cms/vite';
import { defineConfig, type Plugin } from 'vite';
import { existsSync, createReadStream } from 'node:fs';
import { join } from 'node:path';

/** Serves /media/<slug>.<hash>.<ext> from .dev-media/ under `vite dev` only, ahead of the
 *  SvelteKit route. The engine's media route passes the request Headers as R2's `onlyIf`,
 *  which the dev platform proxy cannot serialize, so every media read 500s locally (filed
 *  upstream in cairn-cms; this middleware retires when the fixed engine ships). Populate the
 *  directory with `node scripts/sync-media-local.mjs`. Production builds never load this. */
function devMediaFallback(): Plugin {
  const dir = join(import.meta.dirname, '.dev-media');
  const types: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
  return {
    name: 'asc-dev-media-fallback',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/media', (req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const file = join(dir, name);
        if (!name || name.includes('/') || name.includes('..') || !existsSync(file)) return next();
        const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
        res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    devMediaFallback(),
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
        notifications: '/src/content/notifications/*.md',
      },
      manifestPath: '/src/content/.cairn/index.json',
    }),
  ],
});
