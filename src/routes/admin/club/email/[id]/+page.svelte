<!--
@component
The Email template edit screen (pass 2.3): the subject/body form, a visible palette of the
variables this template supports, a sample-data preview rendered through `club-email.ts`'s own
send-time render (so what an admin previews here is never structurally different from a real
send), and a reset-to-default action. A plain textarea, not the cairn CodeMirror editor: this is
short admin markdown with a handful of `{{variable}}` placeholders, not authored content.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import { FieldLabel, TextField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL, formatClubTimestamp } from '$admin-club/lib/ui';
  import { renderTemplateWithVariables } from '$admin-club/lib/club-email';
  import { buildSampleVariables } from '$admin-club/lib/email-templates-store';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let resetDialog: HTMLDialogElement | undefined = $state();
  let bodyField: HTMLTextAreaElement | undefined = $state();

  // A one-time seed from the load's own current row, not a live mirror (the `untrack` idiom
  // `classes/[id]/+page.svelte` already established): a post-submit re-render must not clobber
  // whatever the admin just typed.
  let subject = $state(untrack(() => data.template?.subject ?? ''));
  let body = $state(untrack(() => data.template?.body ?? ''));

  const sampleVars = $derived(buildSampleVariables(data.template?.id ?? ''));
  const preview = $derived(renderTemplateWithVariables(subject, body, sampleVars));

  // A successful reset restores different values than the untracked seed above ever saw (that
  // seed only ever runs once per template id, deliberately, so an ordinary Save's re-render never
  // clobbers what the admin is typing); pull the reset action's own returned row in instead, the
  // one case where the form's own result SHOULD overwrite the local draft.
  $effect(() => {
    if (form && 'reset' in form && form.reset && form.template) {
      subject = form.template.subject;
      body = form.template.body;
    }
  });

  /** Insert `{{token}}` at the body textarea's own cursor, so the variable palette below doubles
   *  as a click-to-insert reference rather than a static list an admin retypes by hand. */
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
</script>

<a href="/admin/club/email" class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary">
  <span aria-hidden="true">&larr;</span> Back to Email
</a>

{#if !data.template}
  <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-6 py-10 text-center shadow-[var(--cairn-shadow)]">
    <p class="text-sm text-muted">{data.error ?? 'No such template.'}</p>
  </div>
{:else}
  <!-- Keyed on the template's own id, the same reasoning `classes/[id]/+page.svelte`'s own
       comment documents: without it, navigating between two templates on this same dynamic
       route reuses the component instance and the seeded `$state` above never re-runs. -->
  {#key data.template.id}
  <OfficeList
    eyebrow="Club"
    title={data.template.id}
    subtitle="Last updated {formatClubTimestamp(data.template.updatedAt)} by {data.template.updatedBy}."
  >
    {#snippet action()}
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => resetDialog?.showModal()}>
        Reset to default
      </button>
    {/snippet}

    {#if form?.error}
      <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-error" role="alert">
        {form.error}
      </p>
    {/if}
    {#if form && 'warning' in form && form.warning}
      <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-warning" role="alert">
        {form.warning}
      </p>
    {/if}
    {#if form && 'reset' in form && form.reset}
      <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-success" role="status">
        Restored to the shipped default.
      </p>
    {/if}

    <div class="border-b border-[var(--cairn-card-border)] p-6">
      <h2 class={HEADER_CELL}>Variables this template supports</h2>
      {#if data.knownVariables.length > 0}
        <p class="mt-1 text-xs text-muted">Click one to insert it into the body at your cursor.</p>
        <ul class="mt-2 flex list-none flex-wrap gap-2">
          {#each data.knownVariables as token (token)}
            <li>
              <button type="button" class="badge badge-outline font-mono" onclick={() => insertVariable(token)}>
                {`{{${token}}}`}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-1 text-xs text-muted">No known variable vocabulary is recorded for this template.</p>
      {/if}
    </div>

    <form method="post" action="?/save">
      <div class="grid gap-6 p-6 lg:grid-cols-2">
        <section class="flex flex-col gap-4">
          <TextField label="Subject" name="subject" bind:value={subject} />
          <FieldLabel label="Body (markdown)">
            <textarea
              bind:this={bodyField}
              class="textarea textarea-sm w-full font-mono"
              name="body"
              rows="16"
              bind:value={body}
            ></textarea>
          </FieldLabel>
        </section>

        <section>
          <h2 class={HEADER_CELL}>Sample-data preview</h2>
          <p class="mt-1 text-xs text-muted">
            Rendered with placeholder sample values, through the same render a real send uses.
          </p>
          <p class="mt-2 text-sm font-medium">{preview.subject}</p>
          <div class="prose mt-2 max-w-none rounded-box border border-[var(--cairn-card-border)] p-4 text-sm">
            {@html preview.html}
          </div>
        </section>
      </div>

      <div class="flex justify-end gap-2 border-t border-[var(--cairn-card-border)] p-6">
        <CsrfField />
        <button type="submit" class="btn btn-primary btn-sm">Save</button>
      </div>
    </form>
  </OfficeList>

  <dialog bind:this={resetDialog} class="modal" oncancel={(event) => event.preventDefault()}>
    <div class="modal-box">
      <h2 class="text-lg font-bold">Reset {data.template.id} to its shipped default?</h2>
      <p class="py-2 text-sm text-muted">
        This replaces the current subject and body. There is no undo beyond re-typing them.
      </p>
      <form method="dialog">
        <CsrfField />
        <div class="modal-action">
          <!-- svelte-ignore a11y_autofocus -->
          <button type="submit" class="btn" autofocus formnovalidate>Cancel</button>
          <button type="submit" class="btn btn-warning" formmethod="post" formaction="?/reset">Reset</button>
        </div>
      </form>
    </div>
  </dialog>
  {/key}
{/if}
