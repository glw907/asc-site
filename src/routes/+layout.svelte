<script lang="ts">
  import { afterNavigate, onNavigate } from '$app/navigation';
  import { cairn } from '$theme/cairn.config';

  let { children } = $props();

  // Mount content islands (the contact and donate forms, completion-pass manifest item 2) after
  // every navigation. The runtime is imported dynamically and only when the site registers at
  // least one island, so a page with none never ships the island client code.
  afterNavigate(async () => {
    const islands = cairn.rendering.islands;
    if (!islands || Object.keys(islands).length === 0) return;
    const { hydrateIslands } = await import('@glw907/cairn-cms/islands');
    hydrateIslands(islands);
  });

  // Page-to-page cross-fade (the owner-round-2 fix, 2026-07-07), the standard SvelteKit
  // View Transitions pattern: `onNavigate` wraps the DOM swap in `document.startViewTransition`,
  // which snapshots the old and new page and cross-fades between them instead of the usual
  // hard cut. Two independent guards keep it a feel change, never a show: `startViewTransition`
  // itself is feature-detected (a browser without it just falls through to a normal navigation,
  // returning nothing here), and `prefers-reduced-motion` is checked directly rather than left to
  // the CSS override alone, so a reduced-motion visitor never enters a transition in the first
  // place. `site.css`'s own `::view-transition-*` rules set the actual duration (~180ms) and
  // restate the reduced-motion guard as a CSS-level backstop, since `::view-transition-*` are
  // pseudo-elements on the document's own snapshot tree, not on any real element a Svelte
  // component's scoped `<style>` could reach.
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

{@render children()}
