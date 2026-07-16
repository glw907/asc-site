import { describe, expect, it } from 'vitest';
import { createRenderer } from '@glw907/cairn-cms';
import { ascRegistry } from '$theme/markdown/components';

const { renderMarkdown } = createRenderer(ascRegistry);

describe(':::availability status chip component', () => {
  it('renders the status as the shared availability-chip class', async () => {
    const md = [':::availability[Waitlist]', 'Multi-year wait is typical.', ':::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('<span class="asc-availability-chip">Waitlist</span>');
  });

  it('renders the optional note as an inline span joined to the chip by a middot, not a nested paragraph', async () => {
    const md = [':::availability[Waitlist]', 'Multi-year wait is typical.', ':::'].join('\n');
    const html = await renderMarkdown(md);
    const [statusLine] = html.match(/<p class="asc-availability"[^>]*>[\s\S]*?<\/p>/) ?? [];
    expect(statusLine).toBeDefined();
    // A nested <p> here would auto-close the outer paragraph in a real browser parse, hoisting
    // the note out as a detached sibling — the exact bug round 3 fixes.
    expect(statusLine).not.toMatch(/<p[^>]*>[\s\S]*<p/);
    expect(statusLine).toContain('<span class="asc-availability-chip">Waitlist</span>');
    expect(statusLine).toContain('<span class="asc-availability-note">Multi-year wait is typical.</span>');
    expect(statusLine).toContain('·');
  });

  it('omits the note entirely when none is authored', async () => {
    const md = [':::availability[Generally available]', ':::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('<span class="asc-availability-chip">Generally available</span>');
    expect(html).not.toContain('undefined');
  });
});
