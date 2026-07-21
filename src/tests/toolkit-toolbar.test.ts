import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import ListToolbar, {
  computeAppliedFilters,
  computeCountLine,
  type ListToolbarFilter,
} from '$admin-club/toolkit/ListToolbar.svelte';

function standingFilter(overrides: Partial<ListToolbarFilter> = {}): ListToolbarFilter {
  return {
    id: 'standing',
    label: 'Standing',
    options: [
      { value: 'all', label: 'All' },
      { value: 'overdue', label: 'Overdue' },
      { value: 'former', label: 'Former' },
    ],
    value: 'all',
    onChange: vi.fn(),
    ...overrides,
  };
}

describe('computeAppliedFilters', () => {
  it('omits a filter still at its default value', () => {
    expect(computeAppliedFilters([standingFilter()])).toEqual([]);
  });

  it('produces a pill for a filter away from its default, labeled from the matching option', () => {
    expect(computeAppliedFilters([standingFilter({ value: 'overdue' })])).toEqual([
      { id: 'standing', label: 'Overdue' },
    ]);
  });

  it('the applied/removed round-trip: setting back to the default value clears the pill again', () => {
    const applied = computeAppliedFilters([standingFilter({ value: 'former' })]);
    expect(applied).toEqual([{ id: 'standing', label: 'Former' }]);

    const removed = computeAppliedFilters([standingFilter({ value: 'all' })]);
    expect(removed).toEqual([]);
  });

  it('honors a non-default defaultValue', () => {
    const filter = standingFilter({ value: 'members', defaultValue: 'members', options: [
      { value: 'members', label: 'Members only' },
      { value: 'archived', label: 'Archived' },
    ] });
    expect(computeAppliedFilters([filter])).toEqual([]);
    expect(computeAppliedFilters([{ ...filter, value: 'archived' }])).toEqual([
      { id: 'standing', label: 'Archived' },
    ]);
  });

  it('falls back to the raw value when no option matches it', () => {
    expect(computeAppliedFilters([standingFilter({ value: 'stale-value' })])).toEqual([
      { id: 'standing', label: 'stale-value' },
    ]);
  });

  it('produces one pill per applied filter, in the filters array order', () => {
    const holdings = standingFilter({
      id: 'holdings',
      label: 'Holdings',
      value: 'holding',
      options: [
        { value: 'all', label: 'All' },
        { value: 'holding', label: 'Holding assets' },
      ],
    });
    expect(computeAppliedFilters([standingFilter({ value: 'overdue' }), holdings])).toEqual([
      { id: 'standing', label: 'Overdue' },
      { id: 'holdings', label: 'Holding assets' },
    ]);
  });
});

describe('computeCountLine', () => {
  it('states the bare count and item label with no applied filters', () => {
    expect(computeCountLine(149, 'households', [])).toBe('149 households');
  });

  it('appends every applied-filter label, in order, joined by a middle dot', () => {
    expect(computeCountLine(12, 'households', ['overdue', 'holding assets'])).toBe(
      '12 households · overdue · holding assets',
    );
  });

  it('states a zero count rather than omitting the line', () => {
    expect(computeCountLine(0, 'households', ['former'])).toBe('0 households · former');
  });
});

describe('ListToolbar', () => {
  it('renders the search box with its accessible name and no autofocus by default', () => {
    const { body } = render(ListToolbar, {
      props: { search: '', onSearch: () => {}, count: 149, itemLabel: 'households' },
    });
    expect(body).toContain('aria-label="Search"');
    expect(body).not.toContain('autofocus');
  });

  it('renders autofocus on the search box when asked', () => {
    const { body } = render(ListToolbar, {
      props: { search: '', onSearch: () => {}, autofocus: true, count: 149, itemLabel: 'households' },
    });
    expect(body).toMatch(/<input[^>]*autofocus/);
  });

  it('renders a promoted filter as a select in the band, not behind the overflow disclosure', () => {
    const { body } = render(ListToolbar, {
      props: {
        search: '',
        onSearch: () => {},
        filters: [standingFilter()],
        count: 149,
        itemLabel: 'households',
      },
    });
    expect(body).toContain('aria-label="Standing"');
    expect(body).not.toContain('dropdown-content');
  });

  it('renders a non-promoted filter behind the overflow disclosure only', () => {
    const { body } = render(ListToolbar, {
      props: {
        search: '',
        onSearch: () => {},
        filters: [standingFilter({ promoted: false })],
        count: 149,
        itemLabel: 'households',
      },
    });
    expect(body).toContain('More filters');
    expect(body).toContain('dropdown-content');
    expect(body).toContain('aria-label="Standing"');
  });

  it('gives the overflow disclosure real toggle semantics: aria-expanded and aria-controls point at a matching id, closed on first render', () => {
    const { body } = render(ListToolbar, {
      props: {
        search: '',
        onSearch: () => {},
        filters: [standingFilter({ promoted: false })],
        count: 149,
        itemLabel: 'households',
      },
    });
    const trigger = body.match(/<button[^>]*aria-controls="([^"]+)"[^>]*>More filters<\/button>/);
    expect(trigger).not.toBeNull();
    const [, controlsId] = trigger!;
    expect(body).toContain(`aria-expanded="false" aria-controls="${controlsId}"`);
    expect(body).toContain(`id="${controlsId}"`);
    expect(body).not.toContain('dropdown-open');
  });

  it('renders exactly one primary action, right-aligned in its own toolbar-primary class', () => {
    const { body } = render(ListToolbar, {
      props: {
        search: '',
        onSearch: () => {},
        primaryAction: { label: 'Add household', onClick: () => {} },
        count: 149,
        itemLabel: 'households',
      },
    });
    const matches = body.match(/toolkit-toolbar-primary/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(body).toContain('Add household');
  });

  it('renders no primary action markup when none is given', () => {
    const { body } = render(ListToolbar, {
      props: { search: '', onSearch: () => {}, count: 149, itemLabel: 'households' },
    });
    expect(body).not.toContain('toolkit-toolbar-primary');
  });

  it('renders an applied-filter pill in the neutral badge tone with a labeled remove control', () => {
    const { body } = render(ListToolbar, {
      props: {
        search: '',
        onSearch: () => {},
        filters: [standingFilter({ value: 'overdue' })],
        count: 12,
        itemLabel: 'households',
      },
    });
    expect(body).toContain('badge-neutral');
    expect(body).toContain('Overdue');
    expect(body).toContain('aria-label="Remove Overdue filter"');
  });

  it('renders no pills row when every filter is at its default', () => {
    const { body } = render(ListToolbar, {
      props: {
        search: '',
        onSearch: () => {},
        filters: [standingFilter()],
        count: 149,
        itemLabel: 'households',
      },
    });
    expect(body).not.toContain('toolkit-toolbar-pills');
  });

  it('states the applied scope in the count line, matching computeCountLine', () => {
    const { body } = render(ListToolbar, {
      props: {
        search: '',
        onSearch: () => {},
        filters: [standingFilter({ value: 'overdue' })],
        count: 12,
        itemLabel: 'households',
      },
    });
    expect(body).toContain('12 households · Overdue');
  });
});
