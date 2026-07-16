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
  import { TURNSTILE_SITE_KEY } from '$theme/turnstile';
  import { MEMBERSHIP_TIER_LABEL, type MembershipTier } from '$member-auth/lib/standing';
  import { formatMemberDate } from '$member-auth/lib/format';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const MEMBERSHIP_TIERS: readonly MembershipTier[] = ['individual', 'family', 'young-adult'];

  // Seeded once from the household's own last tier (or 'individual' with no membership history
  // yet); the renew form re-renders this same component instance across a failed submit, but the
  // tier picker never needs to re-seed from `data` after that first read. `untrack` is
  // load-bearing here, not a no-op: without it, `svelte-check` emits a `state_referenced_locally`
  // warning for reading the reactive `data` prop outside a `$derived`/`$effect`.
  let renewTier = $state<MembershipTier>(untrack(() => data.standing?.tier ?? 'individual'));

  function formatDollars(dollars: number): string {
    return `$${dollars.toLocaleString('en-US')}`;
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
    <form method="POST" action="?/requestLink" class="signin-form mt-l flex flex-col gap-m">
      <input type="hidden" name="csrf" value={data.csrf} />
      <fieldset class="fieldset">
        <legend class="fieldset-legend portal-field-label">Email address</legend>
        <input class="input w-full" type="email" name="email" autocomplete="email" required />
      </fieldset>
      <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY}></div>
      <button type="submit" class="btn btn-primary">Email me a sign-in link</button>
    </form>

    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

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
            <legend class="fieldset-legend portal-field-label">Tier</legend>
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
          </span>
          <div class="flex items-center gap-xs">
            {#if assignment.paymentStanding === 'outstanding'}
              <span class="asc-availability-chip">Payment due</span>
              {#if assignment.feeCents}
                <span class="tabular-nums text-muted">{formatDollars(assignment.feeCents / 100)}</span>
              {/if}
              <form method="POST" action="?/payAssetFee">
                <input type="hidden" name="csrf" value={data.csrf} />
                <input type="hidden" name="assignmentId" value={assignment.id} />
                <button type="submit" class="btn btn-primary btn-xs">Pay</button>
              </form>
            {/if}
            <form method="POST" action="?/releaseAsset">
              <input type="hidden" name="csrf" value={data.csrf} />
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <button type="submit" class="btn btn-xs portal-quiet-action">Release</button>
            </form>
          </div>
        </div>
      {/each}

      {#each data.waitlistEntries as entry (entry.id)}
        <div class="mt-xs flex flex-wrap items-center justify-between gap-xs border-t border-card-border pt-xs text-step--1">
          <span class="text-base-content">{entry.assetTypeName}</span>
          <div class="flex items-center gap-xs">
            <span class="asc-availability-chip">Waitlist</span>
            <span class="text-muted">Position {entry.position} of {entry.queueLength}</span>
          </div>
        </div>
      {/each}

      {#each data.requests.filter((r) => r.status === 'pending' || r.status === 'approved_awaiting_payment') as request (request.id)}
        <div class="mt-xs flex flex-wrap items-center justify-between gap-xs border-t border-card-border pt-xs text-step--1">
          <span class="text-base-content">{request.assetTypeName}</span>
          {#if request.status === 'approved_awaiting_payment'}
            <div class="flex items-center gap-xs">
              <span class="asc-availability-chip">Approved</span>
              <span class="tabular-nums text-muted">{formatDollars(request.fee)}</span>
              <form method="POST" action="?/payRequest">
                <input type="hidden" name="csrf" value={data.csrf} />
                <input type="hidden" name="requestId" value={request.id} />
                <button type="submit" class="btn btn-primary btn-xs">Pay</button>
              </form>
            </div>
          {:else}
            <div class="flex items-center gap-xs">
              <span class="asc-availability-chip">Pending review</span>
              <form method="POST" action="?/cancelRequest">
                <input type="hidden" name="csrf" value={data.csrf} />
                <input type="hidden" name="requestId" value={request.id} />
                <button type="submit" class="btn btn-xs portal-quiet-action">Cancel request</button>
              </form>
            </div>
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
            <legend class="fieldset-legend portal-field-label">Request an asset</legend>
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
      {/if}
    </div>
  {/if}

  {#if data.receipts && data.receipts.length > 0}
    <div class="mt-l max-w-measure-wide">
      <h2 class="m-0 text-step-0 font-semibold text-base-content">Receipts</h2>
      <ul class="mt-xs flex flex-col gap-2xs text-step--1 text-base-content">
        {#each data.receipts as receipt (receipt.id)}
          <li class="flex flex-wrap justify-between gap-xs">
            <span>{formatMemberDate(receipt.date)} · {receipt.what}</span>
            <span class="tabular-nums">{formatDollars(receipt.amount)}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- A step tighter than the sitewide `mt-l`: this row and Receipts above are both flat
       (secondary) blocks, unlike the carded standing/household/assets objects above them, so the
       gap between two flat siblings reads deliberately closer than the gap a card imposes. -->
  <p class="mt-m max-w-measure-wide text-step--1">
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
    <button type="submit" class="btn btn-sm portal-quiet-action">Sign out</button>
  </form>
{/if}

<style>
  /* The sign-in form used the page's own wide reading measure (`max-w-measure-wide`, ~640px+),
     so the fixed-width Turnstile widget (~300px) and the content-sized button sat well short of
     the full-width email input's own right edge, a ragged
     column. A narrower shared measure, matching the Turnstile widget's own natural width, plus
     dropping the button's `self-start` (so it stretches like every other child in this `flex-col`
     stack) brings all three controls' right edges into line. */
  .signin-form {
    max-width: 300px;
  }
</style>
