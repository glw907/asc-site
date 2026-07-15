import { describe, expect, it } from 'vitest';
import { createRenderer } from '@glw907/cairn-cms';
import { ascRegistry } from '$theme/markdown/components';

const { renderMarkdown } = createRenderer(ascRegistry);

describe(':::steps numbered sequence component', () => {
  it('renders an ordered list of steps with title and body', async () => {
    const md = ['::::steps', ':::step[Arrive early]', 'Get to the dock by 9am.', ':::', '::::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('class="asc-steps"');
    expect(html).toContain('<ol');
    expect(html).toContain('class="asc-step"');
    expect(html).toContain('<li');
    expect(html).toContain('<span class="asc-step-title">Arrive early</span>');
    expect(html).toContain('class="asc-step-body"');
    expect(html).toContain('Get to the dock by 9am.');
  });

  it('renders the title slot text exactly as authored', async () => {
    const md = ['::::steps', ':::step[Rig the boat]', 'Raise the sail.', ':::', '::::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('<span class="asc-step-title">Rig the boat</span>');
  });

  it('renders a markdown body slot with a link', async () => {
    const md = [
      '::::steps',
      ':::step[Check in]',
      'Sign in at the [front desk](/visiting/).',
      ':::',
      '::::',
    ].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('<a href="/visiting/">front desk</a>');
  });

  it('preserves authored order across multiple steps', async () => {
    const md = [
      '::::steps',
      ':::step[Before you sail]',
      'Check the weather.',
      ':::',
      ':::step[At the dock]',
      'Tie off the lines.',
      ':::',
      ':::step[When you are done]',
      'Stow the gear.',
      ':::',
      '::::',
    ].join('\n');
    const html = await renderMarkdown(md);
    const firstIndex = html.indexOf('Before you sail');
    const secondIndex = html.indexOf('At the dock');
    const thirdIndex = html.indexOf('When you are done');
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(thirdIndex).toBeGreaterThan(secondIndex);
    expect((html.match(/class="asc-step"/g) ?? []).length).toBe(3);
  });

  it('never injects a literal step number into the markup', async () => {
    const md = ['::::steps', ':::step[First]', 'Body one.', ':::', ':::step[Second]', 'Body two.', ':::', '::::'].join(
      '\n',
    );
    const html = await renderMarkdown(md);
    expect(html).not.toMatch(/asc-step-title">\s*1\s*[.)]/);
    expect(html).not.toContain('<span class="asc-step-number">1</span>');
  });
});
