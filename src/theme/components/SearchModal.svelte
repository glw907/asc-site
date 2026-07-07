<!-- @component
Site-owned Pagefind search: a trigger button plus a DaisyUI `<dialog>` modal, styled on the same
club-grounds token layer as the rest of the chrome (no Pagefind default CSS ships). `npm run
build:search` (`vite build && npx pagefind --site .svelte-kit/cloudflare`) crawls the prerendered
(site) pages after a normal build and writes the index and the runtime module to `/pagefind/`
inside that same output directory, so it deploys alongside the rest of the static assets with no
extra wiring (the deploy workflow already runs this step). This component never imports that
module at build time (it does not exist until `build:search` has run); it is fetched at runtime,
lazily, on first open, with `@vite-ignore` telling Vite not to try to resolve it ahead of time. A
plain `npm run dev` or `npm run build` (without the search step) has no `/pagefind/pagefind.js` to
fetch, so the modal reports that plainly instead of throwing.

Opens from the header's search button, or Cmd/Ctrl+K from anywhere on the page. The result excerpt
comes from Pagefind's own generated HTML (a `<mark>` around the matched terms, built from the
indexed page content at crawl time, not from live user input), so rendering it with `{@html}` here
carries no injection risk beyond what the crawled pages themselves already render. Ported from
ecxc.ski's own SearchModal, the family's standing Pagefind pattern.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { siteConfig } from '$theme/cairn.config';

  /** The single result shape this component reads from Pagefind's `data()` promise. */
  interface PagefindResult {
    url: string;
    excerpt: string;
    meta: { title?: string };
  }

  /** The subset of Pagefind's runtime module this component calls. */
  interface PagefindModule {
    init: () => Promise<void>;
    search: (query: string) => Promise<{ results: { data: () => Promise<PagefindResult> }[] }>;
  }

  let dialogEl = $state<HTMLDialogElement>();
  let query = $state('');
  let results = $state<PagefindResult[]>([]);
  let searched = $state(false);
  let loadError = $state('');
  let pagefind: PagefindModule | null = null;
  let debounceHandle: ReturnType<typeof setTimeout> | undefined;

  /**
   * Loads the runtime module on first use only, caching the result for the rest of the session. A
   * missing module (no `build:search` run yet) is the expected dev-environment case, not a bug, so
   * it resolves to a friendly message rather than an unhandled rejection.
   */
  async function ensurePagefind(): Promise<PagefindModule | null> {
    if (pagefind) return pagefind;
    try {
      // A runtime-only path (a build:search artifact, never a module Vite or TypeScript can resolve
      // ahead of time): the path sits in a variable, not a string literal in the import() call, so
      // TypeScript treats the result as Promise<any> instead of trying to resolve a module
      // declaration for it. @vite-ignore tells Vite the same thing at the bundler level.
      const pagefindPath = '/pagefind/pagefind.js';
      const mod = (await import(/* @vite-ignore */ pagefindPath)) as PagefindModule;
      await mod.init();
      pagefind = mod;
      return pagefind;
    } catch {
      loadError = 'Search is not built into this preview yet. Run `npm run build:search`.';
      return null;
    }
  }

  async function runSearch(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      results = [];
      searched = false;
      return;
    }
    const mod = await ensurePagefind();
    if (!mod) return;
    const { results: hits } = await mod.search(trimmed);
    results = await Promise.all(hits.slice(0, 8).map((hit) => hit.data()));
    searched = true;
  }

  function onInput() {
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => runSearch(query), 150);
  }

  function open() {
    if (dialogEl?.open) return; // showModal throws on an already-open dialog
    loadError = '';
    dialogEl?.showModal();
    void ensurePagefind();
  }

  function onClose() {
    query = '';
    results = [];
    searched = false;
  }

  onMount(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        open();
      }
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  });
</script>

<button
  type="button"
  onclick={open}
  aria-label="Search"
  class="search-trigger inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-field text-muted hover:text-base-content"
>
  <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
</button>

<dialog bind:this={dialogEl} class="modal" aria-label="Search" onclose={onClose}>
  <div class="modal-box max-w-lg self-start p-0 sm:mt-[12vh]">
    <div class="flex items-center gap-2 border-b border-card-border px-m">
      <svg class="h-4 w-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        bind:value={query}
        oninput={onInput}
        type="text"
        aria-label="Search {siteConfig.siteName}"
        placeholder="Search {siteConfig.siteName}…"
        class="w-full bg-transparent py-3.5 text-sm outline-hidden placeholder:text-muted"
      />
    </div>

    {#if loadError}
      <p class="px-m py-6 text-center text-sm text-muted">{loadError}</p>
    {:else if results.length}
      <ul class="max-h-[60vh] overflow-y-auto p-2">
        {#each results as result (result.url)}
          <li>
            <a
              href={result.url}
              onclick={() => dialogEl?.close()}
              class="search-result-link block rounded-field px-m py-s no-underline"
            >
              <p class="font-display font-semibold text-base-content">{result.meta.title ?? result.url}</p>
              <p class="text-step--1 text-muted">{@html result.excerpt}</p>
            </a>
          </li>
        {/each}
      </ul>
    {:else if searched}
      <p class="px-m py-6 text-center text-sm text-muted">No matches for "{query}".</p>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop"><button tabindex="-1" aria-label="Close">close</button></form>
</dialog>

<style>
  .search-trigger {
    transition: color 0.15s ease;
  }
  .search-trigger:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .search-result-link {
    transition: background-color 0.15s ease;
  }
  .search-result-link:hover {
    background-color: var(--color-base-200);
  }

  @media (prefers-reduced-motion: reduce) {
    .search-trigger {
      transition: none;
    }
  }
</style>
