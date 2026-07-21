<!-- @component
The admin toolkit's expand-in-place table row (docs/2026-07-20-admin-toolkit-research-survey.md,
"ExpandableRow" -- confirmed, tier C; the exact shape is deliberately left open for the Classes
pass to pick among four systems' variants, so this first shape favors the plainest accessible
option over a bespoke one). General contract: a summary `<tr>` plus a conditional panel `<tr>`
whose single spanning cell receives the row's own datum, so the panel snippet never needs a
closure over the row it belongs to.

Fully controlled, matching this toolkit's own `Pagination` convention (`page`/`onPageChange`)
rather than owning internal expand state: `expanded` and `onToggle` are props, not `$state`. The
"one row expanded at a time" contract lives in the *caller* holding a single expanded-row id and
deriving `expanded={expandedId === row.id}` for every instance -- the same pattern a radio group's
"one selected at a time" contract rides on `checked`, never on the radio input's own state. A
controlled row also composes cleanly with `AdminTable`'s `rowCount`/empty-state props without this
component needing to know about its siblings.

Keyboard operability rides the native `<button>` element's own Enter/Space activation -- no bespoke
`onkeydown` handler reinvents what the browser already does correctly for a real button. The whole
summary `<tr>` also carries a mouse-only `onclick` convenience (the design spec's "clicking a row
expands it in place"); the explicit trailing button is the one control carrying `aria-expanded` and
the accessible name, which is why summary cells should stay non-interactive (plain text, a
`StatusChip`, and similar) -- an interactive control nested inside the row would double-handle the
click. Per-row actions belong in the panel, never inline in a summary cell, for the same reason.

**The trigger cell is `position: sticky; right: 0`** (the Members pass coherence round).
`AdminTable`'s own horizontal-scroll fallback means a summary row wider than its viewport scrolls
rather than wraps (that component's own contract); without this, a narrow viewport strands the
trigger off-screen with no visible cue that a row even expands. Sticky keeps the trigger inside the
visible viewport at every scroll position, including the unscrolled one, with no JS of its own --
the caller never opts into this, it is unconditional. The sticky cell carries its own opaque
background (`--color-base-100`) rather than the zebra stripe's own alternating color: a pinned
column showing a small, constant seam against the scrolling content underneath it is the standard
frozen-column pattern, not a bug.

The panel cell stays a genuine `<td colspan>` -- deliberately, not `display: block` -- because a
spanning cell removed from table layout still resolves its width against an anonymous fixup row
the browser generates for a block-display child of a `<tbody>`, and that anonymous row's own width
is *still* driven by the table's real column widths (verified empirically: `width: 100%` on the
un-tabled cell kept measuring the summary rows' own narrower first-two-column width, not the table
wrap's full width, at every viewport). A caller that wants the panel's own internal grid to collapse
at a narrow width needs the table itself to never need horizontal scroll in the first place -- see
Members' own `+page.svelte` for the pattern (hiding lower-priority summary columns under a
breakpoint so the whole row, panel included, fits the viewport with nothing to scroll).
-->
<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Whether this row is currently expanded. Controlled by the caller; see this component's own
     *  header comment for the one-row-at-a-time contract. */
    expanded: boolean;
    /** Called when the trigger control, or the summary row itself, is activated. The caller flips
     *  its own expanded-id state in response; this component holds no state of its own. */
    onToggle: () => void;
    /** The row's own datum, forwarded into `panel` so it doesn't need a closure over the row. */
    datum: T;
    /** How many columns the panel's single spanning cell should cover -- the summary row's own
     *  `<td>` count, including the trailing trigger cell this component renders. */
    colspan: number;
    /** The summary row's `<td>` cells (this component supplies the wrapping `<tr>` and the
     *  trailing trigger cell; the row stays single-line per `AdminTable`'s own contract). */
    summary: Snippet;
    /** The panel's content, rendered inside one spanning cell while `expanded` is `true`. Receives
     *  `datum`. */
    panel: Snippet<[T]>;
    /** An accessible name for the trigger control (e.g. `"Expand the Alvarez household"`), since a
     *  chevron glyph alone carries no text for assistive tech. */
    triggerLabel: string;
  }

  let { expanded, onToggle, datum, colspan, summary, panel, triggerLabel }: Props = $props();
</script>

<tr class="toolkit-expandable-row-summary" onclick={onToggle}>
  {@render summary()}
  <td class="toolkit-expandable-row-trigger-cell">
    <button
      type="button"
      class="btn btn-ghost btn-xs toolkit-expandable-row-trigger"
      aria-expanded={expanded}
      aria-label={triggerLabel}
      onclick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <span aria-hidden="true" class="toolkit-expandable-row-chevron">{expanded ? '▾' : '▸'}</span>
    </button>
  </td>
</tr>
{#if expanded}
  <tr class="toolkit-expandable-row-panel">
    <td {colspan}>
      {@render panel(datum)}
    </td>
  </tr>
{/if}

<style>
  .toolkit-expandable-row-summary {
    cursor: pointer;
  }

  .toolkit-expandable-row-trigger-cell {
    width: 1px;
    white-space: nowrap;
    text-align: right;
    /* Always reachable, even when the row is wider than the viewport: see this component's own
       header comment above. */
    position: sticky;
    right: 0;
    background-color: var(--color-base-100);
  }

  .toolkit-expandable-row-chevron {
    display: inline-block;
    font-size: 0.75rem;
  }

  .toolkit-expandable-row-panel td {
    white-space: normal;
    padding: 1rem;
  }
</style>
