<!-- @component
One weighted "Needs your attention" row (mock D lines 1051-1062): an icon, a title, an optional
dollar amount, and the row's own real action button. Portal-scoped and licensed one-time, per the
design doc. `row.formAction` may point at a route other than this page's own (a live class-waitlist
offer's claim door lives under `/my-account/classes`); SvelteKit form actions resolve by URL path,
so an explicit cross-route action string works the same as this page's own `?/payAssetFee`. Money
actions on this landing render NAVY (`.btn.btn-primary`, which this theme's own tokens already
resolve to flag navy, not fireweed), per the design doc's own "fireweed is NOT spent on the routine
landing" ruling -- the masthead's renewal CTA is the page's one exception.

`stacked` renders T3's mobile anatomy in place of mock D's own single flex row: a label line
(icon plus title), then amount plus button on their own line below it. This is the named defect the
mobile composition exists to fix -- mock D's own single-row anatomy wraps a long real title (e.g.
"Trailered Boat Parking fee outstanding") mid-phrase across three lines at 390px; the label line
gets the title the room it needs to wrap cleanly by word, never mid-phrase, and the button grows to
fill the second line (the design doc's own "full thumb width is acceptable"). -->
<script lang="ts">
  import type { ActionRow } from '$member-portal/lib/action-rows';
  import { formatMemberCents } from '$member-auth/lib/format';

  let { row, csrf, stacked = false }: { row: ActionRow; csrf: string; stacked?: boolean } = $props();
</script>

<div class="portal-action-row" class:portal-action-row-stacked={stacked}>
  <div class="portal-action-label">
    <span class="portal-action-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="10" cy="10" r="8.2" />
        <line x1="10" y1="6" x2="10" y2="11.2" stroke-linecap="round" />
        <circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    </span>
    <span class="portal-action-title">{row.title}</span>
  </div>
  <div class="portal-action-line2">
    {#if row.amountCents !== null}
      <span class="portal-action-amount">{formatMemberCents(row.amountCents)}</span>
    {/if}
    <form method="POST" action={row.formAction}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name={row.fieldName} value={row.fieldValue} />
      <button type="submit" class="btn btn-primary btn-sm">{row.actionLabel}</button>
    </form>
  </div>
</div>

<style>
  /* Ported from mock D's own `.action-row` (portal-directions.html L285-314): a hairline card with
     a 3px navy left edge, the one colored-affordance zone in the main column. The default (non-
     stacked) anatomy puts the label line and the amount/button line on one row, matching mock D's
     desktop composition exactly. */
  .portal-action-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-s);
    background: var(--color-base-100);
    border: 1px solid var(--color-card-border);
    border-left: 3px solid var(--color-primary);
    border-radius: var(--radius-box);
    padding: var(--spacing-s) var(--spacing-m);
  }
  .portal-action-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-s);
    flex: 1 1 auto;
    min-width: 0;
  }
  .portal-action-line2 {
    display: flex;
    align-items: center;
    gap: var(--spacing-s);
    flex-shrink: 0;
  }
  .portal-action-icon {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-primary);
  }
  .portal-action-icon svg {
    width: 1.35rem;
    height: 1.35rem;
  }
  .portal-action-title {
    min-width: 0;
    font-size: var(--text-step-0);
    font-weight: 600;
    color: var(--color-base-content);
  }
  .portal-action-amount {
    flex-shrink: 0;
    font-size: var(--text-step-0);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-base-content);
  }

  /* T3's stacked mobile anatomy: the label line keeps the room a long real title needs to wrap
     cleanly (a whole word per break, never mid-phrase), and the amount/button line below it lets
     the button grow to fill the row -- full thumb width, the design doc's own explicit allowance. */
  .portal-action-row-stacked {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-xs);
  }
  .portal-action-row-stacked .portal-action-line2 form {
    flex: 1 1 auto;
  }
  /* The 44px touch-target floor (this pass's own responsive acceptance criterion): daisyUI's
     `.btn-sm` alone renders under it, so the stacked line grows the button's own tap height
     directly rather than dropping the `-sm` size class (which would also grow its font past the
     rest of the row's own type scale). */
  .portal-action-row-stacked .portal-action-line2 button {
    width: 100%;
    min-height: 2.75rem;
  }
</style>
