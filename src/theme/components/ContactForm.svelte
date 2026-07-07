<!-- @component
ASC's contact form (completion-pass manifest item 2): posts through the `sendMessage` remote
function (contact.remote.ts), which routes the message to the right volunteer committee by
category (contact-routing.ts, ported from the retiring Worker's own routing map). Mounted as a
`contact-form` island (see markdown/components.ts): the static build() fallback is a plain
mailto link for a reader with no JavaScript, and this component is the live, interactive form
that replaces it once mounted. Styled on the DaisyUI v5 default (bordered inputs, no
`-bordered` modifier; a `<fieldset>` groups each field, matching the family's own ContactForm
precedent in ecxc.ski). -->
<script lang="ts">
  import { sendMessage } from '$theme/contact.remote';
  import { CONTACT_CATEGORIES } from '$theme/contact-routing';
  import { TURNSTILE_SITE_KEY } from '$theme/turnstile';

  // No props: an index signature (not an empty-object type) keeps this island component
  // assignable to IslandRegistry's Component<Record<string, unknown>> signature.
  let {}: Record<string, unknown> = $props();

  const { name, email, phone, message } = sendMessage.fields;
</script>

<div class="contact-form">
  {#if sendMessage.result?.success}
    <p class="text-success">Message sent. We typically respond within a few days.</p>
  {:else}
    <form {...sendMessage} class="flex max-w-measure-wide flex-col gap-m">
      {#each sendMessage.fields.allIssues() ?? [] as issue (issue.message)}
        <p class="rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
          {issue.message}
        </p>
      {/each}

      <fieldset class="fieldset">
        <legend class="fieldset-legend">Full name</legend>
        <input class="input w-full" autocomplete="name" required {...name.as('text')} />
      </fieldset>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">Email address</legend>
        <input class="input w-full" autocomplete="email" required {...email.as('email')} />
      </fieldset>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">Phone number</legend>
        <input class="input w-full" autocomplete="tel" required {...phone.as('tel')} />
      </fieldset>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">How can we help you?</legend>
        <select class="select w-full" name="category" required>
          <option value="" disabled selected>Choose one&hellip;</option>
          {#each CONTACT_CATEGORIES as category (category.value)}
            <option value={category.value}>{category.label}</option>
          {/each}
        </select>
      </fieldset>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">Message</legend>
        <textarea class="textarea h-32 w-full" required {...message.as('text')}></textarea>
      </fieldset>

      <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY}></div>

      <button type="submit" class="btn btn-primary self-start" disabled={!!sendMessage.pending}>
        {sendMessage.pending ? 'Sending…' : 'Send message'}
      </button>
    </form>

    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  {/if}
</div>

<style>
  /* DaisyUI's default fieldset-legend is a plain small label; the site's own eyebrow device
     (uppercase, tracked, muted, on the display face) is what the pre-rebuild form used for its
     field labels, matching the family's own ContactForm precedent. */
  .contact-form :global(.fieldset-legend) {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }
</style>
