<!-- @component
/my-account/sign (member-waivers T4, the RATIFIED probe design): the one continuous signing
moment. A hairline accordion IS the progress -- signed entries collapse to a receipt line, the
current document expands with a quiet "Document i of N" eyebrow and its framed sheet, upcoming
entries sit muted. The sheet is a white framed object whose bottom edge is the signature strip
(sage ground, typed-name field, the portal's one filled navy Sign button; zero fireweed, zero
gold). A household minor's Part Two is one entry per child with the AS 09.65.292 attestation
radios in the strip; "type once, sign each" prefills the name and carries the attestation forward.
For a mooring or storage holder the moment ends with the contact-confirm glance card, then the
completion coda. Every member-facing word is verbatim from docs/waivers/signing-framing-copy.md.

Each sign uses `use:enhance` so a signed entry collapses in place and focus advances to the next
outstanding document, rather than a full reload that would reset focus to the top. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { MINOR_ATTESTATION_PROMPT } from './sign-view';
  import { SIGNER_RELATIONSHIPS } from '$member-portal/lib/signatures';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  /** True while a sign or confirm request is in flight, so the submitted button shows its working
   *  state and cannot be double-fired. */
  let submitting = $state(false);
  /** The contact-confirm card's edit mode ("Update it" opens the same fields editable). */
  let editingContact = $state(false);

  let listEl: HTMLElement | undefined = $state();
  let afterEl: HTMLElement | undefined = $state();

  function reducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** After a sign lands and the load re-derives, move focus to the next outstanding document (its
   *  name field), or to the after-region (contact card or completion) when nothing remains -- the
   *  "focus advances to the next unsigned document" rule. */
  async function advanceFocus() {
    await tick();
    const target = listEl?.querySelector<HTMLElement>('[data-focus-target]') ?? afterEl ?? null;
    if (!target) return;
    target.focus();
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }

  const submitEnhance = () => {
    submitting = true;
    return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      submitting = false;
      await advanceFocus();
    };
  };

  const confirmEnhance = () => {
    submitting = true;
    return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      submitting = false;
      editingContact = false;
      await advanceFocus();
    };
  };

  const moment = $derived(data.degraded ? null : data.moment);
  const showCompletion = $derived(
    !data.degraded && moment !== null && (moment.total === 0 || (moment.allSigned && !(data.contact.applies && !data.contact.confirmed))),
  );
  const showContactCard = $derived(
    !data.degraded && moment !== null && moment.total > 0 && moment.allSigned && data.contact.applies && !data.contact.confirmed,
  );
</script>

<svelte:head>
  <title>Sign — My Account — {siteConfig.siteName}</title>
</svelte:head>

<a href="/my-account" class="portal-back-link">&larr; My account</a>

