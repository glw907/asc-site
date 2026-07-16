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

  // The first preset starts selected, so the submit button rests in its own active fireweed
  // state rather than the disabled gray one (the chosen fix; the alternative, a deliberate
  // gated-disabled treatment, would still ask a donor to make a choice before the button does
  // anything, where a sensible default asks for one fewer click and never reads as broken).
  let selected = $state<number | null>(DONATE_PRESETS[0] ?? null);
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
          class="btn preset-btn"
          class:btn-primary={selected === preset && !custom}
          onclick={() => choosePreset(preset)}
        >
          ${preset}
        </button>
      {/each}
    </div>

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Custom amount</legend>
      <!-- A currency-value width, not the full form measure, so the field reads as a short
           amount input rather than a name/email field wearing the wrong size. -->
      <label class="input w-32">
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

    <!-- `data-theme="auto"` follows light/dark mode; the reserved-space rule lives in site.css's
         shared `.cf-turnstile` rule. -->
    <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-theme="auto"></div>

    <!-- The site's own fireweed action class (asc-components.css's `.prose .asc-cta-btn`), not
         the plain navy `.btn-primary` — donating is this page's one genuine conversion action,
         the fireweed budget's natural spend here (this page's only other tint is the sage facts
         strip, no second CTA). -->
    <button
      type="submit"
      class="asc-cta-btn self-start"
      disabled={!amount || amount < 1 || !!createDonationCheckout.pending}
    >
      {createDonationCheckout.pending ? 'Processing…' : amount ? `Donate $${Math.round(amount)}` : 'Donate'}
    </button>
  </form>

  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</div>

<style>
  /* The submit button's pending state: `.asc-cta-btn` carries no disabled treatment of
     its own (every other consumer is a plain link, never disableable), so this button-only state
     is local to the one consumer that needs it. */
  .donate-form :global(.asc-cta-btn:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Matches ContactForm's own eyebrow legend, the site's field-label convention. */
  .donate-form :global(.fieldset-legend) {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }

  /* Dark-mode preset-amount contrast fix (2026-07-15 invisible-polish fix, color lens finding):
     DaisyUI's plain `.btn` renders its border and fill at the same base-200 lightness as the dark
     theme's own page ground (measured via rendered pixels, not computed CSS: fill-vs-page-
     background contrast 1.00:1, no visible edge), so an unselected preset button disappears into
     the page. `--color-card-border` is the site's own existing token for a hairline that stays
     visible on a dark ground (already dark-mode-adjusted in theme.css); reusing it here gives the
     unselected state a real edge with no new color. The selected `.btn-primary` state already
     reads clearly via its navy fill, so `:not(.btn-primary)` leaves it untouched, and light mode
     is untouched too (its own border already reads fine, unflagged by the audit). */
  :global([data-theme='asc-dark']) .preset-btn:not(.btn-primary) {
    border-color: var(--color-card-border);
  }
</style>
