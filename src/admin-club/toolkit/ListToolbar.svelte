<!-- @component
The admin toolkit's list-header band (docs/2026-07-20-admin-toolkit-research-survey.md,
"ListToolbar" -- confirmed, tier C, a layout recipe over `input`/`select`/`btn`; "Polaris
applied-filters-as-pills is the reference detail"). General contract: search, any number of
promoted filters, an overflow disclosure for filters a screen chooses not to promote (present in
the contract even when a consumer, like Members, promotes every filter and never renders it),
exactly one right-aligned primary action, applied-filter pills with a remove control, and a
count line that always states its own filter scope -- the toolbar band that replaces the "loose
two-row cluster" the walkthrough caught on the fixture Members screen.

Every prop is a controlled value plus a change callback, the same fully-controlled convention
`Pagination`/`ExpandableRow` already establish in this toolkit (a search box's own text, a
filter's own selected value, and "which row is expanded" are all state the caller owns, never
this component). `ListToolbarFilter.onChange` and `primaryAction.onClick` carry no domain
knowledge of what a filter means or what an action does; the standing/holdings/role/class
vocabulary the design spec names is entirely the Members screen's own filter definitions passed
in, never hardcoded here.

Applied-filter pills render in the toolkit's one neutral badge tone (`badge-neutral`), never an
alarm color, per the survey's action-discipline standard: an applied filter is a normal state of
the list, not a warning. The pill's own text reads from the filter's own matching option label,
so a filter's vocabulary (and its casing) is entirely the consumer's choice.

