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
  // hard cut. Three independent guards keep it a feel change, never a show: `startViewTransition`
  // itself is feature-detected (a browser without it just falls through to a normal navigation,
  // returning nothing here), `prefers-reduced-motion` is checked directly rather than left to
  // the CSS override alone, so a reduced-motion visitor never enters a transition in the first
  // place, and a same-route navigation (an admin screen's own `goto('?...')` for an in-place
  // filter/search update, never a real page-to-page move) is skipped entirely -- the Members pass
  // coherence round's own finding: the view-transition snapshot layers are full-viewport overlays
  // outside any DOM ancestor's own overflow/border-radius clipping, so a shrinking list (e.g. a
  // search narrowing 89 rows down to 2) painted its own stale, taller snapshot's ghost rows below
  // the now-shorter card's closed bottom border for the transition's own duration. `site.css`'s
  // own `::view-transition-*` rules set the actual duration (~180ms) and restate the
  // reduced-motion guard as a CSS-level backstop, since `::view-transition-*` are pseudo-elements
  // on the document's own snapshot tree, not on any real element a Svelte component's scoped
  // `<style>` could reach.
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (navigation.from?.route.id && navigation.from.route.id === navigation.to?.route.id) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

{@render children()}
