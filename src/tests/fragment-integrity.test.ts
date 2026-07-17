import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { fragments } from '$chassis/content';
import { routes } from '$theme/public-routes';

// Closes three fragments-migration gaps (docs/2026-07-17-fragments-migration-design.md, probes
// P2/P3/P4) that today all pass check/test/build while being wrong for a real reader or editor:
//
// 1. A dangling `::include` 500s for a real visitor, but svelte.config.js's inherited
//    `prerender.handleHttpError: 'warn'` downgrades that 500 to a build warning (see its own
//    comment), so a broken include ships green.
// 2. Dropping the one-line `resolveFragment` forward in cairn.config.ts's `rendering.render`
//    leaves an `::include` directive unresolved: the engine's own `remarkResolveIncludes`
//    plugin is a no-op with no resolver (see resolve-include.js), so the raw directive text
//    renders straight to the public page with every gate still green.
// 3. Dropping the `fragments` glob from vite.config.ts's `cairnManifest()` plugin leaves the
//    committed manifest blind to a fragment the delivery glob (src/chassis/content.ts) still
//    serves: the admin picker and the rename/delete guards read the manifest, so they never see
//    the fragment the public build happily renders.
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readContentFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

const CONTENT_CONCEPT_DIRS = ['posts', 'pages', 'bulletins', 'notifications', 'fragments'];

/** Every `::include{fragment="<id>"}` reference across the whole content corpus, with the file it came from. */
function findIncludeReferences(): { file: string; fragmentId: string }[] {
  const includePattern = /::include\{fragment="([^"]+)"\}/g;
  const refs: { file: string; fragmentId: string }[] = [];
  for (const concept of CONTENT_CONCEPT_DIRS) {
    const dir = path.join(REPO_ROOT, 'src/content', concept);
    const files = readdirSync(dir).filter((name) => name.endsWith('.md'));
    for (const file of files) {
      const relativePath = `src/content/${concept}/${file}`;
      const body = readContentFile(relativePath);
      for (const match of body.matchAll(includePattern)) {
        refs.push({ file: relativePath, fragmentId: match[1] });
      }
    }
  }
  return refs;
}

describe('fragment integrity', () => {
  // Gap 1 (probe P4): a dangling include must fail loudly, not warn-and-ship. This scans the raw
  // content corpus directly (never the committed manifest, which gap 3 below tests on its own
  // terms) and checks each referenced id resolves to a real, published fragment.
  describe('every ::include names a published fragment', () => {
    const refs = findIncludeReferences();

    it('found at least one real ::include to exercise the check against', () => {
      expect(refs.length).toBeGreaterThan(0);
    });

    for (const { file, fragmentId } of refs) {
      it(`${file} includes "${fragmentId}", which exists and is not a draft`, () => {
        const fragment = fragments.byId(fragmentId);
        expect(fragment, `${file} references fragment "${fragmentId}", which does not exist`).toBeDefined();
        expect(fragment?.draft, `${file} references fragment "${fragmentId}", which is a draft`).toBe(false);
      });
    }
  });

  // Gap 2 (probe P2): render a real consuming page through the site's own configured render path
  // (routes.entryLoad, from $theme/public-routes.ts, the exact call the (site) catch-all route
  // makes) and prove the include actually spliced rather than passing the directive through as
  // literal text.
  describe('a real ::include resolves through the site render path', () => {
    it('splices the who-to-ask fragment into /members and leaves no raw directive text', async () => {
      const data = await routes.entryLoad({ url: new URL('https://dev.aksailingclub.org/members') });

      // Content unique to src/content/fragments/who-to-ask.md, absent from members.md itself:
      // proves the fragment's own body landed in the rendered output.
      expect(data.html).toContain('Sailing questions');
      expect(data.html).toContain('Something broken or missing');
      // The literal directive text a missing resolver would leave behind untouched.
      expect(data.html).not.toContain('::include{');
    });
  });

  // Gap 3 (probe P3): every fragment file on disk must appear in the committed manifest, so the
  // admin picker and the rename/delete guards (which read the manifest, not the delivery glob)
  // see what the public build already serves.
  describe('every fragment on disk is in the committed manifest', () => {
    const fragmentFiles = readdirSync(path.join(REPO_ROOT, 'src/content/fragments')).filter((name) =>
      name.endsWith('.md'),
    );
    const manifest = JSON.parse(readContentFile('src/content/.cairn/index.json')) as {
      entries: { id: string; concept: string }[];
    };
    const manifestFragmentIds = new Set(
      manifest.entries.filter((entry) => entry.concept === 'fragments').map((entry) => entry.id),
    );

    it('found at least one fragment file to exercise the check against', () => {
      expect(fragmentFiles.length).toBeGreaterThan(0);
    });

    for (const file of fragmentFiles) {
      const id = file.replace(/\.md$/, '');
      it(`${file} appears in the committed manifest's fragments entries`, () => {
        expect(manifestFragmentIds.has(id), `${file} is on disk but missing from src/content/.cairn/index.json`).toBe(
          true,
        );
      });
    }
  });
});
