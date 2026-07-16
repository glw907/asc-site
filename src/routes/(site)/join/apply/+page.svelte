<!-- @component
The public join door: tier selection with live prices, the purchaser's own details, family's
inline household members, optional class picks per roster member (a full class still lists,
landing the pick on the waitlist instead), a running total delegated to the same
`computeJoinPricing` the server action uses (no duplicated pricing math), the waiver, and
Turnstile. Submits through `applyJoin` (join-apply.remote.ts): a fresh join redirects to Stripe,
and a checkout-unavailable submission shows the same stub message every other payment form on
this site shows. A visitor carried over from the class door's own invitation
(`?class=<id>&name=…&email=…&phone=…`) has those fields and the class pick pre-filled from
`data.prefill`, so they never have to enter them twice.

Renew and welcome-back (amended 2026-07-14, `docs/2026-07-13-unified-signup-design.md`'s "Renew
and welcome-back"): a purchaser email matching a household that has paid a membership before
never renders a second form here. The action sends that member's own portal sign-in link
server-side and answers `{ pivot: 'renewal-link-sent' }`, which this page renders as a quiet
confirmation panel carrying no household data at all: the earlier unauthenticated welcome-back
form (name, roster, class picks, a resubmit) let an anonymous visitor who knew a member's email
write into that household and read back its roster before any payment, so it is gone. A member
row with no membership history at all (paid or unpaid, the rare `email-in-use` pivot) keeps the
earlier "sign in instead" dead end, unchanged. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { applyJoin, checkKnownEmail } from '$theme/join-apply.remote';
  import { computeJoinPricing } from '$member-signup/lib/pricing.js';
  import type { NormalizedJoinInput } from '$member-signup/lib/types.js';
  import { MEMBERSHIP_TIER_LABEL, type MembershipTier } from '$member-auth/lib/standing';
  import { formatDollars } from '$admin-club/lib/ui';
  import { WAIVER_RELEASE_TEXT } from '$theme/waiver-text';
  import { TURNSTILE_SITE_KEY } from '$theme/turnstile';

  let { data }: { data: PageData } = $props();

  let tier = $state<MembershipTier>('individual');
  // `untrack` here is load-bearing, not a no-op: without it, `svelte-check` emits a
  // `state_referenced_locally` warning for each of these initializers (reading the reactive
  // `data` prop outside a `$derived`/`$effect`), which the project's gate treats as a failure.
  let purchaserName = $state(untrack(() => data.prefill.name));
  let purchaserEmail = $state(untrack(() => data.prefill.email));
  let purchaserPhone = $state(untrack(() => data.prefill.phone));
  let purchaserBirthdate = $state('');
  let members = $state<{ id: number; name: string; birthdate: string; email: string }[]>([]);
  // Index-aligned with the roster: picks[0] is the purchaser's pick, picks[i] is members[i - 1]'s.
  let picks = $state<string[]>(untrack(() => [data.prefill.classId]));
  let knownEmailHint = $state(false);
  let nextMemberRowId = 0;

  const { waiverAccepted } = applyJoin.fields;

  function selectTier(next: MembershipTier): void {
    tier = next;
    if (next !== 'family') {
      members = [];
      picks = picks.slice(0, 1);
    }
  }

  function addMember(): void {
    members.push({ id: nextMemberRowId++, name: '', birthdate: '', email: '' });
    picks.push('');
  }

  function removeMember(index: number): void {
    members.splice(index, 1);
    picks.splice(index + 1, 1);
  }

  async function onPurchaserEmailBlur(): Promise<void> {
    if (!purchaserEmail.trim()) {
      knownEmailHint = false;
      return;
    }
    const result = await checkKnownEmail(purchaserEmail);
    knownEmailHint = result.known;
  }

  const classById = $derived(new Map(data.classes.map((cls) => [cls.id, cls])));
  const classFeeById = $derived(new Map(data.classes.map((cls) => [cls.id, cls.fee])));

  // A full class's pick still shows in the running total's list of picks, but never prices or
  // spends a credit: the server rebuilds this same exclusion (`fullClassIds`) before ever calling
  // `computeJoinPricing`, so the client and the action agree on what counts toward the total.
  const openRosterPicks = $derived(
    picks
      .map((classId, memberIndex) => (classId && !classById.get(classId)?.isFull ? { memberIndex, classId } : null))
      .filter((pick): pick is { memberIndex: number; classId: string } => pick !== null),
  );

  const pricingInput = $derived<NormalizedJoinInput>({
    tier,
    purchaser: { name: purchaserName, email: purchaserEmail, phone: null, birthdate: null },
    members: members.map((member) => ({ name: member.name, birthdate: null, email: null })),
    classPicks: openRosterPicks,
    waiverAccepted: true,
  });

  const pricing = $derived(computeJoinPricing(pricingInput, data.prices, classFeeById));

  const renewalLinkSent = $derived(
    applyJoin.result && 'pivot' in applyJoin.result && applyJoin.result.pivot === 'renewal-link-sent',
  );

  $effect(() => {
    const result = applyJoin.result;
    const url = result && 'url' in result ? result.url : undefined;
    if (url) window.location.href = url;
  });
</script>

<svelte:head>
  <title>Join — {siteConfig.siteName}</title>
</svelte:head>

<h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">Join the club</h1>

{#if applyJoin.result && 'pivot' in applyJoin.result && applyJoin.result.pivot === 'email-in-use'}
  <div class="mt-l max-w-measure-wide rounded-box border border-info bg-info/10 p-m">
    <p class="m-0 font-semibold text-base-content">This email is already on file.</p>
    <p class="mt-xs mb-0 text-step--1 text-base-content">
      It looks like {purchaserEmail} already belongs to a club household. Sign in at
      <a href="/my-account">your account</a> to renew or register for a class, or email
      <a href="mailto:board@aksailingclub.org">board@aksailingclub.org</a> if that doesn't sound right.
    </p>
  </div>
{:else if renewalLinkSent}
  <div class="mt-l max-w-measure-wide rounded-box border border-info bg-info/10 p-m">
    <p class="m-0 font-semibold text-base-content">Check your inbox.</p>
    <p class="mt-xs mb-0 text-step--1 text-base-content">
      If that email is on our file, a sign-in link is on its way. Renew from your account, and
      register for classes there too.
    </p>
  </div>
{:else}
  <form {...applyJoin} class="mt-l flex max-w-measure-wide flex-col gap-m">
    {#each applyJoin.fields.allIssues() ?? [] as issue (issue.message)}
      <p class="rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">{issue.message}</p>
    {/each}

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Membership tier</legend>
      <div class="flex flex-col gap-xs">
        {#each ['individual', 'family', 'young-adult'] as const as option (option)}
          <label class="flex items-center gap-xs">
            <input
              type="radio"
              name="tier"
              value={option}
              checked={tier === option}
              onchange={() => selectTier(option)}
            />
            {MEMBERSHIP_TIER_LABEL[option]} — {formatDollars(data.prices[option])}/year
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Your details</legend>
      <div class="flex flex-col gap-s">
        <label class="flex flex-col gap-2xs text-step--1">
          Full name
          <input class="input w-full" name="purchaserName" autocomplete="name" placeholder="Full name" required bind:value={purchaserName} />
        </label>
        <label class="flex flex-col gap-2xs text-step--1">
          Email address
          <input
            class="input w-full"
            name="purchaserEmail"
            type="email"
            autocomplete="email"
            placeholder="Email address"
            required
            bind:value={purchaserEmail}
            onblur={onPurchaserEmailBlur}
          />
        </label>
        <label class="flex flex-col gap-2xs text-step--1">
          Phone number (optional)
          <input class="input w-full" name="purchaserPhone" type="tel" autocomplete="tel" placeholder="Phone number (optional)" bind:value={purchaserPhone} />
        </label>
        {#if tier === 'young-adult'}
          <label class="flex flex-col gap-2xs text-step--1">
            Birthdate (to verify you're under 26)
            <input class="input w-full" name="purchaserBirthdate" type="date" required bind:value={purchaserBirthdate} />
          </label>
        {/if}
        {#if knownEmailHint}
          <p class="m-0 text-step--2 text-muted">
            This looks like an email we already have on file. Submitting will pick up where you left off.
          </p>
        {/if}
      </div>
    </fieldset>

    {#if tier === 'family'}
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Household members</legend>
        <div class="flex flex-col gap-s">
          {#each members as member, index (member.id)}
            <div class="flex flex-wrap items-end gap-xs">
              <input
                class="input"
                name="members[{index}].name"
                placeholder="Name"
                aria-label="Household member name"
                required
                bind:value={member.name}
              />
              <input
                class="input"
                name="members[{index}].birthdate"
                type="date"
                aria-label="Household member birthdate"
                bind:value={member.birthdate}
              />
              <input
                class="input"
                name="members[{index}].email"
                type="email"
                placeholder="Email (optional)"
                aria-label="Household member email (optional)"
                bind:value={member.email}
              />
              <button type="button" class="btn btn-ghost btn-sm" onclick={() => removeMember(index)}>Remove</button>
            </div>
          {/each}
          <button type="button" class="btn btn-outline btn-sm self-start" onclick={addMember}>Add a household member</button>
        </div>
        <noscript>
          <p class="mt-xs mb-0 text-step--2 text-muted">
            Adding household members here needs JavaScript. You can add them later from your account.
          </p>
        </noscript>
      </fieldset>
    {/if}

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Classes (optional)</legend>
      <div class="flex flex-col gap-s">
        {#if data.classes.length === 0}
          <p class="m-0 text-step--1 text-muted">No classes are listed yet this season.</p>
        {:else}
          {#each [{ name: purchaserName || 'You', index: 0 }, ...members.map((member, i) => ({ name: member.name || `Household member ${i + 1}`, index: i + 1 }))] as slot (slot.index)}
            <label class="flex flex-col gap-2xs text-step--1">
              {slot.name}
              <select class="select w-full" name="picks[{slot.index}]" bind:value={picks[slot.index]}>
                <option value="">No class</option>
                {#each data.classes as cls (cls.id)}
                  <option value={cls.id}>
                    {cls.name}{cls.fee > 0 ? ` — ${formatDollars(cls.fee)}` : ' — free'}{cls.isFull ? ' (full — join waitlist)' : ''}
                  </option>
                {/each}
              </select>
            </label>
          {/each}
        {/if}
      </div>
    </fieldset>

    <div class="rounded-box border border-card-border p-m text-step--1">
      <p class="m-0 flex justify-between">
        <span>{MEMBERSHIP_TIER_LABEL[tier]} membership dues</span>
        <span>{formatDollars(Math.round(pricing.duesCents / 100))}</span>
      </p>
      {#each pricing.paidPicks as paidPick (paidPick.pickIndex)}
        {@const classId = openRosterPicks[paidPick.pickIndex]?.classId}
        <p class="m-0 flex justify-between">
          <span>{classById.get(classId ?? '')?.name ?? 'Class'} fee</span>
          <span>{formatDollars(Math.round(paidPick.amountCents / 100))}</span>
        </p>
      {/each}
      {#if pricing.coveredPicks.length > 0}
        <p class="m-0 text-muted">{pricing.coveredPicks.length} class credit{pricing.coveredPicks.length === 1 ? '' : 's'} applied.</p>
      {/if}
      <p class="mt-xs mb-0 flex justify-between font-semibold">
        <span>Total due today</span>
        <span>{formatDollars(Math.round(pricing.totalCents / 100))}</span>
      </p>
      {#if pricing.creditsGranted > 0}
        <p class="mt-xs mb-0 text-step--2 text-muted">
          {MEMBERSHIP_TIER_LABEL[tier]} membership includes {pricing.creditsGranted} class credit{pricing.creditsGranted === 1 ? '' : 's'}.
        </p>
      {/if}
    </div>

    <fieldset class="fieldset waiver-fieldset">
      <legend class="fieldset-legend">Liability release</legend>
      <details class="waiver-text">
        <summary>Read the release (version {data.waiverVersion})</summary>
        <p>{WAIVER_RELEASE_TEXT}</p>
      </details>
      <label class="mt-xs flex items-start gap-xs text-step--1">
        <input class="checkbox mt-[0.15em]" required {...waiverAccepted.as('checkbox')} />
        I have read and accept the liability release above (version {data.waiverVersion}).
      </label>
    </fieldset>

    <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY}></div>

    <button type="submit" class="btn btn-accent self-start" disabled={!!applyJoin.pending}>
      {applyJoin.pending ? 'Submitting…' : 'Join and continue to payment'}
    </button>

    {#if applyJoin.result && 'stub' in applyJoin.result}
      <p class="text-step--1 text-muted">Online payment isn't available yet; the club will follow up by email with how to pay.</p>
    {/if}
  </form>

  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
{/if}

<style>
  /* Matches ContactForm/DonateForm/the class-signup form's own eyebrow legend. */
  .fieldset-legend {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .waiver-fieldset {
    border: var(--border) solid var(--color-card-border);
    border-radius: var(--radius-box);
    padding: var(--spacing-s) var(--spacing-m);
  }
  .waiver-text summary {
    cursor: pointer;
    font-size: var(--text-step--1);
    color: var(--color-primary);
  }
  .waiver-text p {
    margin: var(--spacing-2xs) 0 0;
    font-size: var(--text-step--1);
    line-height: var(--leading-body);
    color: var(--color-muted);
  }
</style>
