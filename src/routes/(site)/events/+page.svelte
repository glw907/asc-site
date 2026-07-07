<!-- @component
Task 4's /events page: the "events" content entry's own editorial intro (ordinary cairn markdown,
rendered through the same plumbing (site)/[...path] uses), followed by the full club calendar
read live from the ops stack's D1 (src/theme/season-data.ts), grouped and categorized with the
same C7-gold taxonomy the home page's Season section uses (SeasonList.svelte, shared by both). -->
<script lang="ts">
  import type { PageData } from './$types';
  import { CairnHead } from '@glw907/cairn-cms/delivery/head';
  import { siteConfig } from '$theme/cairn.config';
  import SeasonList from '$theme/components/SeasonList.svelte';

  let { data }: { data: PageData } = $props();
</script>

<CairnHead seo={data.seo} titleTemplate={(title) => `${title} — ${siteConfig.siteName}`} />

<article class="prose">
  <h1>{data.entry.title}</h1>
  {@html data.html}
</article>

<section class="events-season">
  <h2 class="m-0 font-display text-step-2 font-semibold text-base-content">The full calendar</h2>
  <SeasonList months={data.season} />
</section>

<style>
  .events-season {
    margin-top: var(--spacing-l);
  }
  .events-season h2 {
    margin-bottom: var(--spacing-xs);
  }
</style>
