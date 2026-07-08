<!--
@component
The Announce form: pick which channels a published post's own summary reaches. "Summary" is the
one field both channels share -- pre-populated, editable text, never a placeholder
(`data.post.summary`, `deriveAnnouncementSummary`'s own priority: an explicit author `description`
frontmatter verbatim, else a sentence-aware trim of the whole flattened body); the value shown IS
what sends unless the author edits it. Each channel then renders that same summary in its own
shape, never the identical text in two boxes (Geoff's own correction, 2026-07-08): "Subject" is
email-only (defaults to the post's title), and the Discord preview shows the summary truncated to
a tight embed description. Two small, independently readable preview panes prove that split
rather than asserting it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import { FieldLabel, TextField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL, formatClubTimestamp } from '$admin-club/lib/ui';
  import { buildAnnouncementEmailContent } from '$admin-club/lib/announcements';
  import { renderTemplatePreviewHtml } from '$admin-club/lib/club-email';
  import { buildStoryNotice, truncateForEmbed } from '$admin-club/lib/discord';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // A one-time seed from the load's own current post, not a live mirror (the `untrack` idiom
  // `classes/[id]/+page.svelte` and `email/[id]/+page.svelte` both already establish): a
  // post-submit re-render must not clobber whatever the editor just typed. Re-derived fresh on
  // every visit to this route (a new post id re-runs this seed, see the `{#key}` below), never
  // carried over from a prior post.
  let subject = $state(untrack(() => data.post?.title ?? ''));
  let message = $state(untrack(() => data.post?.summary ?? ''));
  let emailAll = $state(true);
  let notifyDiscordOn = $state(false);
  let discordChannel = $state(untrack(() => data.defaultChannel));

  const emailPreview = $derived(
    data.post ? renderTemplatePreviewHtml(buildAnnouncementEmailContent({ subject, message, url: data.post.url }).body) : '',
  );
  const discordPreview = $derived(
    data.post ? buildStoryNotice({ channel: discordChannel, title: data.post.title, message, url: data.post.url }) : null,
  );
</script>

<a href="/admin/club/announce" class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary">
  <span aria-hidden="true">&larr;</span> Back to Announce
</a>

{#if !data.post}
  <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-6 py-10 text-center shadow-[var(--cairn-shadow)]">
    <p class="text-sm text-muted">{data.error ?? 'No such published post.'}</p>
  </div>
{:else}
  <!-- Keyed on the post's own id, the same reasoning `classes/[id]/+page.svelte`'s own comment
       documents: without it, navigating between two posts on this same dynamic route reuses the
       component instance and the seeded `$state` above never re-runs. -->
  {#key data.post.id}
    <OfficeList eyebrow="Club" title={data.post.title} subtitle="Announce this post by email and/or Discord.">
      {#if form?.error}
        <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-error" role="alert">
          {form.error}
        </p>
      {/if}
      {#if form && 'ok' in form && form.ok}
        <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-success" role="status">
          Sent: {form.emailCount} member email{form.emailCount === 1 ? '' : 's'}{form.discordChannel ? `, Discord #${form.discordChannel}` : ''}.
        </p>
      {/if}
      {#if data.previous}
        <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-warning" role="status">
          Already announced {formatClubTimestamp(data.previous.createdAt)}
          ({data.previous.emailCount > 0 ? `email to ${data.previous.emailCount}` : 'no email'}{data.previous.discordChannel
            ? `, #${data.previous.discordChannel}`
            : ''}). Sending again notifies members and/or Discord a second time.
        </p>
      {/if}

      <form method="post" action="?/send">
        <div class="grid gap-6 p-6 lg:grid-cols-2">
          <section class="flex flex-col gap-4">
            <TextField label="Subject (email only)" name="subject" bind:value={subject} />
            <FieldLabel label="Summary">
              <textarea class="textarea textarea-sm w-full" name="message" rows="6" bind:value={message}></textarea>
            </FieldLabel>
            <p class="text-xs text-muted">
              Shared by both channels: the email body leads with this, and Discord shows a short version of it.
            </p>

            <fieldset class="flex flex-col gap-3 border-t border-[var(--cairn-card-border)] pt-4">
              <legend class={HEADER_CELL}>Where to send</legend>
              <label class="flex items-center gap-1.5 text-sm">
                <input type="checkbox" class="checkbox checkbox-sm" name="emailAll" bind:checked={emailAll} />
                Email all current members
              </label>
              <label class="flex items-center gap-1.5 text-sm">
                <input type="checkbox" class="checkbox checkbox-sm" name="notifyDiscord" bind:checked={notifyDiscordOn} />
                Notify Discord
              </label>
              <FieldLabel label="Discord channel">
                <select class="select select-sm" name="discordChannel" bind:value={discordChannel} disabled={!notifyDiscordOn}>
                  {#each data.channelOptions as option (option.value)}
                    <option value={option.value} disabled={!option.configured}>
                      {option.label}{option.configured ? '' : ' (not configured)'}
                    </option>
                  {/each}
                </select>
              </FieldLabel>
            </fieldset>
          </section>

          <section class="flex flex-col gap-6">
            <div>
              <h2 class={HEADER_CELL}>Email preview</h2>
              <p class="mt-2 text-sm font-medium">{subject}</p>
              <div class="prose mt-2 max-w-none rounded-box border border-[var(--cairn-card-border)] p-4 text-sm">
                {@html emailPreview}
              </div>
            </div>
            <div>
              <h2 class={HEADER_CELL}>Discord preview</h2>
              {#if discordPreview}
                <div class="mt-2 rounded-box border-l-4 border-primary bg-base-200/60 p-4 text-sm">
                  <a class="font-semibold text-primary hover:underline" href={discordPreview.url} target="_blank" rel="noreferrer">
                    {discordPreview.title}
                  </a>
                  <p class="mt-1 whitespace-pre-line text-sm">{discordPreview.description}</p>
                  {#if message.trim().length > 0 && truncateForEmbed(message) !== message.trim()}
                    <p class="mt-2 text-xs text-muted">Truncated for Discord's embed limit.</p>
                  {/if}
                </div>
              {/if}
            </div>
          </section>
        </div>

        <div class="flex justify-end gap-2 border-t border-[var(--cairn-card-border)] p-6">
          <CsrfField />
          <button type="submit" class="btn btn-primary btn-sm">Send</button>
        </div>
      </form>
    </OfficeList>
  {/key}
{/if}
