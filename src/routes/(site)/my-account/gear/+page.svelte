<!-- @component
/my-account/gear: the gear-and-moorings home (T2b of the portal redesign pass,
docs/design-benchmark/decisions.md's own "the gear door" ruling). Absorbed off the landing: the
household's current assignments with payment standing, waitlist positions, pending or
approved-awaiting-payment requests (with cancel), the request form, and per-row release. Paying an
outstanding fee POSTs to the landing's own `?/payAssetFee`/`?/payRequest` (a cross-route form
action, `ActionRow.svelte`'s own established precedent) rather than duplicating either checkout
call site here; release stays entirely on this page behind its own two-step confirm
(decisions.md's "Release gets a two-step confirm" ruling: no modal, the row swaps to an inline
confirm, keyboard reachable and focus-managed, "Keep it" returns to rest). -->
<script lang="ts">
  import { tick } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { formatMemberCents } from '$member-auth/lib/format';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  /** The one assignment row (if any) currently showing its release confirm, so only one row's
   *  confirm is open at a time (mirrors `/my-account/household`'s own single `confirmingLeave`
   *  flag, scaled to a per-row id since this page lists several assignments). */
  let confirmingReleaseId = $state<string | null>(null);

  // Focus-management refs: `startConfirm` moves focus onto the confirm's own GROUP container (a
  // screen-reader user landing on a freshly-swapped-in region needs focus to follow it, not stay
  // on a now-removed trigger), never straight onto the destructive submit -- a native `<button>`
  // fires `click` on Enter `keydown` with no `event.repeat` guard, so a held Enter's own OS
  // key-repeat would retarget onto whatever already has focus and collapse this two-step confirm
  // into one keystroke for a no-undo, waitlisted resource. `cancelConfirm` returns focus to the
  // row's original trigger so "Keep it" reads as a true return to rest, not a focus loss. Plain
  // objects, not `$state`: DOM element refs are never rendered from, only written by `bind:this`
  // and read inside event handlers.
  const releaseTriggerRefs: Record<string, HTMLButtonElement> = {};
  const releaseConfirmRefs: Record<string, HTMLDivElement> = {};

  async function startConfirm(id: string) {
    confirmingReleaseId = id;
    await tick();
    releaseConfirmRefs[id]?.focus();
  }

  async function cancelConfirm(id: string) {
    confirmingReleaseId = null;
    await tick();
    releaseTriggerRefs[id]?.focus();
  }

  /** Escape returns to rest the same way "Keep it" does, from anywhere inside the confirm
   *  group (WCAG 2.1.1: every function reachable by pointer needs a keyboard equivalent, and a
   *  no-undo confirm's own escape hatch should not require tabbing all the way to "Keep it"). */
  function onConfirmKeydown(event: KeyboardEvent, id: string) {
    if (event.key === 'Escape') cancelConfirm(id);
  }

  const hasAnyHolding = $derived(data.assignments.length > 0 || data.waitlistEntries.length > 0);
  const openRequests = $derived(data.requests.filter((r) => r.status === 'pending' || r.status === 'approved_awaiting_payment'));
</script>

<svelte:head>
  <title>Gear &amp; moorings — My Account — {siteConfig.siteName}</title>
</svelte:head>

<a href="/my-account" class="portal-back-link">&larr; My account</a>

<h1 class="portal-page-title">Gear &amp; moorings</h1>
<p class="mt-s max-w-measure-wide text-step-0 text-muted">
  What your household holds today, any waitlist positions, and any request in progress.
</p>

{#if form && 'error' in form && form.error}
  <p class="mt-s max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">{form.error}</p>
{/if}

<section class="mt-l max-w-measure-wide">
  <h2 class="m-0 text-step-1 font-semibold text-base-content">Your assets</h2>

  {#if data.assignments.length === 0 && data.waitlistEntries.length === 0}
    <p class="mt-xs mb-0 text-step--1 text-muted">Your household holds no gear or moorings yet.</p>
  {/if}

  {#each data.assignments as assignment (assignment.id)}
    <div class="gear-row">
      <div class="gear-row-info">
        <p class="gear-row-name">{assignment.assetTypeName}</p>
        {#if assignment.description}<p class="gear-row-detail">{assignment.description}</p>{/if}
      </div>

      {#if confirmingReleaseId === assignment.id}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="gear-release-confirm"
          role="group"
          aria-label={`Confirm releasing your ${assignment.assetTypeName}`}
          tabindex="-1"
          bind:this={releaseConfirmRefs[assignment.id]}
          onkeydown={(event) => onConfirmKeydown(event, assignment.id)}
        >
          <p class="gear-release-confirm-text">
            This gives up your {assignment.assetTypeName.toLowerCase()} for your household. The club may offer it to the next member.
          </p>
          <div class="gear-release-confirm-actions">
            <form method="POST" action="?/releaseAsset">
              <input type="hidden" name="csrf" value={data.csrf} />
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <button type="submit" class="btn btn-error gear-confirm-btn">
                Release {assignment.assetTypeName.toLowerCase()}
              </button>
            </form>
            <button type="button" class="btn btn-ghost gear-confirm-btn" onclick={() => cancelConfirm(assignment.id)}>Keep it</button>
          </div>
        </div>
      {:else}
        <div class="gear-row-actions">
          {#if assignment.paymentStanding === 'outstanding'}
            <span class="asc-availability-chip">Payment due</span>
            {#if assignment.feeCents !== null}<span class="gear-row-fee">{formatMemberCents(assignment.feeCents)}</span>{/if}
            <form method="POST" action="/my-account?/payAssetFee">
              <input type="hidden" name="csrf" value={data.csrf} />
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <button type="submit" class="btn btn-primary btn-sm portal-touch-btn">Pay</button>
            </form>
          {/if}
          <button
            type="button"
            bind:this={releaseTriggerRefs[assignment.id]}
            class="btn btn-sm portal-quiet-action portal-touch-btn"
            onclick={() => startConfirm(assignment.id)}
          >
            Release
          </button>
        </div>
      {/if}
    </div>
  {/each}

  {#each data.waitlistEntries as entry (entry.id)}
    <div class="gear-row">
      <div class="gear-row-info">
        <p class="gear-row-name">{entry.assetTypeName}</p>
        <p class="gear-row-detail">Position {entry.position} of {entry.queueLength}</p>
      </div>
      <div class="gear-row-actions">
        <span class="asc-availability-chip">Waitlist</span>
      </div>
    </div>
  {/each}
</section>

{#if openRequests.length > 0}
  <section class="mt-l max-w-measure-wide">
    <h2 class="m-0 text-step-1 font-semibold text-base-content">Requests</h2>
    {#each openRequests as request (request.id)}
      <div class="gear-row">
        <div class="gear-row-info">
          <p class="gear-row-name">{request.assetTypeName}</p>
        </div>
        {#if request.status === 'approved_awaiting_payment'}
          <div class="gear-row-actions">
            <span class="asc-availability-chip">Approved</span>
            <span class="gear-row-fee">{formatMemberCents(Math.round(request.fee * 100))}</span>
            <form method="POST" action="/my-account?/payRequest">
              <input type="hidden" name="csrf" value={data.csrf} />
              <input type="hidden" name="requestId" value={request.id} />
              <button type="submit" class="btn btn-primary btn-sm portal-touch-btn">Pay</button>
            </form>
          </div>
        {:else}
          <div class="gear-row-actions">
            <span class="asc-availability-chip">Pending review</span>
            <form method="POST" action="?/cancelRequest">
              <input type="hidden" name="csrf" value={data.csrf} />
              <input type="hidden" name="requestId" value={request.id} />
              <button type="submit" class="btn btn-sm portal-quiet-action portal-touch-btn">Cancel request</button>
            </form>
          </div>
        {/if}
      </div>
    {/each}
  </section>
{/if}

<section class="mt-l max-w-measure-wide">
  <h2 class="m-0 text-step-1 font-semibold text-base-content">Request an asset</h2>
  {#if form && 'requested' in form && form.requested}
    <p class="mt-xs mb-0 text-step--1 text-base-content">Your request is in. The club will review it and follow up.</p>
  {:else if data.assetTypes.length > 0}
    <form method="POST" action="?/requestAsset" class="mt-xs flex flex-wrap items-end gap-xs">
      <input type="hidden" name="csrf" value={data.csrf} />
      <fieldset class="fieldset">
        <legend class="fieldset-legend portal-field-label">Asset type</legend>
        <select class="select select-sm" name="assetType" required>
          {#each data.assetTypes as type (type.id)}
            <option value={type.id}>{type.name}</option>
          {/each}
        </select>
      </fieldset>
      <fieldset class="fieldset grow">
        <legend class="fieldset-legend portal-field-label">Note (optional)</legend>
        <input class="input input-sm w-full" type="text" name="note" placeholder="A word about why" />
      </fieldset>
      <button type="submit" class="btn btn-primary btn-sm">Request</button>
    </form>
  {:else}
    <p class="mt-xs mb-0 text-step--1 text-muted">No asset types are open for request right now.</p>
  {/if}
</section>

<style>
  /* One flat row per held asset, waitlist position, or open request: a hairline top border
     between rows (no per-row card), matching `/my-account/household`'s own list-row rhythm rather
     than the boxed-card treatment mock D's landing rail uses -- this page is the door those rail
     tiles point to, so it gets room to breathe rather than a second nested card. Stacked at
     narrow widths (name/detail above, chip/fee/actions below, each on its own line) so a long
     asset-type name never forces the mid-phrase wrap the redesign's own mobile ruling names as
     the defect to avoid; a wide viewport has room to hold both halves on one line instead. */
  .gear-row {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2xs);
    padding: var(--spacing-s) 0;
    border-top: 1px solid var(--color-card-border);
  }
  .gear-row:first-of-type {
    border-top: none;
  }
  @media (min-width: 40rem) {
    .gear-row {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-s);
    }
  }

  .gear-row-info {
    min-width: 0;
  }
  .gear-row-name {
    margin: 0;
    font-size: var(--text-step--1);
    font-weight: 600;
    color: var(--color-base-content);
  }
  .gear-row-detail {
    margin: var(--spacing-3xs) 0 0;
    font-size: var(--text-step--2);
    color: var(--color-muted);
  }

  .gear-row-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-xs);
  }
  .gear-row-fee {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--color-base-content);
  }

  /* The release confirm (decisions.md's "Release gets a two-step confirm"): a tinted-neutral
     inline panel replacing the row's own action slot, never a modal. `min-height: 2.75rem` (44px)
     on both buttons matches the portal's own 44px touch-target floor (`.portal-touch-btn`,
     asc-components.css), reproduced locally here since these two confirm buttons carry no other
     shared portal class to hang it on. */
  .gear-release-confirm {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    padding: var(--spacing-s);
    background: var(--color-base-200);
    border-radius: var(--radius-box);
  }
  .gear-release-confirm-text {
    margin: 0;
    font-size: var(--text-step--1);
    color: var(--color-base-content);
  }
  .gear-release-confirm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }
  .gear-confirm-btn {
    min-height: 2.75rem;
  }
</style>
