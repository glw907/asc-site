<!--
@component
The Classes detail screen (Classes pass Task 4 rebuild, docs/2026-07-21-classes-pass-design.md):
the surgery surface behind the list's own glance-and-act rows. Section order follows the design
doc exactly -- roster, waitlist & offers, details (the edit form), instructors, danger zone --
built on the graduated toolkit (`PageHeader`, `AdminTable`, `StatusChip`) the same way Task 3's
list rebuild is, plus this route's own `recordPayment` action (manual cash/check/comp: always the
class's own fee, never an admin-typed amount, see `classes-store.ts`'s `buildClassPayment`).
Move… on a roster row opens the destination picker (Task 5, `class-transfer.ts`'s
`transferEnrollment`): same season, the current class excluded, each candidate showing its own
fraction (over-capacity destinations are allowed, per the pass's own soft-capacity ruling). A fee
mismatch shows the exact difference and requires the explicit "I understand" confirmation before
the submit button un-disables; the flow never charges or refunds anything itself. Every corrective
action (Drop, Move…, Cancel offer, Delete) stays a quiet `btn-ghost` control with no alarm color,
per the pass's own global constraint -- Delete in particular moves off the header into a demoted,
confirm-gated danger zone rather than a floating top-right red link.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { ActionData, PageData } from './$types';
  import { CsrfField } from '@glw907/cairn-cms/components';
  import { SelectField, TextField } from '@glw907/cairn-cms/admin-fields';
  import { AdminTable, PageHeader, StatusChip, ageFromBirthdate } from '@glw907/cairn-cms/admin-toolkit';
  import ClassForm from '../ClassForm.svelte';
  import type { ClassTrack, EnrollmentRow } from '$admin-club/lib/classes-store';
  import { HEADER_CELL, formatCivilDate, formatClubTimestamp, formatDollars } from '$admin-club/lib/ui';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const cardCls = 'rounded-box border border-[var(--cairn-card-border)] bg-base-100 shadow-[var(--cairn-shadow)]';

  /** Every dialog form's own `use:enhance` (the household desk's own `closeDialogOnSettle`
   *  recipe): keeps the modal open with a server `fail()` message shown inline (`form?.error` at
   *  the page top) rather than a full-page navigation that would discard it; closes once the
   *  action settles with anything but a failure. */
  function closeDialogOnSettle(dialog: () => HTMLDialogElement | undefined): SubmitFunction {
    return () => {
      return async ({ result, update }) => {
        await update();
        if (result.type !== 'failure') dialog()?.close();
      };
    };
  }

  const SOURCE_OPTIONS = [
    { value: 'check', label: 'Check' },
    { value: 'cash', label: 'Cash' },
    { value: 'comp', label: 'Comp' },
  ];

  let deleteDialog: HTMLDialogElement | undefined = $state();

  // -- record payment dialog --
  let paymentDialog: HTMLDialogElement | undefined = $state();
  let paymentTarget: EnrollmentRow | null = $state(null);
  let paymentSource = $state<'check' | 'cash' | 'comp'>('check');
  let paymentMemo = $state('');
  function openPaymentDialog(enrollment: EnrollmentRow) {
    paymentTarget = enrollment;
    paymentSource = 'check';
    paymentMemo = '';
    paymentDialog?.showModal();
  }

  // -- transfer (Move…) dialog --
  let transferDialog: HTMLDialogElement | undefined = $state();
  let transferTarget: EnrollmentRow | null = $state(null);
  let transferDestinationId = $state('');
  let transferConfirmMismatch = $state(false);
  function openTransferDialog(enrollment: EnrollmentRow) {
    transferTarget = enrollment;
    transferDestinationId = '';
    transferConfirmMismatch = false;
    transferDialog?.showModal();
  }

  /** The picker's own candidates: every other class in the same season, the current one
   *  excluded (`+page.server.ts`'s own load comment on why it reads the whole season rather
   *  than a bespoke "every class but this one" query). */
  const transferCandidates = $derived(data.class ? data.classesInSeason.filter((candidate) => candidate.id !== data.class!.id) : []);
  const transferDestination = $derived(transferCandidates.find((candidate) => candidate.id === transferDestinationId) ?? null);
  const transferFeeMismatch = $derived(
    data.class !== null && transferDestination !== null && transferDestination.fee !== data.class.fee,
  );

  // One resolved offer, or none, per waitlist entry, plus the display name and member/applicant
  // distinction the route's own load resolved separately (`waitlistMemberNames`, keyed by member
  // id): `classes-store.ts`'s own header explains why `WaitlistRow` itself carries no name for a
  // member-sourced entry. `activeOffer` is the unresolved row (the load already swept any
  // past-expiry one to `'expired'`), `history` is every offer that entry has ever had resolved,
  // most recent first.
  const waitlistView = $derived(
    data.waitlist.map((entry) => {
      const entryOffers = data.offers.filter((offer) => offer.waitlistId === entry.id);
      const isMember = entry.memberId !== null;
      return {
        entry,
        isMember,
        displayName: (isMember ? data.waitlistMemberNames[entry.memberId as string] : null) ?? entry.applicantName ?? entry.applicantEmail ?? 'Unknown',
        activeOffer: entryOffers.find((offer) => offer.resolved === null) ?? null,
        history: entryOffers.filter((offer) => offer.resolved !== null),
      };
    }),
  );

  // A one-time seed from the load's own current row, not a live mirror (the same `untrack` idiom
  // `events/[id]/+page.svelte` and the Settings screen already use): the post-submit re-render
  // must not clobber whatever the editor just typed.
  let name = $state(untrack(() => data.class?.name ?? ''));
  let slug = $state(untrack(() => data.class?.slug ?? ''));
  let track = $state<ClassTrack>(untrack(() => data.class?.track ?? 'adult-teen'));
  let capacity = $state(untrack(() => String(data.class?.capacity ?? '')));
  let fee = $state(untrack(() => String(data.class?.fee ?? '')));
  let startDate = $state(untrack(() => data.class?.startDate ?? ''));
  let endDate = $state(untrack(() => data.class?.endDate ?? ''));
  let location = $state(untrack(() => data.class?.location ?? ''));
  let description = $state(untrack(() => data.class?.description ?? ''));
  let instructorNotes = $state(untrack(() => data.class?.instructorNotes ?? ''));
  let customNote = $state(untrack(() => data.class?.customNote ?? ''));
  let visible = $state(untrack(() => data.class?.visible ?? true));
  let dropIn = $state(untrack(() => data.class?.dropIn ?? false));

  let newInstructorEmail = $state('');
  let newInstructorName = $state('');

  const classMeta = $derived(
    data.class
      ? [
          `Season ${data.class.season}`,
          `${formatCivilDate(data.class.startDate, 'TBD')}${data.class.endDate ? ` – ${formatCivilDate(data.class.endDate)}` : ''}`,
          data.class.dropIn
            ? 'Drop-in'
            : `${data.class.enrolledCount}/${data.class.capacity} enrolled${data.class.isFull ? ', full' : ''}`,
        ].join(' · ')
      : '',
  );
</script>

<a href="/admin/club/classes" class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary">
  <span aria-hidden="true">&larr;</span> Back to Classes
</a>

{#if !data.class}
  <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-6 py-10 text-center shadow-[var(--cairn-shadow)]">
    <p class="text-sm text-muted">
      {data.error ?? 'No such class. It may have been deleted, or this link is stale.'}
    </p>
  </div>
{:else}
  <!-- Keyed on the class's own id: without this, navigating from one class's detail screen
       straight to another's (both matching this same dynamic route) reuses the component
       instance, and the `$state(untrack(...))` seeds above only ever run once, leaving the
       form showing the PREVIOUS class's values under the new class's own submit actions. -->
  {#key data.class.id}
  <PageHeader eyebrow="Club" title={data.class.name} meta={classMeta} />

  {#if form?.error}
    <p class="mb-4 rounded-box border border-[var(--cairn-card-border)] bg-base-100 px-6 py-3 text-sm font-medium text-error shadow-[var(--cairn-shadow)]" role="alert">
      {form.error}
    </p>
  {/if}

  <div class="{cardCls} mb-6">
    <div class="border-b border-[var(--cairn-card-border)] p-6">
      <h2 class="text-sm font-semibold">Roster</h2>
      <p class="mt-1 text-sm text-muted">
        {data.class.enrolledCount} enrolled, {data.class.waitlistCount} on the waitlist. Dropping an
        enrollee frees the spot; a nonempty waitlist gets an automatic offer.
      </p>
    </div>
    <AdminTable density="sm" zebra rowCount={data.enrollments.length} emptyColspan={5}>
      {#snippet header()}
        <th class={HEADER_CELL}>Name</th>
        <th class={HEADER_CELL}>Age</th>
        <th class={HEADER_CELL}>Enrolled</th>
        <th class={HEADER_CELL}>Paid</th>
        <th class="sr-only">Actions</th>
      {/snippet}
      {#snippet empty()}
        <p class="text-sm text-muted">No one is enrolled yet.</p>
      {/snippet}
      {#each data.enrollments as enrollment (enrollment.id)}
        <tr>
          <td class="font-medium">{enrollment.memberName}</td>
          <td class="tabular-nums">{ageFromBirthdate(enrollment.birthdate) ?? '—'}</td>
          <td class="text-muted">{formatCivilDate(enrollment.enrolledAt)}</td>
          <td>
            <StatusChip tone={enrollment.feePaid ? 'success' : 'warning'} label={enrollment.feePaid ? 'Paid' : 'Owing'} size="sm" />
          </td>
          <td class="flex flex-wrap justify-end gap-2">
            {#if !enrollment.feePaid}
              <button type="button" class="btn btn-ghost btn-xs" onclick={() => openPaymentDialog(enrollment)}>
                Record payment
              </button>
            {/if}
            <button type="button" class="btn btn-ghost btn-xs" onclick={() => openTransferDialog(enrollment)} disabled={transferCandidates.length === 0}>
              Move&hellip;
            </button>
            <form method="post" action="?/dropEnrollment">
              <CsrfField />
              <input type="hidden" name="enrollmentId" value={enrollment.id} />
              <button type="submit" class="btn btn-ghost btn-xs">Drop</button>
            </form>
          </td>
        </tr>
      {/each}
    </AdminTable>
  </div>

  <div class="{cardCls} mb-6">
    <div class="border-b border-[var(--cairn-card-border)] p-6">
      <h2 class="text-sm font-semibold">Waitlist &amp; offers</h2>
      <p class="mt-1 text-sm text-muted">
        Position order. Offering a spot mints a one-time claim code; it appears here only once, right
        after you offer it.
      </p>
    </div>
    <ul class="divide-y divide-[var(--cairn-card-border)]">
      {#each waitlistView as { entry, isMember, displayName, activeOffer, history } (entry.id)}
        <li class="flex flex-col gap-2 px-6 py-3 text-sm">
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <span class="font-medium">{displayName}</span>
              <span class="badge badge-ghost badge-sm font-medium">{isMember ? 'Member' : 'Applicant'}</span>
              <span class="text-muted">&middot; #{entry.position}</span>
            </div>
            {#if history.length > 0 && !activeOffer}
              <span class="badge badge-ghost badge-sm font-medium capitalize">{history[0].resolved}</span>
            {/if}
          </div>

          {#if entry.notes}
            <p class="m-0 text-xs text-muted">Wants to learn: {entry.notes}</p>
          {/if}

          {#if activeOffer}
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-box bg-base-200/60 px-3 py-2 text-sm">
              <span>Offered, expires {formatClubTimestamp(activeOffer.expiresAt)}.</span>
              <form method="post" action="?/cancelOffer">
                <CsrfField />
                <input type="hidden" name="waitlistId" value={entry.id} />
                <button type="submit" class="btn btn-ghost btn-xs">Cancel offer</button>
              </form>
            </div>
            {#if form && 'offered' in form && form.offered?.waitlistId === entry.id}
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <label class="flex flex-1 flex-col gap-1" for={`claim-code-${entry.id}`}>
                  Claim code (copy it now; it will not show again)
                  <input id={`claim-code-${entry.id}`} class="input input-sm font-mono" readonly value={form.offered.token} />
                </label>
              </div>
            {/if}
          {:else}
            <form method="post" action="?/offer">
              <CsrfField />
              <input type="hidden" name="waitlistId" value={entry.id} />
              <button type="submit" class="btn btn-sm" disabled={data.class.isFull}>Offer the spot</button>
            </form>
          {/if}
        </li>
      {:else}
        <li class="px-6 py-6 text-center text-sm text-muted">No one is on the waitlist.</li>
      {/each}
    </ul>
  </div>

  <div class="{cardCls} mb-6">
    <div class="border-b border-[var(--cairn-card-border)] p-6">
      <h2 class="text-sm font-semibold">Details</h2>
      <p class="mt-1 text-sm text-muted">Edit this class, then save.</p>
    </div>
    <form method="post" action="?/update">
      <ClassForm
        bind:name
        bind:slug
        bind:track
        bind:capacity
        bind:fee
        bind:startDate
        bind:endDate
        bind:location
        bind:description
        bind:instructorNotes
        bind:customNote
        bind:visible
        bind:dropIn
        heroImage={data.class.heroImage}
        heroImageAlt={data.class.heroImageAlt}
      />
      <div class="flex justify-end gap-2 border-t border-[var(--cairn-card-border)] p-6">
        <CsrfField />
        <button type="submit" class="btn btn-primary btn-sm">Save</button>
      </div>
    </form>
  </div>

  <div class="{cardCls} mb-6">
    <div class="border-b border-[var(--cairn-card-border)] p-6">
      <h2 class="text-sm font-semibold">Instructors</h2>
      <p class="mt-1 text-sm text-muted">Assign by email; an instructor's own account arrives in a later pass.</p>
    </div>
    <ul class="divide-y divide-[var(--cairn-card-border)]">
      {#each data.instructors as instructor (instructor.email)}
        <li class="flex items-center justify-between gap-4 px-6 py-3">
          <span class="text-sm">
            <span class="font-medium">{instructor.name ?? instructor.email}</span>
            {#if instructor.name}<span class="text-muted"> &middot; {instructor.email}</span>{/if}
          </span>
          <form method="post" action="?/unassignInstructor">
            <CsrfField />
            <input type="hidden" name="email" value={instructor.email} />
            <button type="submit" class="btn btn-ghost btn-xs">Remove</button>
          </form>
        </li>
      {:else}
        <li class="px-6 py-6 text-center text-sm text-muted">No instructor assigned yet.</li>
      {/each}
    </ul>
    <form method="post" action="?/assignInstructor" class="flex flex-wrap items-end gap-2 border-t border-[var(--cairn-card-border)] p-6">
      <CsrfField />
      <label class="flex flex-col gap-1 text-sm">
        Email
        <input class="input input-sm" type="email" name="email" bind:value={newInstructorEmail} required />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Display name
        <input class="input input-sm" type="text" name="name" bind:value={newInstructorName} />
      </label>
      <button type="submit" class="btn btn-sm">Assign</button>
    </form>
  </div>

  <div class={cardCls}>
    <div class="p-6">
      <h2 class="text-sm font-semibold">Danger zone</h2>
      <p class="mt-1 text-sm text-muted">Deleting a class removes it and its history for good. There is no undo.</p>
      <button type="button" class="btn btn-ghost btn-sm mt-3" onclick={() => deleteDialog?.showModal()}>
        Delete class
      </button>
    </div>
  </div>

  <dialog bind:this={paymentDialog} class="modal" aria-labelledby="payment-dialog-title">
    <div class="modal-box">
      <h2 id="payment-dialog-title" class="text-lg font-bold">Record a payment</h2>
      {#if paymentTarget}
        <p class="py-2 text-sm text-muted">
          Records a {formatDollars(data.class.fee)} charge for {paymentTarget.memberName}. This does not touch
          Stripe: use it only for a cash, check, or comp payment collected outside checkout.
        </p>
        <form method="post" action="?/recordPayment" class="flex flex-col gap-3" use:enhance={closeDialogOnSettle(() => paymentDialog)}>
          <CsrfField />
          <input type="hidden" name="enrollmentId" value={paymentTarget.id} />
          <SelectField label="Source" name="source" bind:value={paymentSource} options={SOURCE_OPTIONS} />
          <TextField label="Memo" name="memo" bind:value={paymentMemo} />
          <div class="modal-action">
            <button type="button" class="btn btn-sm" onclick={() => paymentDialog?.close()}>Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Record payment</button>
          </div>
        </form>
      {/if}
    </div>
  </dialog>

  <dialog bind:this={transferDialog} class="modal" aria-labelledby="transfer-dialog-title">
    <div class="modal-box">
      <h2 id="transfer-dialog-title" class="text-lg font-bold">Move {transferTarget?.memberName}</h2>
      {#if transferTarget}
        <form method="post" action="?/transfer" class="flex flex-col gap-3" use:enhance={closeDialogOnSettle(() => transferDialog)}>
          <CsrfField />
          <input type="hidden" name="enrollmentId" value={transferTarget.id} />
          <input type="hidden" name="confirmFeeMismatch" value={transferConfirmMismatch ? 'true' : 'false'} />
          <label class="flex flex-col gap-1 text-sm" for="transfer-destination">
            Move to
            <select
              id="transfer-destination"
              class="select select-sm"
              name="destinationClassId"
              bind:value={transferDestinationId}
              onchange={() => (transferConfirmMismatch = false)}
              required
            >
              <option value="" disabled>Choose a class</option>
              {#each transferCandidates as candidate (candidate.id)}
                <option value={candidate.id}>
                  {candidate.name} ({candidate.dropIn ? 'drop-in' : `${candidate.enrolledCount}/${candidate.capacity}`})
                </option>
              {/each}
            </select>
          </label>
          {#if transferFeeMismatch && transferDestination && data.class}
            <div class="alert alert-warning text-sm" role="alert">
              <div>
                <p class="m-0">
                  {data.class.name} is {formatDollars(data.class.fee)}; {transferDestination.name} is
                  {formatDollars(transferDestination.fee)}. The difference settles outside this flow.
                </p>
                <label class="mt-2 flex items-center gap-2">
                  <input type="checkbox" class="checkbox checkbox-sm" bind:checked={transferConfirmMismatch} />
                  I understand the fee differs and want to move anyway.
                </label>
              </div>
            </div>
          {/if}
          <div class="modal-action">
            <button type="button" class="btn btn-sm" onclick={() => transferDialog?.close()}>Cancel</button>
            <button
              type="submit"
              class="btn btn-primary btn-sm"
              disabled={!transferDestinationId || (transferFeeMismatch && !transferConfirmMismatch)}
            >
              Move
            </button>
          </div>
        </form>
      {/if}
    </div>
  </dialog>

  <dialog bind:this={deleteDialog} class="modal" oncancel={(event) => event.preventDefault()}>
    <div class="modal-box">
      <h2 class="text-lg font-bold">Delete {data.class.name}?</h2>
      <p class="py-2 text-sm text-muted">
        This removes the class for good. There is no undo.
      </p>
      <form method="dialog">
        <CsrfField />
        <div class="modal-action">
          <!-- svelte-ignore a11y_autofocus -->
          <button type="submit" class="btn" autofocus formnovalidate>Cancel</button>
          <button type="submit" class="btn btn-ghost btn-sm" formmethod="post" formaction="?/delete">Delete class</button>
        </div>
      </form>
    </div>
  </dialog>
  {/key}
{/if}
