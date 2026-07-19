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
outstanding document, rather than a full reload that would reset focus to the top.

Member-waivers T5b's own join/renewal household-complete loop: once the signer's own moment is
done, a still-incomplete household sees the waiting card(s) plus the household-signatures block
(each remaining adult's own cooldown-guarded nudge) in place of the plain completion coda; a
complete household sees the ordinary coda, whose own return link now names where it goes ("Back to
renewal," "Back to class signup") from `?next=`. Every form on this page re-appends `context`/
`next` to its own action string (SvelteKit's `?/name` convention replaces the whole query string on
submit, never merges into it), so a real household-loop context survives every sign in one sitting,
not just the first. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { MINOR_ATTESTATION_PROMPT } from './sign-view';
  import { SIGNER_RELATIONSHIPS } from '$member-portal/lib/signatures';
  import { nextPathLabel, DEFAULT_NEXT_PATH } from '$member-portal/lib/return-path';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  /** The key of the one form currently in flight (an entry's own `key`, `'contact-edit'`,
   *  `'contact-confirm'`, or `nudge-${row.key}`), or `null` when nothing is submitting. Scoped
   *  per-form (fix round, review finding) rather than one shared boolean: a shared flag disabled
   *  every form on the page for the duration of any one submit and, since `disabled` steals focus
   *  eligibility, could yank focus off a field in an unrelated entry the member was still reading. */
  let submittingKey: string | null = $state(null);
  /** The contact-confirm card's edit mode ("Update it" opens the same fields editable). */
  let editingContact = $state(false);
  /** The edit form's first field (Email) and the "Update it" button that opens it: entering and
   *  leaving edit mode swaps the whole branch (fix round, WCAG 2.4.3), so plain `onclick` handlers
   *  alone would drop keyboard/SR focus to `document.body` on both the "Update it" -> edit and the
   *  Cancel -> read-only transitions; {@link openEditingContact}/{@link cancelEditingContact} move
   *  it explicitly instead. */
  let contactEmailInputEl: HTMLInputElement | undefined = $state();
  let updateItButtonEl: HTMLButtonElement | undefined = $state();

  let listEl: HTMLElement | undefined = $state();
  let afterEl: HTMLElement | undefined = $state();

  /** The screen-reader confirmation live region's own text (fix round, WCAG 4.1.3): a polite
   *  `aria-live` region only re-announces when its text content actually CHANGES, but every
   *  `sign`/`confirmContact`/`updateContact` action previously returned the same static
   *  `{ saved: true }`, so a member clearing several documents in one sitting got an announcement
   *  for the first signature and silence for every one after it (the node's text was already
   *  "Signed.", so setting it to "Signed." again mutated nothing). Each handler below sets this to
   *  a fresh, specific string -- the just-signed title plus a running count for a `sign`, a fixed
   *  but distinct line for the contact-confirm step -- so consecutive signatures are always a real
   *  content change. */
  let announcement = $state('');

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

  /** `key`/`title` are the entry being signed, captured at the click that opened this submit
   *  (never read off `moment` after the fact, since a signed entry's own item may already be gone
   *  from the outstanding list by the time this runs). */
  const submitEnhance = (key: string, title: string) => {
    submittingKey = key;
    return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      submittingKey = null;
      await advanceFocus();
      announcement = moment ? `Signed ${title}. ${moment.signedCount} of ${moment.total} done.` : `Signed ${title}.`;
    };
  };

  const confirmEnhance = (key: string) => {
    submittingKey = key;
    return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      submittingKey = null;
      editingContact = false;
      await advanceFocus();
      announcement = 'Contact info confirmed.';
    };
  };

  /** `?/sendNudge`'s own submit handler: shares `submitEnhance`'s submittingKey/advanceFocus
   *  shape, but never touches `announcement` -- the nudge's own confirmation ("Sent.", below) is a
   *  plain visible status line, not part of the signing moment's own running commentary. */
  const nudgeEnhance = (key: string) => {
    submittingKey = key;
    return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      submittingKey = null;
      await advanceFocus();
    };
  };

  /** "Update it": opens the edit form and moves focus to its first field (WCAG 2.4.3), rather
   *  than leaving it to fall to `document.body` once the clicked button's own branch unmounts. */
  async function openEditingContact() {
    editingContact = true;
    await tick();
    contactEmailInputEl?.focus();
  }

  /** "Cancel": closes the edit form and returns focus to the "Update it" button that opened it
   *  (WCAG 2.4.3) -- the save path already has its own focus handling via `advanceFocus`. */
  async function cancelEditingContact() {
    editingContact = false;
    await tick();
    updateItButtonEl?.focus();
  }

  const moment = $derived(data.degraded ? null : data.moment);
  /** Nothing left for the person actually viewing the page, independent of the household loop
   *  below -- mirrors `sign-view.ts`'s own `signerOwnDone`, restated here as a component-local
   *  derivation of already-loaded data (the same idiom `showCompletion`/`showContactCard`
   *  already used before this task). */
  const signerFullyDone = $derived(
    !data.degraded && moment !== null && (moment.total === 0 || (moment.allSigned && !(data.contact.applies && !data.contact.confirmed))),
  );
  const showContactCard = $derived(
    !data.degraded && moment !== null && moment.total > 0 && moment.allSigned && data.contact.applies && !data.contact.confirmed,
  );
  /** The join/renewal household-complete loop (member-waivers T5b): the signer's own part is done,
   *  but another household adult still owes their own signatures, so payment stays locked and the
   *  household-signatures block replaces the plain completion coda. */
  const showWaiting = $derived(!data.degraded && signerFullyDone && data.household.active && !data.household.complete);
  const showCompletion = $derived(signerFullyDone && !showWaiting);

  /** `context`/`next` re-appended to every form's own action string: SvelteKit's own `?/name`
   *  convention REPLACES the current URL's whole query string on submit rather than merging into
   *  it, so a bare `action="?/sign"` on a page loaded as `?context=join` would silently record
   *  every second-and-later signature in this visit under the DEFAULT `renewal` context instead --
   *  a real household-loop context (join, class-signup, mooring-fee, storage-fee) must survive
   *  every submit in the same sitting, not just the first. */
  const contextQuery = $derived(!data.degraded ? `context=${encodeURIComponent(data.context)}${data.next ? `&next=${encodeURIComponent(data.next)}` : ''}` : '');
  const returnHref = $derived(!data.degraded ? (data.next ?? DEFAULT_NEXT_PATH) : DEFAULT_NEXT_PATH);
  const returnLabel = $derived(!data.degraded ? nextPathLabel(data.next) : nextPathLabel(null));
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
       sighted equivalent. `announcement` (fix round) is set fresh by each handler so consecutive
       signatures are always a real text change, not the same static "Signed." twice running. -->
  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

  {#if moment && moment.total > 0}
    <header class="signing-welcome">
      <h1 class="portal-page-title">{moment.welcome.heading}</h1>
      <!-- The household-complete loop's own waiting-state intro (signing-framing-copy.md) replaces
           the ordinary welcome body once the signer's own documents are done but another household
           adult is not; before that point the ordinary welcome body renders unchanged. -->
      <p class="signing-welcome-body">{showWaiting && data.household.introLine ? data.household.introLine : moment.welcome.body}</p>
    </header>
  {:else if moment && showWaiting}
    <!-- The signer had nothing of their own to sign this visit (they finished earlier, or nothing
         ever applied to them), but the household is still waiting -- there is no ordinary welcome
         to override, so this renders the same heading register on its own. -->
    <header class="signing-welcome">
      <h1 class="portal-page-title">Signatures for the {data.season} season.</h1>
      {#if data.household.introLine}<p class="signing-welcome-body">{data.household.introLine}</p>{/if}
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

                <form method="POST" action="?/sign&{contextQuery}" class="signing-strip" use:enhance={() => submitEnhance(entry.key, entry.title)}>
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
                      aria-describedby="signing-name-helper-{entry.key}"
                    />
                    <p id="signing-name-helper-{entry.key}" class="signing-name-helper">
                      The club keeps a record of the text you saw, your name as you typed it, and the date and time.
                    </p>
                  </div>

                  <button type="submit" class="btn signing-sign-btn" disabled={submittingKey === entry.key}>
                    {submittingKey === entry.key ? 'Signing…' : 'Sign'}
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
        <form method="POST" action="?/updateContact&{contextQuery}" class="signing-contact-form" use:enhance={() => confirmEnhance('contact-edit')}>
          <input type="hidden" name="csrf" value={data.csrf} />
          <div class="signing-contact-fields">
            <label class="signing-field">
              <span class="signing-field-label">Email</span>
              <input bind:this={contactEmailInputEl} class="input" type="email" name="email" autocomplete="email" value={data.contact.prefill.email} />
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
            <button type="submit" class="btn signing-sign-btn" disabled={submittingKey === 'contact-edit'}>{submittingKey === 'contact-edit' ? 'Saving…' : 'Save and confirm'}</button>
            <button type="button" class="portal-quiet-action portal-touch-btn btn btn-sm" onclick={cancelEditingContact}>Cancel</button>
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
          <form method="POST" action="?/confirmContact&{contextQuery}" use:enhance={() => confirmEnhance('contact-confirm')}>
            <input type="hidden" name="csrf" value={data.csrf} />
            <button type="submit" class="btn signing-sign-btn" disabled={submittingKey === 'contact-confirm'}>{submittingKey === 'contact-confirm' ? 'Saving…' : 'This is current'}</button>
          </form>
          <button bind:this={updateItButtonEl} type="button" class="portal-quiet-action portal-touch-btn btn btn-sm" onclick={openEditingContact}>Update it</button>
        </div>
      {/if}
    </section>
  {:else if showWaiting}
    <section class="signing-household" bind:this={afterEl} tabindex="-1" data-focus-target aria-labelledby="signing-household-title">
      <!-- The waiting card(s) (signing-framing-copy.md's "The waiting card"): one per outstanding
           OTHER adult, since the copy is written per-person. -->
      {#each data.household.rows.filter((row) => row.waitingCardTitle) as row (`card-${row.key}`)}
        <div class="signing-waiting-card">
          <h2 class="signing-done-title">{row.waitingCardTitle}</h2>
          <p class="signing-done-line">{row.waitingCardLine}</p>
        </div>
      {/each}

      <!-- The household-signatures block: "You" (already covered by the welcome line's own intro
           above), the household's minors once covered, and one row per other adult still owing
           their own signatures, each with its own cooldown-guarded nudge action. -->
      <h3 id="signing-household-title" class="signing-household-subhead">Household signatures</h3>
      <ul class="signing-household-rows">
        {#each data.household.rows as row (row.key)}
          <li class="signing-household-row">
            <span class="signing-household-label">{row.label}</span>
            <span class="signing-household-status">{row.statusText}</span>
            {#if row.nudgeMemberId}
              <form method="POST" action="?/sendNudge&{contextQuery}" use:enhance={() => nudgeEnhance(`nudge-${row.key}`)}>
                <input type="hidden" name="csrf" value={data.csrf} />
                <input type="hidden" name="targetMemberId" value={row.nudgeMemberId} />
                <button type="submit" class="portal-quiet-action portal-touch-btn btn btn-sm" disabled={submittingKey === `nudge-${row.key}`}>
                  {submittingKey === `nudge-${row.key}` ? 'Sending…' : row.nudgeButtonLabel}
                </button>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
      <!-- Rendered up front, empty, rather than only once `form.nudgeSent` is true (fix round,
           WCAG 4.1.3): a `role="status"` region a screen reader has never seen before is not
           reliably announced the instant it's inserted, only once it already exists and its text
           content changes. -->
      <p class="signing-done-line" role="status">{form && 'nudgeSent' in form && form.nudgeSent ? 'Sent.' : ''}</p>
      <a href="/my-account" class="portal-quiet-action portal-touch-btn btn btn-sm">I&#8217;ll come back later</a>
    </section>
  {:else if showCompletion}
    <section class="signing-done" bind:this={afterEl} tabindex="-1" data-focus-target aria-labelledby="signing-done-title">
      <h2 id="signing-done-title" class="signing-done-title">That&#8217;s everything for {data.season}.</h2>
      <p class="signing-done-line">Nothing else needs your signature until next season.</p>
      <a href={returnHref} class="portal-quiet-action portal-touch-btn btn btn-sm">{returnLabel}</a>
    </section>
  {/if}
{/if}
