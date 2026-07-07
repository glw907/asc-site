<script lang="ts">
  import { afterNavigate } from '$app/navigation';
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
</script>

{@render children()}
