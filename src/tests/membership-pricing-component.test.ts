// B1 (2026-07-15 shared-components pass): join.md rendered the literal directive text
// `:::membership-pricing{tier="individual"}:::` instead of a live price. Root cause: the
// directive vocabulary is container-only (remark-directives.ts restores any text/leaf directive
// and any single-line container attempt to literal text), and `hydrate: true` always wraps
// build()'s output in a `<div>` island boundary (rehype-dispatch.ts), so `membership-pricing` can
// only ever render as its own properly fenced block, never inline after other prose on the same
// line. These tests guard the registry's own insertTemplate and the Join dues bullets' corrected
// structure against a regression to the old single-line form.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRenderer } from '@glw907/cairn-cms';
import { ascRegistry } from '$theme/markdown/components';

const { renderMarkdown } = createRenderer(ascRegistry);

describe('membership-pricing directive rendering', () => {
  it("renders the registry's own insertTemplate as a live-price island, not literal directive text", async () => {
    const def = ascRegistry.get('membership-pricing');
    const html = await renderMarkdown(def!.insertTemplate!);
    expect(html).not.toContain(':::membership-pricing');
    expect(html).toContain('data-cairn-island="membership-pricing"');
    expect(html).toContain('membership-pricing-fallback');
  });

  it('renders correctly nested under a bulleted list item, matching the Join dues bullets', async () => {
    const md = ['- **Individual:**', '  :::membership-pricing{tier="individual"}', '  :::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('<strong>Individual:</strong>');
    expect(html).toContain('data-cairn-island="membership-pricing"');
    expect(html).not.toContain(':::membership-pricing');
  });

  it('never parses when a directive follows other text on the same line (the original join.md bug)', async () => {
    const md = '- Individual: :::membership-pricing{tier="individual"}:::';
    const html = await renderMarkdown(md);
    expect(html).toContain(':::membership-pricing');
  });

  it("join.md's dues bullets render all three tiers as live-price islands, no literal directive text", async () => {
    const raw = readFileSync(new URL('../content/pages/join.md', import.meta.url), 'utf-8');
    const body = raw.split(/^---$/m).slice(2).join('---');
    const html = await renderMarkdown(body);
    expect(html).not.toContain(':::membership-pricing');
    expect((html.match(/data-cairn-island="membership-pricing"/g) ?? []).length).toBe(3);
  });
});