{#if data.degraded}
  <h1 class="portal-page-title">Signatures</h1>
  <p class="mt-s max-w-measure text-step-0 text-muted">This isn&#8217;t available right now. Please try again in a moment.</p>
{:else}
  <!-- Screen-reader confirmation of a just-recorded signature; the visible receipt below is the
       sighted equivalent. -->
  <p class="sr-only" role="status" aria-live="polite">
    {#if form && 'saved' in form && form.saved}Signed.{/if}
  </p>

  {#if moment && moment.total > 0}
    <header class="signing-welcome">
      <h1 class="portal-page-title">{moment.welcome.heading}</h1>
      <p class="signing-welcome-body">{moment.welcome.body}</p>
    </header>
  {/if}

  {#if form && 'error' in form && form.error}
    <p class="signing-alert" role="alert">{form.error}</p>
  {/if}

  {#if moment && moment.total > 0}
    <ol class="signing-list" bind:this={listEl}>
      {#each moment.entries as entry (entry.key)}
        <li class="signing-entry" data-state={entry.state}>
          {#if entry.state === 'signed'}
            <div class="signing-receipt">
              <span class="signing-receipt-title">{entry.title}</span>
              <span class="signing-receipt-note">{entry.receiptText}</span>
            </div>
          {:else if entry.state === 'current'}
            <div class="signing-current">
              <p class="signing-eyebrow">{entry.progressLabel}</p>
              <h2 class="signing-entry-title">{entry.title}</h2>
              {#if entry.minor}
                <p class="signing-minor-id">
                  For {entry.minor.name}{#if entry.minor.birthYear}<span class="signing-minor-born"> · born {entry.minor.birthYear}</span>{/if}
                </p>
              {/if}
              <p class="signing-framing">{entry.framingLine}</p>

              <div class="signing-sheet">
                <div class="signing-sheet-text prose">{@html entry.bodyHtml}</div>

                <form method="POST" action="?/sign" class="signing-strip" use:enhance={submitEnhance}>
                  <input type="hidden" name="csrf" value={data.csrf} />
                  <input type="hidden" name="documentId" value={entry.documentId} />
                  <input type="hidden" name="version" value={entry.version} />
                  {#if entry.minor}
                    <input type="hidden" name="minorMemberId" value={entry.minor.memberId} />
                    <fieldset class="signing-attest">
                      <legend class="signing-attest-prompt">{MINOR_ATTESTATION_PROMPT}</legend>
                      {#each SIGNER_RELATIONSHIPS as relationship (relationship.value)}
                        <label class="signing-attest-option">
                          <input type="radio" name="relationship" value={relationship.value} class="radio radio-sm" checked={entry.carriedRelationship === relationship.value} required />
                          <span>{relationship.label}</span>
                        </label>
                      {/each}
                    </fieldset>
                  {/if}

                  <div class="signing-name-field">
                    <label class="signing-name-label" for="signing-name-{entry.key}">Type your full legal name</label>
                    <input
                      id="signing-name-{entry.key}"
                      class="input signing-name-input"
                      type="text"
                      name="name"
                      autocomplete="name"
                      value={entry.prefillName}
                      required
                      data-focus-target
                    />
                    <p class="signing-name-helper">
                      The club keeps a record of the text you saw, your name as you typed it, and the date and time.
                    </p>
                  </div>

                  <button type="submit" class="btn signing-sign-btn" disabled={submitting}>
                    {submitting ? 'Signing…' : 'Sign'}
                  </button>
                </form>
              </div>
            </div>
          {:else}
            <div class="signing-upcoming">
              <span class="signing-upcoming-title">{entry.title}</span>
              <span class="signing-upcoming-note">Still to sign</span>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}

  {#if showContactCard}
    <section class="signing-contact" bind:this={afterEl} tabindex="-1" data-focus-target aria-labelledby="signing-contact-title">
      <h2 id="signing-contact-title" class="signing-contact-title">Can the club reach you?</h2>
      <p class="signing-contact-line">
        If your boat or stored property ever has to move on short notice, the clock starts when the club contacts you. Confirm this is current.
      </p>

      {#if editingContact}
        <form method="POST" action="?/updateContact" class="signing-contact-form" use:enhance={confirmEnhance}>
          <input type="hidden" name="csrf" value={data.csrf} />
          <div class="signing-contact-fields">
            <label class="signing-field">
              <span class="signing-field-label">Email</span>
              <input class="input" type="email" name="email" autocomplete="email" value={data.contact.prefill.email} />
            </label>
            <label class="signing-field">
              <span class="signing-field-label">Phone</span>
              <input class="input" type="tel" name="phone" autocomplete="tel" value={data.contact.prefill.phone} />
            </label>
            <label class="signing-field signing-field-wide">
              <span class="signing-field-label">Mailing address</span>
              <input class="input" type="text" name="addressLine1" autocomplete="address-line1" placeholder="Street address" value={data.contact.prefill.addressLine1} />
            </label>
            <label class="signing-field signing-field-wide">
              <span class="signing-field-label signing-field-label-hidden">Address line 2</span>
              <input class="input" type="text" name="addressLine2" autocomplete="address-line2" placeholder="Apartment, unit (optional)" value={data.contact.prefill.addressLine2} />
            </label>
            <label class="signing-field">
              <span class="signing-field-label">City</span>
              <input class="input" type="text" name="city" autocomplete="address-level2" value={data.contact.prefill.city} />
            </label>
            <label class="signing-field">
              <span class="signing-field-label">State</span>
              <input class="input" type="text" name="state" autocomplete="address-level1" value={data.contact.prefill.state} />
            </label>
            <label class="signing-field">
              <span class="signing-field-label">ZIP</span>
              <input class="input" type="text" name="postalCode" autocomplete="postal-code" value={data.contact.prefill.postalCode} />
            </label>
          </div>
          <div class="signing-contact-actions">
            <button type="submit" class="btn signing-sign-btn" disabled={submitting}>{submitting ? 'Saving…' : 'Save and confirm'}</button>
            <button type="button" class="portal-quiet-action portal-touch-btn btn btn-sm" onclick={() => (editingContact = false)}>Cancel</button>
          </div>
        </form>
      {:else}
        <dl class="signing-contact-rows">
          <div class="signing-contact-row">
            <dt>Email</dt>
            <dd>{data.contact.prefill.email || '—'}</dd>
          </div>
          <div class="signing-contact-row">
            <dt>Phone</dt>
            <dd>{data.contact.prefill.phone || '—'}</dd>
          </div>
          <div class="signing-contact-row">
            <dt>Mailing address</dt>
            <dd>
              {#if data.contact.prefill.addressLine1 || data.contact.prefill.city}
                {[data.contact.prefill.addressLine1, data.contact.prefill.addressLine2, [data.contact.prefill.city, data.contact.prefill.state].filter(Boolean).join(', '), data.contact.prefill.postalCode].filter(Boolean).join(' · ')}
              {:else}
                —
              {/if}
            </dd>
          </div>
        </dl>
        <div class="signing-contact-actions">
          <form method="POST" action="?/confirmContact" use:enhance={confirmEnhance}>
            <input type="hidden" name="csrf" value={data.csrf} />
            <button type="submit" class="btn signing-sign-btn" disabled={submitting}>{submitting ? 'Saving…' : 'This is current'}</button>
          </form>
          <button type="button" class="portal-quiet-action portal-touch-btn btn btn-sm" onclick={() => (editingContact = true)}>Update it</button>
        </div>
      {/if}
    </section>
  {:else if showCompletion}
    <section class="signing-done" bind:this={afterEl} tabindex="-1" data-focus-target aria-labelledby="signing-done-title">
      <h2 id="signing-done-title" class="signing-done-title">That&#8217;s everything for {data.season}.</h2>
      <p class="signing-done-line">Nothing else needs your signature until next season.</p>
      <a href="/my-account" class="portal-quiet-action portal-touch-btn btn btn-sm">Back to your account</a>
    </section>
  {/if}
{/if}
