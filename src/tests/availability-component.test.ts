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

  it('renders the optional note alongside the chip in one line', async () => {
    const md = [':::availability[Waitlist]', 'Multi-year wait is typical.', ':::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('class="asc-availability"');
    expect(html).toContain('Multi-year wait is typical.');
  });

  it('omits the note entirely when none is authored', async () => {
    const md = [':::availability[Generally available]', ':::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('<span class="asc-availability-chip">Generally available</span>');
    expect(html).not.toContain('undefined');
  });
});
