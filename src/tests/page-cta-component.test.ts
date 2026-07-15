import { describe, expect, it } from 'vitest';
import { createRenderer } from '@glw907/cairn-cms';
import { ascRegistry } from '$theme/markdown/components';

const { renderMarkdown } = createRenderer(ascRegistry);

describe(':::page-cta closer', () => {
  it('renders a lead, body, and a secondary action by default', async () => {
    const md = [
      '::::page-cta[Not finding what you need?]',
      "We're real people, happy to talk sailing.",
      '',
      ':::cta-action[Email us]{href="/contact/"}',
      ':::',
      '::::',
    ].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('class="page-cta not-prose"');
    expect(html).toContain('class="page-cta-lead"');
    expect(html).toContain('Not finding what you need?');
    expect(html).toContain('class="page-cta-body"');
    expect(html).toContain("We're real people, happy to talk sailing.");
    expect(html).toContain('class="page-cta-actions"');
    expect(html).toContain('class="cta-link cta-secondary"');
    expect(html).toContain('href="/contact/"');
    expect(html).toContain('Email us');
  });

  it('renders a primary action in the fireweed budget class when kind="primary" is given', async () => {
    const md = ['::::page-cta[Ready to join?]', ':::cta-action[Apply now]{href="/join/" kind="primary"}', ':::', '::::'].join(
      '\n',
    );
    const html = await renderMarkdown(md);
    expect(html).toContain('class="cta-link asc-cta-btn"');
    expect(html).not.toContain('cta-secondary');
  });

  it('renders exactly the actions authored, no more', async () => {
    const md = [
      '::::page-cta[Ready to join?]',
      ':::cta-action[Apply now]{href="/join/" kind="primary"}',
      ':::',
      ':::cta-action[Ask a question]{href="/contact/"}',
      ':::',
      '::::',
    ].join('\n');
    const html = await renderMarkdown(md);
    expect((html.match(/class="cta-link /g) ?? []).length).toBe(2);
  });

  it('omits the body wrapper when no body copy is authored', async () => {
    const md = ['::::page-cta[Ready to join?]', ':::cta-action[Apply now]{href="/join/" kind="primary"}', ':::', '::::'].join(
      '\n',
    );
    const html = await renderMarkdown(md);
    expect(html).not.toContain('page-cta-body');
  });

  it('omits the actions row when no actions are authored', async () => {
    const md = ['::::page-cta[Not finding what you need?]', "We're real people.", '::::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).not.toContain('page-cta-actions');
  });
});
