<!-- @component
The admin toolkit's one state-vocabulary chip (docs/2026-07-20-admin-toolkit-research-survey.md,
"Chip" -- reshaped into three components; StatusChip is the only surface the toolkit lets carry a
semantic status color, distinct from a future TagChip's category colors and CountBadge's counts).
General contract: `tone` carries the full daisyUI semantic vocabulary (neutral/info/success/
warning/danger), and the standing vocabulary (Current/Overdue/Former) is this chip's first
client, not its ceiling -- the tone-to-standing mapping lives with the consumer
(`member-format.ts`'s own record), never inside this component.

Assembles from two daisyUI 5 primitives kept in cairn's admin CSS safelist: `badge` (the pill
shape) carries no color of its own here -- every rendered tone reads through the small `status`
dot instead, because `badge-error`/`badge-success` do not compile in the packaged
`cairn-admin.css` (verified against the built sheet; only `badge-info`/`badge-warning`/
`badge-neutral`/`badge-primary` do), while every `status-<tone>` modifier the safelist lists does.
A dot-carries-color design also sidesteps auditing five separate badge-fill/text contrast pairs.

**`badge-outline`, not `badge-ghost` (the Members pass coherence round).** `badge-ghost` compiles
to an explicit `background-color`/`border-color` of `--color-base-200` -- one of `AdminTable`'s own
two zebra stripe colors -- so a ghost chip melts into whichever row happens to share that exact
color and only reads as a pill on the other stripe. `badge-outline` has no fill at all (`--badge-bg:
transparent`) and no `--badge-color` custom property is ever set here (no `badge-<tone>` modifier
class is applied), so its `border-color: currentColor` resolves to the inherited text color -- a
border that reads the same, consistently, against either zebra stripe or no zebra at all.

Padding, truncation, and the min/max width live in this component's own scoped CSS rather than as
Tailwind utility classes: `/admin/**` routes load only cairn's precompiled `cairn-admin.css` (no
Tailwind build of this site's own source ever touches an admin route), so an arbitrary utility
string like `min-w-[6rem]` would compile to nothing and silently fail to render -- the same trap
`/admin/club/+page.svelte`'s own "Scoped styles, not daisyUI stats" comment already names. Owning
its own width bounds is also the fix for the walkthrough's literal Geoff reaction, "text overflows
the pills" (docs/2026-07-20-admin-toolkit-catalog.md): a hand-rolled chip had no truncation or
minimum width to keep a column's chips a consistent size.
-->
<script module lang="ts">
  /** The chip's full semantic tone vocabulary. `danger` reads as daisyUI's `error` semantic under
   *  the hood; the toolkit's own public vocabulary stays framework-neutral. */
  export type StatusChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

  /** Two named sizes, matching the density doctrine's own `xs`/`sm` tier names
   *  (`AdminTable`'s `table-xs`/`table-sm`) rather than a bespoke scale. */
  export type StatusChipSize = 'xs' | 'sm';

  /** The daisyUI `status-<tone>` suffix for each public tone. Exported so a future legend
   *  component can render the identical dot color beside its own explanatory text without
   *  duplicating this mapping -- the "legend hook" the toolkit's contract calls for. */
  export const STATUS_CHIP_DOT_CLASS: Record<StatusChipTone, string> = {
    neutral: 'status-neutral',
    info: 'status-info',
    success: 'status-success',
    warning: 'status-warning',
    danger: 'status-error',
  };
</script>

<script lang="ts">
  interface Props {
    /** The chip's semantic tone. The consumer maps its own vocabulary onto this one (e.g. a
     *  household's Current/Overdue/Former standing); StatusChip carries no domain knowledge. */
    tone: StatusChipTone;
    /** The chip's visible text. */
    label: string;
    /** Defaults to `'sm'`. */
    size?: StatusChipSize;
    /** Optional explanatory text for a tone a label alone doesn't fully carry (e.g. "full member
     *  benefits continue during the grace window"). Surfaces as a native tooltip and folds into
     *  the chip's accessible name; omit for a self-explanatory label. */
    legend?: string;
  }

  let { tone, label, size = 'sm', legend }: Props = $props();

  const dotSizeClass = $derived(size === 'xs' ? 'status-xs' : 'status-sm');
</script>

<span
  class="badge badge-outline {size === 'xs' ? 'badge-xs' : 'badge-sm'} status-chip"
  title={legend}
  aria-label={legend ? `${label}: ${legend}` : undefined}
>
  <span class="status {STATUS_CHIP_DOT_CLASS[tone]} {dotSizeClass}" aria-hidden="true"></span>
  <span class="status-chip-label">{label}</span>
</span>

<style>
  /* Layout only: shape and color come from the daisyUI `badge`/`status` classes above. Values
     stay literal (not design tokens) because this scoped block is the toolkit's one place free of
     the compiled-admin-CSS constraint documented above -- there is no shared token to reach for
     here that survives an `/admin/**` route. */
  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 5rem;
    max-width: 10rem;
  }

  .status-chip-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
