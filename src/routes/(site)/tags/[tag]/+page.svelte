<!-- @component One Browse-by-Topic destination (see /posts's own header comment): every post
     carrying this vocabulary tag, newest first, in the same plain-list style as the /posts
     archive rather than a new visual idiom for one filtered view of the same content. -->
<script lang="ts">
  import type { PageData } from './$types';
  import { CairnHead } from '@glw907/cairn-cms/delivery/head';
  import { siteConfig } from '$theme/cairn.config';

  let { data }: { data: PageData } = $props();

  const dateFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  function formatDate(iso: string): string {
    return dateFmt.format(new Date(iso));
  }
</script>

<CairnHead seo={data.seo} titleTemplate={(title) => `${title} — ${siteConfig.siteName}`} />

<p class="m-0"><a href="/posts/" class="font-semibold text-primary">&larr; All news</a></p>
<h1 class="mt-2xs mb-0 font-display text-step-5 font-semibold leading-tight tracking-tight text-base-content">
  {data.topic.label}
</h1>
<!-- The index's own stat-line vocabulary: a post-count line under the h1, in the same
     eyebrow-weight styling as /posts's stats bar counts. -->
<p class="mt-2xs text-step--1 text-muted">{data.posts.length} {data.posts.length === 1 ? 'post' : 'posts'}</p>

{#if data.posts.length > 0}
  <ul class="mt-m flex flex-col gap-xs">
    {#each data.posts as post (post.id)}
      <li class="flex flex-col gap-3xs sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-xs">
        <a href={post.permalink} class="font-semibold text-primary">{post.title}</a>
        {#if post.date}<time datetime={post.date} class="text-step--1 text-muted">{formatDate(post.date)}</time>{/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="mt-m text-muted">No posts yet.</p>
{/if}