Assembles from daisyUI 5 primitives already compiled into the packaged `cairn-admin.css`, none of
them newly safelisted: `input`/`input-sm`, `select`/`select-sm`, `btn`/`btn-sm`/`btn-primary`/
`btn-outline`, `dropdown`/`dropdown-content`/`dropdown-open`/`menu` (the overflow disclosure, the
same assembly the survey's RowActions entry names for a row's own overflow menu, now driven by a
real `$state` toggle rather than the bare `:focus-within` daisyUI gives every `.dropdown` for free
-- see this file's own script section), and `badge`/`badge-neutral`/`badge-sm` for the pills.
**Verified against the built `cairn-admin.css`:** every one of these already compiles from cairn's
own admin usage (the same methodology `StatusChip`'s own header comment explains), so this
component needs no safelist addition. Pill layout, the controls grid, and the count line's muted
color live in this component's own scoped CSS, per the compiled-CSS constraint the toolkit README
documents -- an unverified Tailwind utility string would compile to nothing on an `/admin/**` route.

The band's two children -- the controls cluster and the primary action -- share one flex line
whenever both fit; the controls cluster is a CSS grid, not a wrapped flex row (the Members pass
coherence round -- see this component's own `.toolkit-toolbar-controls` section below), so a wide
viewport never wraps the band itself and a wrapped narrower one keeps every control's columns
aligned across lines. Only once the controls cluster's own first-line content plus the action's own
width can no longer share the line does the action drop to a line of its own, where an `auto` left
margin still pushes it to the band's right edge (a lone flex item on its own line still resolves an
`auto` margin against that line, independent of the other line's content) -- the fix for a narrow
viewport, where a fixed-width action sharing a line with even one shrunk-down control would
otherwise overlap it rather than wrap cleanly.
-->
<script module lang="ts">
  /** One option in a `ListToolbarFilter`'s own vocabulary. */
  export interface ListToolbarFilterOption {
    value: string;
    label: string;
  }

  /**
   * One filter control. `promoted` (default `true`) chooses whether the control renders directly
   * in the toolbar band or behind the overflow disclosure; either way, a non-default `value`
   * produces an applied-filter pill and counts toward the count line's scope. `defaultValue`
   * (default `'all'`) is the value that means "no filter applied" -- the value the filter resets
   * to when its pill is removed.
   */
  export interface ListToolbarFilter {
    /** Stable identity, used for Svelte keying and to find the filter a pill's remove targets. */
    id: string;
    /** The control's accessible name (e.g. "Standing"). Never rendered as visible chrome; the
     *  toolbar band stays compact by relying on the options' own labels and the count line to
     *  carry meaning, the same way the fixture screen's own search box used an `aria-label`
     *  rather than a visible "Search" caption. */
    label: string;
    options: ListToolbarFilterOption[];
    /** The filter's current value, one of `options`' own values. */
    value: string;
    /** Called with the new value on every change, including a pill's own remove control (which
     *  calls this with `defaultValue`). */
    onChange: (value: string) => void;
    /** The "no filter applied" value. Defaults to `'all'`. */
    defaultValue?: string;
    /** Whether this filter renders in the band directly, or behind the overflow disclosure.
     *  Defaults to `true`. */
    promoted?: boolean;
  }

  /** The toolbar's one primary action, always right-aligned. */
  export interface ListToolbarAction {
    label: string;
    onClick: () => void;
  }

  /** One rendered applied-filter pill. */
  export interface AppliedFilterPill {
    id: string;
    label: string;
  }

  /**
   * Every filter currently away from its own default value, in the order given, as a pill. A
   * filter's pill label reads from the matching option's own `label` (falling back to the raw
   * `value` if the options list doesn't carry a match, so a stale or externally-set value never
   * renders a blank pill). Exported so the round-trip (a filter applied, then removed) is unit
   * tested against this pure function directly, the same way `Pagination`'s own windowing math is.
   */
  export function computeAppliedFilters(filters: ListToolbarFilter[]): AppliedFilterPill[] {
    const pills: AppliedFilterPill[] = [];
    for (const filter of filters) {
      const defaultValue = filter.defaultValue ?? 'all';
      if (filter.value === defaultValue) continue;
      const option = filter.options.find((candidate) => candidate.value === filter.value);
      pills.push({ id: filter.id, label: option?.label ?? filter.value });
    }
    return pills;
  }

  /**
   * The scope-stating count line's own copy pattern: `"<count> <itemLabel>"`, followed by every
   * applied-filter label joined with a middle dot (`"12 households · Overdue · Holding assets"`).
   * With no applied filters, the line is just the bare count and item label -- the count line
   * always renders, but it only ever states a scope beyond "everything" when a filter is actually
   * applied.
   */
  export function computeCountLine(count: number, itemLabel: string, appliedLabels: string[]): string {
    return [`${count} ${itemLabel}`, ...appliedLabels].join(' · ');
  }
</script>

<script lang="ts">
  interface Props {
    /** The search box's current text. */
    search: string;
    /** Called with the new text on every input change. */
    onSearch: (value: string) => void;
    /** The search box's accessible name and placeholder. Defaults to `'Search'`. */
    searchLabel?: string;
    /** Whether the search box receives focus on mount -- the toolbar's autofocus contract for a
     *  screen that wants the cursor in search on page open. Defaults to `false`. */
    autofocus?: boolean;
    /** Every filter, promoted and overflow alike, in the order each group renders. */
    filters?: ListToolbarFilter[];
    /** The overflow disclosure's own trigger label. Defaults to `'More filters'`. Only rendered
     *  when at least one filter opts out of promotion. */
    overflowLabel?: string;
    /** The toolbar's one right-aligned action. Omit for a toolbar with no primary action. */
    primaryAction?: ListToolbarAction;
    /** The count line's own count (e.g. the number of households the current filters match). */
    count: number;
    /** The count line's plural noun (e.g. `'households'`). */
    itemLabel: string;
  }

  let {
    search,
    onSearch,
    searchLabel = 'Search',
    autofocus = false,
    filters = [],
    overflowLabel = 'More filters',
    primaryAction,
    count,
    itemLabel,
  }: Props = $props();

  const promotedFilters = $derived(filters.filter((filter) => filter.promoted !== false));
  const overflowFilters = $derived(filters.filter((filter) => filter.promoted === false));
  const appliedPills = $derived(computeAppliedFilters(filters));
  const countLine = $derived(
    computeCountLine(count, itemLabel, appliedPills.map((pill) => pill.label)),
  );

  function removeFilter(pillId: string) {
    const filter = filters.find((candidate) => candidate.id === pillId);
    filter?.onChange(filter.defaultValue ?? 'all');
  }

  // The overflow disclosure's own open state (the Members pass coherence round): a real toggle
  // rather than the bare `:focus-within` daisyUI already gives `.dropdown` for free, so the
  // trigger can carry `aria-expanded`/`aria-controls` that actually reflects whether the content
  // is showing, and a click (not just a focus move) opens and closes it.
  let overflowOpen = $state(false);
  const uid = $props.id();
  const overflowId = `${uid}-overflow`;
</script>

<div class="toolkit-toolbar">
  <div class="toolkit-toolbar-band">
    <div class="toolkit-toolbar-controls">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="search"
        class="input input-sm toolkit-toolbar-search"
        aria-label={searchLabel}
        placeholder={searchLabel}
        value={search}
        {autofocus}
        oninput={(event) => onSearch((event.currentTarget as HTMLInputElement).value)}
      />
      {#each promotedFilters as filter (filter.id)}
        <select
          class="select select-sm toolkit-toolbar-select"
          aria-label={filter.label}
          value={filter.value}
          onchange={(event) => filter.onChange((event.currentTarget as HTMLSelectElement).value)}
        >
          {#each filter.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      {/each}
      {#if overflowFilters.length > 0}
        <div class="dropdown" class:dropdown-open={overflowOpen}>
          <button
            type="button"
            class="btn btn-sm btn-outline"
            aria-expanded={overflowOpen}
            aria-controls={overflowId}
            onclick={() => (overflowOpen = !overflowOpen)}
          >{overflowLabel}</button>
          <div id={overflowId} class="dropdown-content menu toolkit-toolbar-overflow">
            {#each overflowFilters as filter (filter.id)}
              <label class="toolkit-toolbar-overflow-field">
                <span>{filter.label}</span>
                <select
                  class="select select-sm"
                  aria-label={filter.label}
                  value={filter.value}
                  onchange={(event) => filter.onChange((event.currentTarget as HTMLSelectElement).value)}
                >
                  {#each filter.options as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
            {/each}
          </div>
        </div>
      {/if}
    </div>
    {#if primaryAction}
      <button
        type="button"
        class="btn btn-primary btn-sm toolkit-toolbar-primary"
        onclick={primaryAction.onClick}
      >
        {primaryAction.label}
      </button>
    {/if}
  </div>
  {#if appliedPills.length > 0}
    <div class="toolkit-toolbar-pills">
      {#each appliedPills as pill (pill.id)}
        <span class="badge badge-neutral badge-sm toolkit-toolbar-pill">
          {pill.label}
          <button
            type="button"
            class="toolkit-toolbar-pill-remove"
            aria-label={`Remove ${pill.label} filter`}
            onclick={() => removeFilter(pill.id)}
          >
            &times;
          </button>
        </span>
      {/each}
    </div>
  {/if}
  <p class="toolkit-toolbar-count">{countLine}</p>
</div>

<style>
  /* Layout only: shape and color come from the daisyUI classes above, except the pills' neutral
     badge tone (already carried by `badge-neutral` itself) and the muted count line, matching
     `Pagination`'s own range-line color. Values stay literal where there's no shared token that
     survives an `/admin/**` route, per the compiled-CSS constraint the toolkit README documents. */
  .toolkit-toolbar {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .toolkit-toolbar-band {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.75rem;
  }

  /* A grid, not a wrapped flex row (the Members pass coherence round): every promoted select
     shares one repeating column track, so a second wrapped line's controls land under the same
     column boundaries the first line established instead of an organically-sized, misaligned
     row. `auto-fill` keeps the track count viewport-driven (fewer, wider columns on a narrow
     screen; more on a wide one) without any media query of this component's own. */
  .toolkit-toolbar-controls {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    flex: 1 1 auto;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  /* Two columns wide: long enough to show the whole placeholder ("Search by name, standing, or
     phone") without clipping, while still landing on the same column grid every other control
     uses. */
  .toolkit-toolbar-search {
    grid-column: span 2;
    width: 100%;
    /* Strips the browser's own `type="search"` chrome (a clear button, and on some engines a
       second, separately-drawn focus ring that layers on top of `.input`'s own themed one,
       reading as a doubled outline): `.input:focus`'s outline below then becomes the only ring a
       reader sees. */
    appearance: none;
  }

  .toolkit-toolbar-select {
    width: 100%;
  }

  .toolkit-toolbar-primary {
    flex-shrink: 0;
    margin-left: auto;
  }

  .toolkit-toolbar-overflow {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .toolkit-toolbar-overflow-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8125rem;
  }

  .toolkit-toolbar-pills {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }

  .toolkit-toolbar-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .toolkit-toolbar-pill-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.9375rem;
  }

  .toolkit-toolbar-count {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-muted);
  }
</style>
