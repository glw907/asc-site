<!--
@component
The Compose screen (`/admin/club/email/compose`): a landing history list plus a compose-then-
review flow for a one-off segment email. Three steps live in one component rather than three
routes (there is nothing to deep-link to mid-draft): `landing` (past blasts, "New email"),
`compose` (segment picker, subject, body, a click-to-insert variable palette, a live sample-data
preview), and `review` (the server's own resolved recipient count and a sample roster, "Send test
to me", and a confirm dialog whose own button reads "Send to N recipients" -- the design's own
count-acknowledging gate). Every form here posts through this route's three actions and uses
`use:enhance` only to avoid a full-page reload between steps; the actions themselves are the real
gate; nothing here trusts a count this component computed on its own.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { ActionData, PageData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import { FieldLabel, SelectField, TextField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL, formatClubTimestamp } from '$admin-club/lib/ui';
  import { renderTemplateWithVariables } from '$admin-club/lib/club-email';
  import type { ComposeReviewResult, ComposeSendResult, ComposeTestResult } from './+page.server';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  /** Sample values for the compose/review step's own live preview only -- never what a real send
   *  renders with (each recipient's own `sendSegmentBlast` call resolves `person_name` from that
   *  recipient, `portal_url`/`committee_email` from the send-time env, see `bulk-email.ts`). */
  const PREVIEW_SAMPLE_VARS = { person_name: 'Sample Member', portal_url: '/my-account', committee_email: 'membership-committee@aksailingclub.org' };

  // A deep link's `segment` param (the "Email class members" nav entry, T5) preselects the picker
  // and lands directly on the compose step; the server-resolved `presetSegmentKey` seeds this
  // component's own state once, at mount (`untrack` marks that on purpose -- a later navigation to
  // a different `segment` param remounts this route from a different sidebar entry, it does not
  // update these in place). The two-step review/send resolve still runs server-side from scratch
  // either way (see this route's own `+page.server.ts` header).
  const initialPreset = untrack(() => data.presetSegmentKey);
  let step: 'landing' | 'compose' | 'review' = $state(initialPreset ? 'compose' : 'landing');
  let segmentKey = $state(initialPreset ?? '');
  let subject = $state('');
  let body = $state('');
  let bodyField: HTMLTextAreaElement | undefined = $state();
  let sendDialog: HTMLDialogElement | undefined = $state();

  let review: ComposeReviewResult | null = $state(null);
  let testStatus: ComposeTestResult | null = $state(null);
  let sendResult: ComposeSendResult | null = $state(null);

  const preview = $derived(renderTemplateWithVariables(subject, body, PREVIEW_SAMPLE_VARS));

  /** The review step's own "N recipient(s)" phrase, pluralized in one place for the four spots that
   *  render it (the step subtitle, the send button, and the confirm dialog's heading and button).
   *  Empty off the review step; only ever rendered inside the `step === 'review' && review` block. */
  const recipientCountLabel = $derived.by(() => {
    const resolved = review;
    return resolved ? `${resolved.recipientCount} recipient${resolved.recipientCount === 1 ? '' : 's'}` : '';
  });

  /** The compose step's own page-top banner: any `fail()` this route's actions return with no
   *  `kind` and no `stage: 'review'` tag (the `review` action's own field-validation failures,
   *  the only kind-less failure that can happen while still on the compose step). */
  const composeError = $derived(
    form && 'error' in form && !('kind' in form) && !('stage' in form && form.stage === 'review') ? form.error : null,
  );

  /** The review step's own inline banner, near its own actions: the `send` action's field-
   *  validation failures (`stage: 'review'`, see the server action), unified with the review
   *  step's existing `test`-send failure display rather than the page-top banner (item 9). */
  const sendError = $derived(form && 'error' in form && 'stage' in form && form.stage === 'review' ? form.error : null);

  // Every action's result routes here: `review` advances the step and seeds this screen's own
  // review state, `test` only ever updates the inline test-send status, `send` returns to the
  // landing list (whose blast history `update()`'s own `invalidateAll` just refreshed) and clears
  // the draft.
  $effect(() => {
    if (!form || !('kind' in form)) return;
    if (form.kind === 'review') {
      review = form;
      testStatus = null;
      step = 'review';
    } else if (form.kind === 'test') {
      testStatus = form;
    } else if (form.kind === 'sent') {
      sendResult = form;
      review = null;
      testStatus = null;
      segmentKey = '';
      subject = '';
      body = '';
      step = 'landing';
    }
  });

  /** Every plain form on this screen: refresh `data`/`form` from the server's own response (the
   *  same `update()` the household desk's dialogs call) without a full-page navigation.
   *  `reset: false` is load-bearing, not cosmetic: SvelteKit's default `update()` also resets the
   *  underlying native `<form>`, and Svelte 5's `bind:value` re-syncs an input back to its own
   *  `defaultValue` on a native reset. With the default `reset: true`, the compose form's own
   *  `bind:value`-d `segmentKey`/`subject`/`body` state would be wiped back to `''` the instant
   *  the `review` action's response settles -- the compose-to-review transition would silently
   *  clear the very draft it is supposed to carry into review, and the review step's hidden
   *  inputs would then post an empty draft to `?/send`. */
  function onSettle(): SubmitFunction {
    return () => async ({ update }) => {
      await update({ reset: false });
    };
  }

  /** The confirm dialog's own submit handler. Cannot use `method="dialog"`: `use:enhance`'s own
   *  dev-mode guard throws for any form whose `method` is not `"post"`. So this is an ordinary
   *  `method="post"` form and the dialog is closed explicitly here, at submit time, rather than
   *  relying on `method="dialog"`'s own implicit close -- there is no reason to keep the confirm
   *  modal open while the send itself is in flight. */
  function onSendSubmit(): SubmitFunction {
    return () => {
      sendDialog?.close();
      return async ({ update }) => {
        await update({ reset: false });
      };
    };
  }

  function startCompose() {
    sendResult = null;
    step = 'compose';
  }

  /** Insert `{{token}}` at the body textarea's own cursor (the email template edit screen's own
   *  click-to-insert idiom, `email/[id]/+page.svelte`). */
  function insertVariable(token: string) {
    if (!bodyField) return;
    const start = bodyField.selectionStart ?? body.length;
    const end = bodyField.selectionEnd ?? body.length;
    const snippet = `{{${token}}}`;
    body = body.slice(0, start) + snippet + body.slice(end);
    const cursor = start + snippet.length;
    queueMicrotask(() => bodyField?.setSelectionRange(cursor, cursor));
    bodyField.focus();
  }

  const VARIABLE_TOKENS = ['person_name', 'portal_url', 'committee_email'];
</script>

<a href="/admin/club/email" class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary">
  <span aria-hidden="true">&larr;</span> Back to Email
</a>

<p
  class="text-sm font-medium text-error {composeError ? 'mb-4 rounded-box border border-[var(--cairn-card-border)] px-4 py-3' : ''}"
  role="alert"
>{composeError ?? ''}</p>

{#if step === 'landing'}
  <OfficeList eyebrow="Club" title="Compose" subtitle={data.error ?? `${data.blasts.length} past ${data.blasts.length === 1 ? 'blast' : 'blasts'}.`}>
    {#snippet action()}
      <button type="button" class="btn btn-primary btn-sm" onclick={startCompose}>New email</button>
    {/snippet}

    <p
      class="text-sm font-medium text-success {sendResult ? 'border-b border-[var(--cairn-card-border)] px-6 py-3' : ''}"
      role="status"
    >{sendResult ? `Sent to ${sendResult.segmentLabel}: ${sendResult.sentCount} delivered${sendResult.failedCount > 0 ? `, ${sendResult.failedCount} failed` : ''}.` : ''}</p>

    <table class="table">
      <caption class="sr-only">Past segment blasts, newest first</caption>
      <thead>
        <tr>
          <th class={HEADER_CELL}>Segment</th>
          <th class={HEADER_CELL}>Subject</th>
          <th class="{HEADER_CELL} w-32">Recipients</th>
          <th class="{HEADER_CELL} w-40">Actor</th>
          <th class="{HEADER_CELL} w-40">Sent</th>
        </tr>
      </thead>
      <tbody>
        {#each data.blasts as blast (blast.id)}
          <tr class="transition-colors hover:bg-base-200/60">
            <td class="text-sm">{blast.segmentLabel}</td>
            <td class="text-sm text-muted">{blast.subject}</td>
            <td class="text-sm tabular-nums text-muted">
              {blast.sentCount} / {blast.recipientCount}
              {#if blast.failedCount > 0}
                <span class="badge badge-error badge-sm ml-1">{blast.failedCount} failed</span>
              {/if}
            </td>
            <td class="text-sm text-muted">{blast.actor}</td>
            <td class="whitespace-nowrap text-sm tabular-nums text-muted">{formatClubTimestamp(blast.createdAt)}</td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="px-6 py-10 text-center text-sm text-muted">No blasts sent yet.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </OfficeList>
{:else if step === 'compose'}
  <OfficeList eyebrow="Club" title="Compose" subtitle="Pick a segment, write the email, then review who it reaches.">
    <form method="post" action="?/review" use:enhance={onSettle()}>
      <div class="grid gap-6 p-6 lg:grid-cols-2">
        <section class="flex flex-col gap-4">
          <SelectField
            label="Segment"
            name="segmentKey"
            bind:value={segmentKey}
            options={data.segmentOptions.map((option) => ({ value: option.key, label: option.label }))}
          />
          <TextField label="Subject" name="subject" bind:value={subject} />
          <FieldLabel label="Body (markdown)">
            <textarea bind:this={bodyField} class="textarea textarea-sm w-full font-mono" name="body" rows="12" bind:value={body}
            ></textarea>
          </FieldLabel>
          <div>
            <h2 class={HEADER_CELL}>Variables</h2>
            <p class="mt-1 text-xs text-muted">Click one to insert it into the body at your cursor.</p>
            <ul class="mt-2 flex list-none flex-wrap gap-2">
              {#each VARIABLE_TOKENS as token (token)}
                <li>
                  <button type="button" class="badge badge-outline font-mono" onclick={() => insertVariable(token)}>
                    {`{{${token}}}`}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        </section>

        <section>
          <h2 class={HEADER_CELL}>Sample-data preview</h2>
          <p class="mt-1 text-xs text-muted">Rendered with placeholder values, through the same render a real send uses.</p>
          <p class="mt-2 text-sm font-medium">{preview.subject}</p>
          <div class="prose mt-2 max-w-none rounded-box border border-[var(--cairn-card-border)] p-4 text-sm">
            {@html preview.html}
          </div>
        </section>
      </div>

      <div class="flex justify-between gap-2 border-t border-[var(--cairn-card-border)] p-6">
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => (step = 'landing')}>Back</button>
        <div class="flex gap-2">
          <CsrfField />
          <button type="submit" class="btn btn-primary btn-sm" disabled={!segmentKey || !subject || !body.trim()}>
            Continue to review
          </button>
        </div>
      </div>
    </form>
  </OfficeList>
{:else if step === 'review' && review}
  <OfficeList eyebrow="Club" title="Review" subtitle="{review.segmentLabel}: {recipientCountLabel}.">
    <p
      class="text-sm font-medium {testStatus ? (testStatus.ok ? 'border-b border-[var(--cairn-card-border)] px-6 py-3 text-success' : 'border-b border-[var(--cairn-card-border)] px-6 py-3 text-error') : ''}"
      role="status"
    >{testStatus ? (testStatus.ok ? `Test sent to ${data.editorEmail}.` : `Test failed: ${testStatus.error}`) : ''}</p>

    <div class="grid gap-6 p-6 lg:grid-cols-2">
      <section>
        <h2 class={HEADER_CELL}>Sample of {review.sample.length} of {review.recipientCount} recipients</h2>
        <ul class="mt-2 flex flex-col gap-1 text-sm">
          {#each review.sample as recipient (recipient.memberId)}
            <li>{recipient.personName} &lt;{recipient.email}&gt;</li>
          {:else}
            <li class="text-muted">No recipients resolved for this segment.</li>
          {/each}
        </ul>
      </section>

      <section>
        <h2 class={HEADER_CELL}>Rendered email</h2>
        <p class="mt-2 text-sm font-medium">{preview.subject}</p>
        <div class="prose mt-2 max-w-none rounded-box border border-[var(--cairn-card-border)] p-4 text-sm">
          {@html preview.html}
        </div>
      </section>
    </div>

    <p
      class="text-sm font-medium text-error {sendError ? 'border-b border-[var(--cairn-card-border)] px-6 py-3' : ''}"
      role="alert"
    >{sendError ?? ''}</p>

    <div class="flex flex-wrap justify-between gap-2 border-t border-[var(--cairn-card-border)] p-6">
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (step = 'compose')}>Back</button>
      <div class="flex flex-wrap gap-2">
        <form method="post" action="?/test" use:enhance={onSettle()}>
          <CsrfField />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="body" value={body} />
          <button type="submit" class="btn btn-sm">Send test to me</button>
        </form>
        <button type="button" class="btn btn-primary btn-sm" onclick={() => sendDialog?.showModal()}>
          Send to {recipientCountLabel}
        </button>
      </div>
    </div>
  </OfficeList>

  <dialog bind:this={sendDialog} class="modal">
    <div class="modal-box">
      <h2 class="text-lg font-bold">Send to {recipientCountLabel}?</h2>
      <p class="py-2 text-sm text-muted">{review.segmentLabel}. This cannot be undone.</p>
      <form method="post" action="?/send" use:enhance={onSendSubmit()}>
        <CsrfField />
        <input type="hidden" name="segmentKey" value={review.segmentKey} />
        <input type="hidden" name="subject" value={subject} />
        <input type="hidden" name="body" value={body} />
        <input type="hidden" name="confirm" value="on" />
        <div class="modal-action">
          <!-- svelte-ignore a11y_autofocus -->
          <button type="button" class="btn" autofocus onclick={() => sendDialog?.close()}>Cancel</button>
          <button type="submit" class="btn btn-primary">
            Send to {recipientCountLabel}
          </button>
        </div>
      </form>
    </div>
  </dialog>
{/if}
