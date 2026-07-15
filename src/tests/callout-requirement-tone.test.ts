// The 'requirement' callout tone (2026-07-15 shared-components pass): marks a prerequisite the
// reader must already satisfy, quieter than warning and firmer than note.
import { describe, expect, it } from 'vitest';
import { createRenderer } from '@glw907/cairn-cms';
import { ascRegistry } from '$theme/markdown/components';

const { renderMarkdown } = createRenderer(ascRegistry);

describe(':::callout requirement tone', () => {
  it('renders the callout-requirement class on the aside', async () => {
    const md = [':::callout[Active Participating Member]{tone="requirement"}', 'Required to use club boats.', ':::'].join(
      '\n',
    );
    const html = await renderMarkdown(md);
    expect(html).toContain('class="callout callout-requirement"');
    expect(html).toContain('<p class="callout-title">Active Participating Member</p>');
    expect(html).toContain('Required to use club boats.');
  });

  it('is a registered tone option, alongside note/tip/warning/interim', () => {
    const def = ascRegistry.get('callout');
    const toneField = def?.attributes?.tone as { options?: readonly string[] } | undefined;
    expect(toneField?.options).toContain('requirement');
    expect(toneField?.options).toEqual(['note', 'tip', 'warning', 'interim', 'requirement']);
  });
});
