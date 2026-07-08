<!-- @component
The home page's notification pennant (round-3 design review, 2026-07-07), replacing the gray
admonition box (fill, border, bold title prefix) Geoff's live review flagged. Unboxed: a hoisted
pennant leads one plain sentence on the page's own white ground, the timely fact bold, then the
standard arrow link. The leading mark is a small inline SVG (a thin navy mast plus a Star-gold
triangular burgee), `aria-hidden` since the sentence beside it already carries the full meaning.
`parseBoldSegments` (`$theme/active-notification`) is the one narrow, safe `**bold**` convention
the plain-text `body` field supports; every segment still renders through Svelte's own escaped
text interpolation, never `{@html}`. -->
<script lang="ts">
  import { parseBoldSegments, type ActiveNotification } from '$theme/active-notification';

  let { notification }: { notification: ActiveNotification } = $props();
  const segments = $derived(parseBoldSegments(notification.body));
</script>

<div class="notification-strip flex max-w-[54ch] items-baseline gap-xs">
  <svg class="notification-pennant" viewBox="0 0 24 24" aria-hidden="true">
    <line x1="5" y1="2" x2="5" y2="22" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" />
    <polygon points="5,3 18,7.5 5,12" fill="var(--color-secondary)" />
  </svg>
  <p class="notification-text m-0 text-step-0 text-base-content">
    {#each segments as segment, i (i)}{#if segment.bold}<strong>{segment.text}</strong>{:else}{segment.text}{/if}{/each}
    <a href="/join/" class="arrow-link font-semibold text-primary underline underline-offset-[3px]">Join now &rarr;</a>
  </p>
</div>

<style>
  /* ~1.1em (the size the redesign calls for): fixed-shrink so a long body never squeezes the
     mark, aligned to the text's own baseline via the wrapper's `items-baseline` so the mast's
     foot sits on the sentence's baseline rather than floating above it. */
  .notification-pennant {
    width: 1.1em;
    height: 1.1em;
    flex-shrink: 0;
    transform: translateY(0.15em);
  }
</style>
