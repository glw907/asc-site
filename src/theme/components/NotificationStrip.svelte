<!-- @component
The home page's notification card: the north star's own bounded block (round-5 rebuild,
2026-07-07), replacing the round-3 unboxed pennant strip Geoff's live review twice found too
quiet ("needs to be a little more present") and too hero-attached. The reference
(docs/2026-07-06-asc-home-northstar.html in this repo) is a light-fill, rounded, left-accented
card sitting directly under the hero's CTA; this rebuilds that form with the club's own pennant
glyph standing in for the reference's bare gold accent bar, the one gold element in the card
(the mast in navy, the burgee in the theme's own `--color-secondary` gold), set at the card's own
left edge so it reads as the accent a separate border-left bar would otherwise duplicate.

Dosage (Geoff's own calibration): the light fill and bounded edges alone do the "more present"
work. Type stays at plain body scale and ink (`text-step-0 text-base-content`, unchanged from the
round-3 strip); nothing here enlarges or strengthens beyond that. `parseBoldSegments`
(`$theme/active-notification`) is the one narrow, safe `**bold**` convention the plain-text `body`
field supports; every segment still renders through Svelte's own escaped text interpolation, never
`{@html}`. The action link now reads "Read more", not "Join now": a generic call to read the
notice itself, not an assumption about what action it drives (`+page.svelte`'s own wrapper places
this card at the hero's own left-column width). -->
<script lang="ts">
  import { parseBoldSegments, type ActiveNotification } from '$theme/active-notification';

  let { notification }: { notification: ActiveNotification } = $props();
  const segments = $derived(parseBoldSegments(notification.body));
</script>

<div class="notification-card">
  <svg class="notification-pennant" viewBox="0 0 24 24" aria-hidden="true">
    <line x1="5" y1="2" x2="5" y2="22" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" />
    <polygon points="5,3 18,7.5 5,12" fill="var(--color-secondary)" />
  </svg>
  <p class="notification-text m-0 text-step-0 text-base-content">
    {#each segments as segment, i (i)}{#if segment.bold}<strong>{segment.text}</strong>{:else}{segment.text}{/if}{/each}
    <a href="/join/" class="font-semibold text-primary underline underline-offset-[3px]">Read more &rarr;</a>
  </p>
</div>

<style>
  /* The bounded fill (Geoff's dosage note: this alone is the "more present" work, so nothing else
     here grows past it): the same light neutral `--color-base-200` fill News, Season, and
     Facilities already band with, so the card reads as a family member, not a novel treatment. */
  .notification-card {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-xs);
    background: var(--color-base-200);
    border-radius: var(--radius-box);
    padding: var(--spacing-xs) var(--spacing-s);
  }
  /* ~1.3em, a touch larger than the round-3 strip's inline 1.1em glyph, since it now carries the
     reference's whole gold-accent role alone rather than sitting beside a separate border-left
     bar (dropped: glyph plus bar read doubled on this card's own render). Top-nudged rather than
     baseline-aligned to the text, since the card's own message can wrap to more than one line. */
  .notification-pennant {
    width: 1.3em;
    height: 1.3em;
    flex-shrink: 0;
    margin-top: 0.2em;
  }
</style>
