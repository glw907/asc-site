<!-- @component
/my-account/finish-joining (member-waivers T5c): the join flow's payment-resume door. A family (or
a fresh purchaser) whose join the household-complete gate deferred lands here once every member has
signed -- from the managing adult's own completion coda on the signing page, or the resumption
email's deep link. The screen states plainly what is owed and offers one NAVY pay button (the
portal reserves fireweed for the masthead's renewal link alone), rebuilding the checkout server-
side from the persisted rows at then-current prices. An incomplete household never reaches this
page: `load` redirects it back to the signing moment. -->
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { formatMemberCents } from '$member-auth/lib/format';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Finish joining · My Account · {siteConfig.siteName}</title>
</svelte:head>

<a href="/my-account" class="portal-back-link">&larr; My account</a>

{#if !data.ready}
  <h1 class="portal-page-title">Finish joining</h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">This isn&#8217;t available right now. Please try again shortly.</p>
{:else}
  <h1 class="portal-page-title">One step left</h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">
    Everyone in your household has signed. The last step is payment for your {data.season} membership.
  </p>

  <form method="POST" action="?/pay" class="mt-l max-w-measure-wide">
    <input type="hidden" name="csrf" value={data.csrf} />

    <dl class="finish-lines">
      {#each data.lines as line (line.name)}
        <div class="finish-line">
          <dt>{line.name}</dt>
          <dd>{formatMemberCents(line.amountCents)}</dd>
        </div>
      {/each}
      <div class="finish-line finish-line-total">
        <dt>Total due today</dt>
        <dd>{formatMemberCents(data.amountCents)}</dd>
      </div>
    </dl>

    <button type="submit" class="btn btn-primary mt-m">Pay and finish joining</button>

    {#if form && 'joinPayStubbed' in form && form.joinPayStubbed}
      <p class="mt-xs mb-0 text-step--1 text-base-content">
        Online payment isn&#8217;t available yet; the club will follow up by email with how to pay.
      </p>
    {/if}
    {#if form && 'error' in form && form.error}
      <p class="mt-xs mb-0 text-step--1 text-error">{form.error}</p>
    {/if}
  </form>
{/if}

<style>
  .finish-lines {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2xs);
    margin: 0;
    padding: var(--spacing-m);
    border: 1px solid var(--color-card-border);
    border-radius: var(--radius-box);
  }
  .finish-line {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-s);
    color: var(--color-base-content);
  }
  .finish-line dt,
  .finish-line dd {
    margin: 0;
  }
  .finish-line dd {
    font-variant-numeric: tabular-nums;
  }
  .finish-line-total {
    margin-top: var(--spacing-2xs);
    padding-top: var(--spacing-2xs);
    border-top: 1px solid var(--color-card-border);
    font-weight: 600;
  }
</style>
