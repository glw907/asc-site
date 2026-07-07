<!--
@component
The Club section's signup-review queue (docs/superpowers/specs/2026-07-06-asc-phase-2-design-
suite.md, Part B: the review-inbox pattern, the decision never far from the evidence). THE COPY
HERE IS LOAD-BEARING: membership activates immediately on payment (demo-members.ts's design
choice 5), so every row reads "under background review", never "awaiting approval" -- there is
nothing here for a member to be waiting on.

Two DaisyUI v5 shapes from docs/internal/daisyui-v5-hard-components.md, chosen deliberately over
the Events/Members screens' own `<table>`: a `list`/`list-row` (a decision belongs beside its
evidence, not in a table cell) with the text block marked `list-col-grow`, and the destructive-
confirm `<dialog>` recipe for Deny (method="dialog" form, the CANCEL button autofocused and
`formnovalidate` so an empty reason never blocks closing, the actual Deny button overriding
`formmethod`/`formaction` to really submit). The dialog's own `cancel` event is prevented so ESC
or a backdrop click can't quietly dismiss it (this is a genuinely rare, deliberate action; a
forced choice between Cancel and Deny is correct here, unlike an ordinary informational dialog).
Approve has no dialog at all: it is design choice 5's acknowledging no-op, and asking a reviewer
to confirm a no-op would just be friction.

Optimistic UI is deliberately absent: both actions plain-POST and the load's own post-redirect-get
re-render drops the resolved row, which is honest (the "mutation" is a real server round trip, not
a local guess) and simpler than reconciling client and server state for a screen this size.
-->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import { HEADER_CELL, formatCivilDate, formatDollars } from '$admin-club/lib/ui';
  import { TIER_LABEL } from '$admin-club/lib/member-format';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // One <dialog> ref per row, keyed by review id, so each row's Deny button opens its own
  // confirm without a shared "which row is this for" piece of state.
  let dialogs: Record<string, HTMLDialogElement> = {};

  const subtitle = $derived(
    data.reviews.length === 0
      ? 'Nothing under background review right now.'
      : `${data.reviews.length} new ${data.reviews.length === 1 ? 'signup' : 'signups'} under background review.`,
  );
</script>

<div class="stats stats-vertical lg:stats-horizontal mb-6 w-full rounded-box border border-[var(--cairn-card-border)] bg-base-100 shadow-[var(--cairn-shadow)]">
  <div class="stat">
    <div class={HEADER_CELL}>Pending</div>
    <div class="stat-value text-xl text-warning">{data.reviews.length}</div>
    <div class="stat-desc">Under background review</div>
  </div>
  <div class="stat">
    <div class={HEADER_CELL}>Reviewed this season</div>
    <div class="stat-value text-xl text-success">{data.reviewedThisSeason}</div>
    <div class="stat-desc">Cleared or denied</div>
  </div>
</div>

<OfficeList eyebrow="Club" title="Signup review" {subtitle}>
  {#if form?.error}
    <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-error" role="alert">
      {form.error}
    </p>
  {/if}
  <ul class="list">
    {#each data.reviews as row (row.id)}
      <li class="list-row items-start">
        <div class="list-col-grow">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{row.memberName}</span>
            <span class="text-sm text-muted">&middot; {row.household}</span>
            <span class="badge badge-ghost badge-sm font-medium">{TIER_LABEL[row.tier]}</span>
          </div>
          <p class="mt-1 text-sm text-muted">
            {formatDollars(row.paidAmount)} paid {formatCivilDate(row.paidDate)}
            &middot; {row.creditGrant} class {row.creditGrant === 1 ? 'credit' : 'credits'} granted
          </p>
          <p class="text-xs text-muted">Signed up {formatCivilDate(row.submittedAt)}</p>
          {#if row.flagNote}
            <p class="mt-1.5 flex items-start gap-1 text-xs font-medium text-warning">
              <span aria-hidden="true">!</span>
              {row.flagNote}
            </p>
          {/if}
        </div>
        <form method="post" action="?/approve">
          <input type="hidden" name="id" value={row.id} />
          <CsrfField />
          <div class="join">
            <button type="submit" class="btn btn-sm join-item">Approve</button>
            <button
              type="button"
              class="btn btn-sm btn-ghost join-item"
              onclick={() => dialogs[row.id]?.showModal()}
            >
              Deny
            </button>
          </div>
        </form>
        <dialog bind:this={dialogs[row.id]} class="modal" oncancel={(event) => event.preventDefault()}>
          <div class="modal-box">
            <h2 class="text-lg font-bold">Deny {row.memberName}'s signup</h2>
            <p class="py-2 text-sm text-muted">
              This clears the case from the queue as a board decision; it does not touch {row.memberName}'s
              membership or payment. Letting them know is still a manual step today (a member-
              communication send is a TODO for pass 2.2's real store).
            </p>
            <form method="dialog">
              <input type="hidden" name="id" value={row.id} />
              <CsrfField />
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Reason</legend>
                <textarea name="reason" class="textarea w-full" rows="3" required placeholder="What the board found"
                ></textarea>
              </fieldset>
              <div class="modal-action">
                <!-- Deliberately autofocused (docs/internal/daisyui-v5-hard-components.md's
                     destructive-confirm recipe): DaisyUI v5's showModal has a known focus bug
                     (upstream #3440), and an accidental Enter must land on Cancel, never Deny. -->
                <!-- svelte-ignore a11y_autofocus -->
                <button type="submit" class="btn" autofocus formnovalidate>Cancel</button>
                <button type="submit" class="btn btn-error" formmethod="post" formaction="?/deny">
                  Deny signup
                </button>
              </div>
            </form>
          </div>
        </dialog>
      </li>
    {:else}
      <li class="list-row">
        <p class="w-full py-4 text-center text-sm text-muted">Nothing under background review right now.</p>
      </li>
    {/each}
  </ul>
</OfficeList>
