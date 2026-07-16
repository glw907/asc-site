<!-- @component The public news archive, grouped by year (see +page.server.ts's header comment for
     why this page exists). Plain content, not part of the north star's own design contract; it
     reads the same prose tokens as an article body without wrapping in `.prose`, since it is a
     list of links, not running text. -->
<script lang="ts">
  import type { PageData } from './$types';
  import { CairnHead } from '@glw907/cairn-cms/delivery/head';
  import { siteConfig } from '$theme/cairn.config';
  import { ICON_PATHS } from '$theme/markdown/icons';

  let { data }: { data: PageData } = $props();

  const dateFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', timeZone: 'UTC' });

  function formatDate(iso: string): string {
    return dateFmt.format(new Date(iso));
  }

  // A glyph per vocabulary topic, for the Browse-by-Topic grid. `compass` is the fallback for a
  // future vocabulary value this map has not caught up with yet, so a new tag never renders blank.
  const TOPIC_ICONS: Record<string, string> = {
    news: 'newspaper',
    racing: 'sailboat',
    results: 'trophy',
    education: 'graduation-cap',
    club: 'users-three',
  };

  function topicIcon(value: string): string {
    return ICON_PATHS[TOPIC_ICONS[value] ?? 'compass'];
  }
</script>

<CairnHead seo={data.seo} titleTemplate={(title) => `${title} — ${siteConfig.siteName}`} />

<h1 class="m-0 font-display text-step-5 font-semibold leading-tight tracking-tight text-base-content">News</h1>

<!-- The stats bar (completion-pass manifest item 7): three at-a-glance counts, matching the live
     archive's own wayfinding header but reading from this build's real data, never a hardcoded
     number. -->
<!-- Basic-polish batch 2b (2026-07-16): flex-wrap alone let a narrow viewport strand the last
     stat alone on its own row. flex-col below `sm:` composes all three into one stacked block
     instead, then reverts to the original wrapped row once there's room. -->
<div class="news-stats mt-s flex flex-col gap-2xs border-b border-card-border pb-m sm:flex-row sm:flex-wrap sm:gap-l">
  <div class="news-stat flex items-center gap-2xs">
    <svg class="h-5 w-5 text-muted" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"
      ><path d={ICON_PATHS.newspaper} /></svg
    >
    <span class="font-display text-step-1 font-semibold text-base-content">{data.stats.postCount}</span>
    <span class="text-step--1 text-muted">posts</span>
  </div>
  <div class="news-stat flex items-center gap-2xs">
    <svg class="h-5 w-5 text-muted" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"
      ><path d={ICON_PATHS['grid-nine']} /></svg
    >
    <span class="font-display text-step-1 font-semibold text-base-content">{data.stats.topicCount}</span>
    <span class="text-step--1 text-muted">topics</span>
  </div>
  {#if data.stats.yearRange}
    <div class="news-stat flex items-center gap-2xs">
      <svg class="h-5 w-5 text-muted" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"
        ><path d={ICON_PATHS['calendar-dots']} /></svg
      >
      <span class="font-display text-step-1 font-semibold text-base-content">{data.stats.yearRange}</span>
    </div>
  {/if}
</div>

<!-- Browse by Topic (completion-pass manifest item 7): the site's own curated vocabulary, not a
     literal port of the live site's now-superseded eight-tag set (see the content-migration
     finding: three of the old Hugo tags collapsed into "club" during the migration, a deliberate
     editorial call, not an oversight this pass should quietly widen). -->
<section class="mt-m">
  <h2 class="m-0 border-b border-card-border pb-2xs font-display text-step-2 font-semibold text-base-content">
    Browse by Topic
  </h2>
  <ul class="topic-grid mt-s grid grid-cols-2 gap-s">
    {#each data.browseTopics as topic (topic.value)}
      <li>
        <a
          href={`/tags/${topic.value}/`}
          class="topic-entry flex items-center gap-xs rounded-box border border-card-border bg-base-100 px-m py-s transition-colors hover:border-primary"
        >
          <svg class="h-6 w-6 shrink-0 text-primary" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"
            ><path d={topicIcon(topic.value)} /></svg
          >
          <span class="flex flex-col">
            <span class="font-display font-semibold text-base-content">{topic.label}</span>
            <span class="text-step--1 text-muted">{topic.count} {topic.count === 1 ? 'post' : 'posts'}</span>
          </span>
        </a>
      </li>
    {/each}
  </ul>
</section>

{#each data.years as [year, entries] (year)}
  <section class="mt-xl">
    <h2 class="m-0 border-b border-card-border pb-2xs font-display text-step-2 font-semibold text-base-content">
      {year}
    </h2>
    <ul class="mt-s flex flex-col gap-xs">
      {#each entries as post (post.id)}
        <li class="flex flex-col gap-3xs sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-xs">
          <a href={post.permalink} class="font-semibold text-primary">{post.title}</a>
          {#if post.date}<time datetime={post.date} class="text-step--1 text-muted">{formatDate(post.date)}</time>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/each}
