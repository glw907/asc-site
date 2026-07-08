<!--
@component
The Announce screen's list: recently published posts, newest first, each row linking to its own
announce form (`[id]`). The "Announced" column reads `announcements` (migrations/asc-club/0017)
through the load's own `latestAnnouncementByPost` reduction, so a post that has never been
announced shows a plain dash rather than an empty cell that could read as a loading state.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { HEADER_CELL, formatCivilDate, formatClubTimestamp } from '$admin-club/lib/ui';
  import { ANNOUNCE_CHANNEL_LABEL } from '$admin-club/lib/discord';

  let { data }: { data: PageData } = $props();

  const subtitle = $derived(
    data.error ? data.error : `The ${data.posts.length} most recently published posts, newest first.`,
  );

  function announcedLabel(row: PageData['posts'][number]): string {
    if (!row.announced) return '';
    const when = formatClubTimestamp(row.announced.createdAt);
    const parts: string[] = [];
    if (row.announced.emailCount > 0) parts.push(`email to ${row.announced.emailCount}`);
    if (row.announced.discordChannel) parts.push(`#${ANNOUNCE_CHANNEL_LABEL[row.announced.discordChannel] ?? row.announced.discordChannel}`);
    return parts.length > 0 ? `Announced ${when} (${parts.join(', ')})` : `Announced ${when}`;
  }
</script>

<span class="sr-only" role="status">{data.posts.length} posts</span>

<OfficeList eyebrow="Club" title="Announce" {subtitle}>
  <table class="table">
    <caption class="sr-only">Recently published posts, newest first</caption>
    <thead>
      <tr>
        <th class="{HEADER_CELL} w-28">Date</th>
        <th class={HEADER_CELL}>Title</th>
        <th class={HEADER_CELL}>Announced</th>
      </tr>
    </thead>
    <tbody>
      {#each data.posts as row (row.id)}
        <tr class="transition-colors hover:bg-base-200/60">
          <td class="whitespace-nowrap text-sm tabular-nums text-muted">{formatCivilDate(row.date ?? null, 'Undated')}</td>
          <td>
            <a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/announce/${row.id}`}>
              {row.title}
            </a>
          </td>
          <td class="text-sm text-muted">
            {#if row.announced}
              {announcedLabel(row)}
            {:else}
              <span aria-hidden="true">&mdash;</span>
              <span class="sr-only">Not yet announced</span>
            {/if}
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan="3" class="px-6 py-10 text-center text-sm text-muted">
            {data.error ? 'The announcements table could not be read.' : 'No published posts yet.'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</OfficeList>
