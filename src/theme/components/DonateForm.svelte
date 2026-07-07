<!-- @component
ASC's donate form (completion-pass manifest item 2): four preset amounts plus a custom amount,
an optional note, and Turnstile, matching the live site's own donate form. Posts through the
`createDonationCheckout` remote function (donate.remote.ts), which creates a Stripe Checkout
Session and returns its `url`; on success this redirects the browser there, the same
client-side redirect the live site's own vanilla-JS handler used. Mounted as a `donate-form`
island (see markdown/components.ts): the static build() fallback is a plain mailto link for a
reader with no JavaScript. -->
<script lang="ts">
  import { browser } from '$app/environment';
  import { createDonationCheckout } from '$theme/donate.remote';
  import { DONATE_PRESETS } from '$theme/donate-pricing';
  import { TURNSTILE_SITE_KEY } from '$theme/turnstile';

  // No props: an index signature (not an empty-object type) keeps this island component
  // assignable to IslandRegistry's Component<Record<string, unknown>> signature.
  let {}: Record<string, unknown> = $props();

  let selected = $state<number | null>(null);
  // Svelte binds a numeric input's value as a number (or undefined when the field is empty), not
  // a string.
  let custom = $state<number | undefined>(undefined);

  const amount = $derived(custom && custom > 0 ? custom : selected);

  function choosePreset(value: number): void {
    selected = value;
    custom = undefined;
  }

  $effect(() => {
    const url = createDonationCheckout.result?.url;
    if (browser && url) window.location.href = url;
  });
</script>

<div class="donate-form">
  <p class="mb-s text-step-0 text-base-content">Select an amount or enter a custom gift:</p>

  <form {...createDonationCheckout} class="flex max-w-measure-wide flex-col gap-m">
    {#each createDonationCheckout.fields.allIssues() ?? [] as issue (issue.message)}
      <p class="rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
        {issue.message}
      </p>
    {/each}

    <div class="flex flex-wrap gap-xs" role="group" aria-label="Preset donation amounts">
      {#each DONATE_PRESETS as preset (preset)}
        <button
          type="button"
          class="btn"
          class:btn-primary={selected === preset && !custom}
          onclick={() => choosePreset(preset)}
        >
          ${preset}
        </button>
      {/each}
    </div>

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Custom amount</legend>
      <label class="input w-full">
        <span aria-hidden="true">$</span>
        <input type="number" min="1" max="9999" placeholder="Other amount" bind:value={custom} />
      </label>
    </fieldset>

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Note to the club (optional)</legend>
      <textarea
        class="textarea h-24 w-full"
        name="note"
        maxlength="500"
        placeholder="In memory of someone, a specific purpose, or just to say hello."
      ></textarea>
    </fieldset>

    <input type="hidden" name="amount" value={amount ?? ''} />

    <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY}></div>

    <button
      type="submit"
      class="btn btn-primary self-start"
      disabled={!amount || amount < 1 || !!createDonationCheckout.pending}
    >
      {createDonationCheckout.pending ? 'Processing…' : amount ? `Donate $${Math.round(amount)}` : 'Donate'}
    </button>
  </form>

  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</div>

<style>
  /* Matches ContactForm's own eyebrow legend, the site's field-label convention. */
  .donate-form :global(.fieldset-legend) {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }
</style>
