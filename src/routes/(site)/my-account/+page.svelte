<!-- @component
/my-account: the sign-in form when signed out (mockup frame 01), or the signed-in landing (frames
02/03): the standing card, the task list (rendered only when a task exists — no tasks, no empty
state), the household card, the assets summary, and a short receipts list. Renewal (Task 6) mints
or reuses a real unpaid membership row and redirects to a real `dues` Checkout Session; the assets
section's own "Pay" doors do the same for an approved, unpaid asset assignment through the
`asset-fee` checkout. Either degrades to the site's standard payment-stub message when
`STRIPE_SECRET_KEY` is not bound, never a broken button. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { MEMBERSHIP_TIER_LABEL, type MembershipTier } from '$member-auth/lib/standing';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const MEMBERSHIP_TIERS: readonly MembershipTier[] = ['individual', 'family', 'young-adult'];

  // Seeded once from the household's own last tier (or 'individual' with no membership history
  // yet); the renew form re-renders this same component instance across a failed submit, but the
  // tier picker never needs to re-seed from `data` after that first read.
  let renewTier = $state<MembershipTier>(untrack(() => data.standing?.tier ?? 'individual'));

  function formatDollars(cents: number): string {
    return `$${cents.toLocaleString('en-US')}`;
  }
</script>

<svelte:head>
  <title>My Account — {siteConfig.siteName}</title>
</svelte:head>

