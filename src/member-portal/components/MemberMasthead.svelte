<!-- @component
The member portal landing's own page signature (the portal redesign design doc's own "the member
masthead," docs/design-benchmark/portal-mock-d/portal-directions.html lines 1034-1043): the
full-bleed sage band carrying the eyebrow, the "Welcome back" greeting, the standing sentence, the
season chip, and (only in the renewal-window state) the page's one fireweed action. Portal-scoped
and licensed one-time by the design doc ("not sitewide vocabulary"), so its own furniture (eyebrow,
chip) is reproduced here rather than reached for from a shared registry.

The band's full-bleed background relies entirely on its caller: `site.css`'s
`.site-main:has(> .portal-shell)` rule cancels `.site-main`'s own max-width/margin/padding for the
whole signed-in landing, so this component's own `<section>` background can span the true viewport
width. Only `.member-masthead-inner` reads at the site's own container measure (mock D's own
`.mockA-band-inner`, ported verbatim), matching every other band's inner-content convention.

`compact` renders the mobile composition's own masthead (T3, mock D's `.mockD-mobile-masthead`
lines 651-668 of portal-directions.html): no eyebrow, a smaller greeting face, and tight padding in
place of the full-bleed band's generous vertical rhythm -- greeting, standing sentence, chip, and
the renewal CTA (when present) are otherwise identical to the desktop band. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    firstName,
    standingSentence,
    seasonLabel,
    cta,
    compact = false,
    anchor = true,
  }: {
    firstName: string;
    standingSentence: string;
    seasonLabel: string;
    /** The renewal-window state's own "Renew for {season}" form, rendered only in that one state
     *  (the design doc's "the only fireweed on the page, ever"); omitted entirely otherwise. */
    cta?: Snippet;
    /** The mobile composition's own compact rendering (T3); `false` renders the desktop band. */
    compact?: boolean;
    /** Carries `id="renew"` (see below). T3 mounts both the desktop and mobile masthead at once
     *  (CSS toggles which one is visible per viewport, never a JS media-query branch), so exactly
     *  one instance may claim the id -- a second `id="renew"` in the DOM is invalid HTML regardless
     *  of which instance is hidden. Defaults `true`; the mobile instance passes `false`. */
    anchor?: boolean;
  } = $props();
</script>

<!-- `id="renew"` (only when `anchor`): the target of `/my-account#renew`, the fragment the
     renewal-reminder job's own plan named as already "in members' inboxes" (T2c verification,
     docs/plans/2026-07-16-portal-redesign.md). Checked against the actual producers
     (`src/jobs/renewal-reminders.ts`, whose `renewal_reminder` template body links
     `{{portal_url}}` with no fragment at all, migration 0015_job_runner/forward.sql) -- no live
     sender emits the fragment today, so this id is a no-regression guarantee for a link that MIGHT
     exist (an admin-edited template, a future touch), not a fix for one that does. Kept regardless:
     this section is the page's own first element, so `#renew` always lands here, and the
     renewal-window state's own CTA link (see `cta` below) is what a member reads next either way. -->
<section class="member-masthead" class:member-masthead-compact={compact} id={anchor ? 'renew' : undefined}>
  <div class="member-masthead-inner">
    {#if !compact}
      <p class="member-masthead-eyebrow">Member Home</p>
    {/if}
    <h1 class="member-masthead-greeting">Welcome back, {firstName}.</h1>
    <p class="member-masthead-standing">{standingSentence}</p>
    <span class="member-masthead-chip">{seasonLabel}</span>
    {#if cta}
      <div class="member-masthead-cta">{@render cta()}</div>
    {/if}
  </div>
</section>

<style>
  /* Ported from mock D's own `.mockA-band` (portal-directions.html L389-392): the lightest sage
     tint, generous vertical padding, no horizontal padding of its own (the inner content carries
     that, so the band's colored ground still bleeds to the true viewport edge). No narrow-width
     collapse of its own: the caller (`+page.svelte`, T3's own breakpoint comment) never renders
     the non-`compact` instance below 1024px, so a second collapse point here would be dead code --
     `compact` below is the properly composed narrow-width answer.

     `--color-base-200`, NOT the mock's own `--color-sage`, and the difference is only visible in
     dark mode. The two tokens carry the identical light value (oklch(96.7% 0.006 137.8)), so this
     band renders pixel-identically to the mock in light mode; but `--color-sage` is a FIXED brand
     token with no `[data-theme]` override, while `--color-base-200` is the theme-aware band tint
     the rest of the site already bands with (the home page's own sections: `bg-base-200`). Ported
     verbatim, the fixed token left a glaring light slab across a dark page, between a dark header
     and a dark body. The mock was authored light-only, so porting its values faithfully carried a
     light-only assumption onto a theme-aware site; this is the same class of defect as the
     `--color-harbor-ink` body-ink gap the review gate caught, one layer up in the ground rather
     than the ink. The masthead is the only place in the site that reached for `--color-sage`. */
  .member-masthead {
    background: var(--color-base-200);
    padding: var(--spacing-2xl) var(--spacing-l);
  }

  /* The mobile composition's own compact band (T3, mock D's `.mockD-mobile-masthead` lines
     651-668): tight padding in place of the full-bleed band's generous rhythm, no eyebrow (the
     eyebrow's own job -- naming the page -- is redundant once the greeting is the first thing on
     screen), and the greeting drops one display step so it never wraps past two words at 320px. */
  .member-masthead-compact {
    padding: var(--spacing-m);
  }
  .member-masthead-compact .member-masthead-greeting {
    font-size: var(--text-step-3);
  }

  /* `--container-measure-wide`, not the wider 1280px the working area below reads at (mock D's own
     asymmetry, ported deliberately: the masthead reuses mock A's plain band-inner measure, while
     the working area gets Geoff's own wider desktop-width steer, see +page.svelte's own comment). */
  .member-masthead-inner {
    max-width: var(--container-measure-wide);
    margin: 0 auto;
  }

  /* Eyebrow register, reproduced from asc-components.css's `.asc-related-eyebrow` recipe (that
     class is `.prose`-scoped, unreachable from this bespoke, non-prose band). */
  .member-masthead-eyebrow {
    margin: 0 0 var(--spacing-2xs);
    font-size: var(--text-step--2);
    font-weight: 600;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }

  /* `--color-base-content`, not the mock's fixed `--color-harbor-ink`: it must track the band
     above it. Harbor ink was defensible only while the band was pinned light (a fixed ink on a
     fixed ground); now that the band darkens with the theme, a fixed dark ink on it would be the
     same near-invisible text the review gate found elsewhere in this pass. The two tokens agree
     in light mode, so the mock's rendering is unchanged. */
  .member-masthead-greeting {
    margin: 0 0 var(--spacing-2xs);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--text-step-5);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-tight);
    color: var(--color-base-content);
  }

  .member-masthead-standing {
    margin: 0 0 var(--spacing-s);
    font-size: var(--text-step-1);
    color: var(--color-muted);
  }

  /* Reproduced from asc-components.css's `.asc-availability-chip` recipe: deliberately uncolored
     (no semantic-palette token), an outline chip in muted ink. */
  .member-masthead-chip {
    display: inline-block;
    flex-shrink: 0;
    padding: 0.1rem 0.5rem;
    border: 1px solid color-mix(in oklab, var(--color-muted) 35%, transparent);
    border-radius: var(--radius-selector);
    background: transparent;
    color: var(--color-muted);
    font-size: var(--text-step--2);
    font-weight: 600;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .member-masthead-cta {
    margin-top: var(--spacing-m);
  }
</style>
