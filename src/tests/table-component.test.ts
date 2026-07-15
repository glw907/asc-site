import { describe, expect, it } from 'vitest';
import { createRenderer } from '@glw907/cairn-cms';
import { ascRegistry } from '$theme/markdown/components';

const { renderMarkdown } = createRenderer(ascRegistry);

const TABLE_BODY = ['| Rank | Boat |', '| --- | --- |', '| 1 | Windrose |'].join('\n');

describe(':::table wrapper component', () => {
  it('renders a figure wrapping the table in the chassis table-scroll region', async () => {
    const md = ['::::table{variant="results"}', TABLE_BODY, '::::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('class="asc-table asc-table-results"');
    expect(html).toContain('<figure');
    expect(html).toContain('class="table-scroll"');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Rank</th>');
    expect(html).toContain('<td>Windrose</td>');
  });

  it('renders the fees and gear variant classes', async () => {
    const fees = await renderMarkdown(['::::table{variant="fees"}', TABLE_BODY, '::::'].join('\n'));
    expect(fees).toContain('class="asc-table asc-table-fees"');
    const gear = await renderMarkdown(['::::table{variant="gear"}', TABLE_BODY, '::::'].join('\n'));
    expect(gear).toContain('class="asc-table asc-table-gear"');
  });

  it('renders an authored caption as a figcaption', async () => {
    const md = [
      '::::table{variant="results"}',
      ':::caption',
      'Race results, June 2026.',
      ':::',
      '',
      TABLE_BODY,
      '::::',
    ].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('<figcaption>');
    expect(html).toContain('Race results, June 2026.');
  });

  it('omits the figcaption when no caption is authored', async () => {
    const md = ['::::table{variant="results"}', TABLE_BODY, '::::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).not.toContain('<figcaption>');
  });

  it('renders an authored legend as a trailing div', async () => {
    const md = [
      '::::table{variant="results"}',
      TABLE_BODY,
      '',
      ':::legend',
      'DNF, did not finish.',
      ':::',
      '::::',
    ].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('class="asc-table-legend"');
    expect(html).toContain('DNF, did not finish.');
  });

  it('omits the legend div when none is authored', async () => {
    const md = ['::::table{variant="results"}', TABLE_BODY, '::::'].join('\n');
    const html = await renderMarkdown(md);
    expect(html).not.toContain('asc-table-legend');
  });

  it('places the figcaption before the table-scroll region and the legend after it', async () => {
    const md = [
      '::::table{variant="results"}',
      ':::caption',
      'Race results.',
      ':::',
      '',
      TABLE_BODY,
      '',
      ':::legend',
      'DNF, did not finish.',
      ':::',
      '::::',
    ].join('\n');
    const html = await renderMarkdown(md);
    const captionIndex = html.indexOf('<figcaption>');
    const scrollIndex = html.indexOf('class="table-scroll"');
    const legendIndex = html.indexOf('class="asc-table-legend"');
    expect(captionIndex).toBeGreaterThan(-1);
    expect(scrollIndex).toBeGreaterThan(captionIndex);
    expect(legendIndex).toBeGreaterThan(scrollIndex);
  });
});