{#if !data.member}
  <h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
    Member sign-in
  </h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">
    Enter the email address the club has on file and we'll send you a sign-in link. No password to
    remember.
  </p>

  {#if form && 'sent' in form && form.sent}
    <div class="mt-l max-w-measure-wide rounded-box border border-success bg-success/10 p-m">
      <p class="m-0 font-semibold text-base-content">Check your inbox.</p>
      <p class="mt-xs mb-0 text-step--1 text-base-content">
        If that address is on file with the club, a sign-in link is on its way. It expires in 15
        minutes.
      </p>
    </div>
  {:else}
    {#if form && 'error' in form && form.error}
      <p class="mt-s max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
        {form.error}
      </p>
    {/if}
    <form method="POST" action="?/requestLink" class="mt-l flex max-w-measure-wide flex-col gap-m">
      <input type="hidden" name="csrf" value={data.csrf} />
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Email address</legend>
        <input class="input w-full" type="email" name="email" autocomplete="email" required />
      </fieldset>
      <button type="submit" class="btn btn-primary self-start">Email me a sign-in link</button>
    </form>
    <p class="mt-l max-w-measure-wide text-step--1 text-muted">
      Wrong or old email on file? <a href="/contact" class="text-primary">Contact us</a> and we'll fix
      it.
    </p>
  {/if}
{:else}
  <h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
    Hi, {data.member.name}
  </h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">Your membership, at a glance.</p>

  {#if data.standing}
    <div
      id="renew"
      class="mt-l max-w-measure-wide rounded-box border border-l-4 border-card-border bg-base-100 p-m"
      class:border-l-success={data.standing.status === 'current'}
      class:border-l-warning={data.standing.status === 'grace'}
      class:border-l-error={data.standing.status === 'lapsed'}
    >
      <p class="m-0 text-step-1 font-semibold text-base-content">{data.standing.statusLine}</p>
      {#if data.standing.tier && data.standing.season}
        <p class="mt-2xs mb-0 text-step--1 text-muted">
          {MEMBERSHIP_TIER_LABEL[data.standing.tier]} membership · {data.standing.season} season
          {#if data.creditBalance > 0}
            · {data.creditBalance} class {data.creditBalance === 1 ? 'credit' : 'credits'} available
          {/if}
        </p>
      {/if}
      {#if data.standing.status !== 'current'}
        <form method="POST" action="?/renew" class="mt-s flex flex-wrap items-end gap-xs">
          <input type="hidden" name="csrf" value={data.csrf} />
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Tier</legend>
            <select class="select select-sm" name="tier" bind:value={renewTier}>
              {#each MEMBERSHIP_TIERS as tier (tier)}
                <option value={tier}>{MEMBERSHIP_TIER_LABEL[tier]} — {formatDollars(data.tierPrices?.[tier] ?? 0)}</option>
              {/each}
            </select>
          </fieldset>
          <button type="submit" class="btn btn-primary btn-sm">Renew</button>
        </form>
        {#if form && 'renewStubbed' in form && form.renewStubbed}
          <p class="mt-xs mb-0 text-step--1 text-base-content">
            Online payment isn't available yet; the club will follow up by email with how to pay.
          </p>
        {/if}
        {#if form && 'error' in form && form.error}
          <p class="mt-xs mb-0 text-step--1 text-error">{form.error}</p>
        {/if}
      {/if}
    </div>
  {/if}

  {#if data.tasks && data.tasks.length > 0}
    <div class="mt-l max-w-measure-wide">
      <h2 class="m-0 text-step-0 font-semibold text-base-content">To do</h2>
      <ul class="mt-xs flex flex-col gap-2xs">
        {#each data.tasks as task (task.id)}
          <li>
            <a href={task.href} class="text-primary underline-offset-2 hover:underline">{task.label}</a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if data.householdMembers && data.householdMembers.length > 0}
    <div class="mt-l max-w-measure-wide rounded-box border border-card-border bg-base-100 p-m">
      <div class="flex flex-wrap items-center justify-between gap-xs">
        <h2 class="m-0 text-step-0 font-semibold text-base-content">Household</h2>
        {#if data.isPrimary}
          <a href="/my-account/household" class="text-step--1 text-primary underline-offset-2 hover:underline">Manage</a>
        {/if}
      </div>
      <ul class="mt-xs flex flex-col gap-2xs text-step--1 text-base-content">
        {#each data.householdMembers as member (member.id)}
          <li>
            {member.name}
            {#if member.isPrimary}<span class="text-muted">· primary</span>{/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if (data.assignments && data.assignments.length > 0) || (data.waitlistEntries && data.waitlistEntries.length > 0) || (data.requests && data.requests.length > 0) || (data.assetTypes && data.assetTypes.length > 0)}
    <div id="assets" class="mt-l max-w-measure-wide rounded-box border border-card-border bg-base-100 p-m">
      <h2 class="m-0 text-step-0 font-semibold text-base-content">Your assets</h2>

      {#if form && 'error' in form && form.error}
        <p class="mt-xs mb-0 rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">{form.error}</p>
      {/if}
      {#if form && 'assetPayStubbed' in form && form.assetPayStubbed}
        <p class="mt-xs mb-0 text-step--1 text-base-content">
          Online payment isn't available yet; the club will follow up by email with how to pay.
        </p>
      {/if}

      {#each data.assignments as assignment (assignment.id)}
        <div class="mt-xs flex flex-wrap items-center justify-between gap-xs border-t border-card-border pt-xs text-step--1">
          <span class="text-base-content">
            {assignment.assetTypeName}{#if assignment.description} — {assignment.description}{/if}
            {#if assignment.paymentStanding === 'outstanding'}
              <span class="text-warning"> · payment outstanding{#if assignment.feeCents} · {formatDollars(assignment.feeCents / 100)}{/if}</span>
            {/if}
          </span>
          <div class="flex items-center gap-xs">
            {#if assignment.paymentStanding === 'outstanding'}
              <form method="POST" action="?/payAssetFee">
                <input type="hidden" name="csrf" value={data.csrf} />
                <input type="hidden" name="assignmentId" value={assignment.id} />
                <button type="submit" class="btn btn-primary btn-xs">Pay</button>
              </form>
            {/if}
            <form method="POST" action="?/releaseAsset">
              <input type="hidden" name="csrf" value={data.csrf} />
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <button type="submit" class="btn btn-ghost btn-xs">Release</button>
            </form>
          </div>
        </div>
      {/each}

      {#each data.waitlistEntries as entry (entry.id)}
        <p class="mt-xs border-t border-card-border pt-xs text-step--1 text-base-content">
          {entry.assetTypeName}: waitlist position {entry.position} of {entry.queueLength}
        </p>
      {/each}

      {#each data.requests.filter((r) => r.status === 'pending' || r.status === 'approved_awaiting_payment') as request (request.id)}
        <div class="mt-xs flex flex-wrap items-center justify-between gap-xs border-t border-card-border pt-xs text-step--1">
          {#if request.status === 'approved_awaiting_payment'}
            <span class="text-base-content">Approved: {request.assetTypeName} — {formatDollars(request.fee)}</span>
            <form method="POST" action="?/payRequest">
              <input type="hidden" name="csrf" value={data.csrf} />
              <input type="hidden" name="requestId" value={request.id} />
              <button type="submit" class="btn btn-primary btn-xs">Pay</button>
            </form>
          {:else}
            <span class="text-muted">{request.assetTypeName} request pending review</span>
            <form method="POST" action="?/cancelRequest">
              <input type="hidden" name="csrf" value={data.csrf} />
              <input type="hidden" name="requestId" value={request.id} />
              <button type="submit" class="btn btn-ghost btn-xs">Cancel request</button>
            </form>
          {/if}
        </div>
      {/each}

      {#if form && 'requested' in form && form.requested}
        <p class="mt-xs border-t border-card-border pt-xs text-step--1 text-base-content">
          Your request is in — the club will review it and follow up.
        </p>
      {:else if data.assetTypes && data.assetTypes.length > 0}
        <form method="POST" action="?/requestAsset" class="mt-xs flex flex-wrap items-end gap-xs border-t border-card-border pt-xs">
          <input type="hidden" name="csrf" value={data.csrf} />
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Request an asset</legend>
            <select class="select select-sm" name="assetType" required>
              {#each data.assetTypes as type (type.id)}
                <option value={type.id}>{type.name}</option>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset grow">
            <legend class="fieldset-legend">Note (optional)</legend>
            <input class="input input-sm w-full" type="text" name="note" placeholder="A word about why" />
          </fieldset>
          <button type="submit" class="btn btn-primary btn-sm">Request</button>
        </form>
      {/if}
    </div>
  {/if}

  {#if data.receipts && data.receipts.length > 0}
    <div class="mt-l max-w-measure-wide">
      <h2 class="m-0 text-step-0 font-semibold text-base-content">Receipts</h2>
      <ul class="mt-xs flex flex-col gap-2xs text-step--1 text-base-content">
        {#each data.receipts as receipt (receipt.id)}
          <li class="flex flex-wrap justify-between gap-xs">
            <span>{receipt.date.slice(0, 10)} · {receipt.what}</span>
            <span>{formatDollars(receipt.amount)}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <p class="mt-l max-w-measure-wide text-step--1">
    <a href="/my-account/classes" class="text-primary underline-offset-2 hover:underline">Classes</a>
    <span class="text-muted"> · </span>
    <a href="/my-account/directory" class="text-primary underline-offset-2 hover:underline">Member directory</a>
    <span class="text-muted"> · </span>
    <a href="/my-account/profile" class="text-primary underline-offset-2 hover:underline">Profile</a>
    {#if data.isPrimary}
      <span class="text-muted"> · </span>
      <a href="/my-account/household" class="text-primary underline-offset-2 hover:underline">Household</a>
    {/if}
  </p>

  <form method="POST" action="?/signOut" class="mt-l">
    <button type="submit" class="btn btn-ghost btn-sm">Sign out</button>
  </form>
{/if}

<style>
  /* Matches the class-signup/DonateForm/ContactForm family's own eyebrow legend convention. */
  .fieldset-legend {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }
</style>
