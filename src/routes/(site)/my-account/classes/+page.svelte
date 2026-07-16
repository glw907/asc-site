<!-- @component
/my-account/classes: register with the who's-taking-it selector (age-gated by track, a member
with no birthdate on file is asked for it inline), my classes with withdraw, and my waitlist with
leave/claim/pass on a live offer (design doc's own "2. Classes"). -->
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { CLASS_TRACK_LABEL } from '$admin-club/lib/classes-store';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Classes — My Account — {siteConfig.siteName}</title>
</svelte:head>

<a href="/my-account" class="text-step--1 text-primary underline-offset-2 hover:underline">&larr; My account</a>

<h1 class="mt-xs m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
  Classes
</h1>

{#if form && 'error' in form && form.error}
  <p class="mt-s max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">{form.error}</p>
{/if}

{#if data.myClasses.length > 0}
  <section class="mt-l max-w-measure-wide">
    <h2 class="m-0 text-step-1 font-semibold text-base-content">My classes</h2>
    <ul class="mt-xs flex flex-col gap-xs">
      {#each data.myClasses as row (row.enrollmentId)}
        <li class="rounded-box border border-card-border bg-base-100 p-s text-step--1">
          <div class="flex flex-wrap items-center justify-between gap-xs">
            <span class="text-base-content">{row.className} — {row.memberName}</span>
            <form method="POST" action="?/withdraw">
              <input type="hidden" name="csrf" value={data.csrf} />
              <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
              <button type="submit" class="btn btn-ghost btn-xs">Withdraw</button>
            </form>
          </div>
          {#if row.startDate}<p class="mt-2xs mb-0 text-muted">{row.startDate}{row.location ? ` · ${row.location}` : ''}</p>{/if}
          {#if row.creditRedeemed}<p class="mt-2xs mb-0 text-muted">Paid with a class credit</p>{/if}
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <section class="mt-l max-w-measure-wide">
    <h2 class="m-0 text-step-1 font-semibold text-base-content">My classes</h2>
    <p class="mt-xs mb-0 text-step--1 text-muted">No classes on your account yet.</p>
  </section>
{/if}

{#if data.myWaitlist.length > 0}
  <section class="mt-l max-w-measure-wide">
    <h2 class="m-0 text-step-1 font-semibold text-base-content">My waitlist</h2>
    <ul class="mt-xs flex flex-col gap-xs">
      {#each data.myWaitlist as row (row.waitlistId)}
        <li class="rounded-box border border-card-border bg-base-100 p-s text-step--1">
          <p class="m-0 text-base-content">{row.className}: position {row.position} of {row.queueLength}</p>
          {#if row.offer}
            <div class="mt-xs flex flex-wrap items-center gap-xs">
              <span class="text-warning">A spot is open for you until {row.offer.expiresAt}.</span>
              <form method="POST" action="?/claimOffer">
                <input type="hidden" name="csrf" value={data.csrf} />
                <input type="hidden" name="waitlistId" value={row.waitlistId} />
                <button type="submit" class="btn btn-primary btn-xs">Claim</button>
              </form>
              <form method="POST" action="?/passOffer">
                <input type="hidden" name="csrf" value={data.csrf} />
                <input type="hidden" name="waitlistId" value={row.waitlistId} />
                <button type="submit" class="btn btn-ghost btn-xs">Pass this time</button>
              </form>
            </div>
          {:else}
            <form method="POST" action="?/leaveWaitlist" class="mt-xs">
              <input type="hidden" name="csrf" value={data.csrf} />
              <input type="hidden" name="waitlistId" value={row.waitlistId} />
              <button type="submit" class="btn btn-ghost btn-xs">Leave waitlist</button>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <section class="mt-l max-w-measure-wide">
    <h2 class="m-0 text-step-1 font-semibold text-base-content">My waitlist</h2>
    <p class="mt-xs mb-0 text-step--1 text-muted">Not on any waitlist right now.</p>
  </section>
{/if}

<section class="mt-l max-w-measure-wide">
  <h2 class="m-0 text-step-1 font-semibold text-base-content">Register</h2>
  <ul class="mt-xs flex flex-col gap-xs">
    {#each data.openClasses as cls (cls.id)}
      <li class="rounded-box border border-card-border bg-base-100 p-s text-step--1">
        <p class="m-0 font-semibold text-base-content">{cls.name}</p>
        <p class="mt-2xs mb-0 text-muted">
          {CLASS_TRACK_LABEL[cls.track]}{cls.startDate ? ` · ${cls.startDate}` : ''}
          {cls.fee > 0 ? ` · $${cls.fee}` : ' · free'}
          {cls.open ? '' : ' · full'}
        </p>

        {#if cls.enrollees.length === 0}
          <p class="mt-xs mb-0 text-muted">No eligible household member on file for this track.</p>
        {:else}
          <form method="POST" action={cls.open ? '?/register' : '?/joinWaitlist'} class="mt-xs flex flex-wrap items-end gap-xs">
            <input type="hidden" name="csrf" value={data.csrf} />
            <input type="hidden" name="classId" value={cls.id} />
            <fieldset class="fieldset m-0">
              <legend class="fieldset-legend">Who's taking it?</legend>
              <select name="memberId" class="select select-sm">
                {#each cls.enrollees as enrollee (enrollee.memberId)}
                  <option value={enrollee.memberId} disabled={!enrollee.eligible}>
                    {enrollee.name}{enrollee.needsBirthdate ? ' (add a birthdate first)' : !enrollee.eligible ? ' (not eligible for this track)' : ''}
                  </option>
                {/each}
              </select>
            </fieldset>
            <button type="submit" class="btn btn-primary btn-sm">{cls.open ? 'Register' : 'Join waitlist'}</button>
          </form>
        {/if}
      </li>
    {:else}
      <li class="text-step--1 text-muted">No open classes right now.</li>
    {/each}
  </ul>
</section>

<style>
  .fieldset-legend {
    font-family: var(--font-display);
    font-size: var(--text-step--2);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }
</style>
