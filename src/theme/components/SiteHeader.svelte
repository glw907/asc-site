<!-- @component
ASC's public site header: the club-grounds chrome (Task 3), replacing Task 1's placeholder. A
sticky white band over a hairline border, the club's real logo (aksailingclub.org's own
/img/logo.png, restored from the north star's invented placeholder mark; see the completion
pass's manifest item 4) on the left, the primary nav (site.config.yaml's committed menu) on the
right. The current route's link
gets the story's gold active-nav mark (flag-navy text plus a star-gold underline, via
`box-shadow`, matching the north star's own `.nav a.active` rule) and `aria-current="page"`.
Seven nav items plus the theme toggle do not comfortably wrap at 320px, so a hamburger drawer
replaces the desktop row below 46rem/736px (a fine-grained width sweep's own honest floor; see the
breakpoint's own comment below for why it is not the family's usual 640px default), the same
structural device ecxc.ski and 907.life's own headers use. The nav row boxes to
`max-w-measure-wide`, the same width the home page's own full-bleed bands use (Task 3's page-shell
fix), so the header, the home content, and the footer read as one aligned column, matching the
north star's single `.shell` measure used everywhere.

Three header features restore from the live site (completion pass, manifest item 8): the
**Members** nav entry carries its seven live sub-links again, opened as a DaisyUI v5 popover
dropdown on desktop (the `EditorToolbar` recipe: `popover="auto"` plus an anchor-name/
position-anchor pair, so Escape and light-dismiss come from the Popover API for free, never the
ARIA-menu role, since this is a plain link list) and inlined under its own parent link in the
mobile drawer; a **Donate** heart icon (the live site's own Phosphor heart path) sits beside the
search trigger; and **search** is the family's Pagefind pattern (`SearchModal.svelte`, ecxc's own
component, opened by its trigger or Cmd/Ctrl+K).

The theme toggle sets `data-theme` on `<html>` between `asc` (light) and `asc-dark`, and persists
the choice to an `asc-site-theme` cookie (path `/`, a year) so it survives a reload; the inline
script in `app.html` reads that same cookie before first paint. With no stored choice, `data-theme`
stays unset and `theme.css`'s own `prefers-color-scheme` block follows the OS setting, live, with
no JS at all. The north star itself is a light-only design contract; the toggle is chassis
infrastructure every cairn theme carries, kept working here even though the mockup shows no dark
state. -->
<script lang="ts">
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import { extractMenu, type NavNode } from '@glw907/cairn-cms';
  import { resolveTheme, toggleTheme as chassisToggleTheme, type ThemeToggleConfig } from '$chassis/theme-toggle.js';
  import { siteConfig } from '$theme/cairn.config';
  import SearchModal from './SearchModal.svelte';

  const nav = extractMenu(siteConfig, 'primary', 2);

  let mobileOpen = $state(false);
  let membersMenuOpen = $state(false);
  let membersMenuEl = $state<HTMLUListElement>();
  let membersOpenTimer: ReturnType<typeof setTimeout> | undefined;
  let membersCloseTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * The Members dropdown's hover-intent open (owner-round-2 fix, 2026-07-07): a short delay
   * (120ms) before showing, so a pointer skimming past the header on its way elsewhere never
   * flickers the panel open. Click and keyboard (the existing `popovertarget`/`ontoggle` wiring)
   * are untouched; this only adds a second way to open the same popover.
   */
  function scheduleMembersOpen(): void {
    clearTimeout(membersCloseTimer);
    membersOpenTimer = setTimeout(() => {
      if (!membersMenuEl?.matches(':popover-open')) membersMenuEl?.showPopover();
    }, 120);
  }

  /**
   * The dropdown's hover-intent close: a longer delay (250ms) than the open, so a pointer
   * travelling diagonally from the caret down into the panel itself has time to arrive before the
   * panel disappears out from under it.
   */
  function scheduleMembersClose(): void {
    clearTimeout(membersOpenTimer);
    membersCloseTimer = setTimeout(() => {
      if (membersMenuEl?.matches(':popover-open')) membersMenuEl?.hidePopover();
    }, 250);
  }

  /** True for the one nav item (Members) that carries a live sub-link list. */
  function hasChildren(item: NavNode): item is NavNode & { children: NavNode[] } {
    return !!item.children && item.children.length > 0;
  }

  /**
   * Whether a nav item points at the page being viewed. The home link matches only the exact
   * root; a deeper link matches its own path or anything nested under it.
   */
  function isCurrent(href: string): boolean {
    // Normalize a trailing slash off both sides before comparing: the nav hrefs carry one
    // ("/education/") while the resolved pathname may not ("/education"), and the raw mismatch
    // left every subpage's nav link unmarked (only "/" matched), so a visitor lost their place
    // everywhere but home.
    const trim = (s: string) => (s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s);
    const path = trim(page.url.pathname);
    const target = trim(href);
    if (target === '/') return path === '/';
    return path === target || path.startsWith(`${target}/`);
  }

  function closeMobile(): void {
    mobileOpen = false;
  }

  /** The two explicit theme choices; theme.css defines both as named DaisyUI themes. */
  type Theme = 'asc' | 'asc-dark';

  /** This theme's own names and cookie, fed to the chassis toggle mechanism below. */
  const themeConfig: ThemeToggleConfig<Theme> = { light: 'asc', dark: 'asc-dark', cookieName: 'asc-site-theme' };

  // The icon is correct on first paint even before any explicit choice exists (resolveTheme reads
  // `<html>`'s live data-theme, set by the head script, or falls back to the system scheme).
  // Never called during SSR (`browser` guards every call site).
  let theme = $state<Theme>(browser ? resolveTheme(themeConfig) : 'asc');

  /** Flips the explicit theme via the chassis mechanism, which also persists the choice. */
  function toggleTheme(): void {
    theme = chassisToggleTheme(themeConfig, theme);
  }
</script>

{#snippet donateHeart()}
  <!-- The live site's own Donate heart shortcut (Phosphor "heart", assets/icons/heart.svg),
       shared by the header trigger and the narrow-viewport drawer entry below. -->
  <svg class="h-5 w-5" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path
      d="M178,40c-20.65,0-38.73,8.88-50,23.89C116.73,48.88,98.65,40,78,40a62.07,62.07,0,0,0-62,62c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,228.66,240,172,240,102A62.07,62.07,0,0,0,178,40ZM128,214.8C109.74,204.16,32,155.69,32,102A46.06,46.06,0,0,1,78,56c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,155.61,146.24,204.15,128,214.8Z"
    />
  </svg>
{/snippet}

{#snippet themeIcon()}
  {#if theme === 'asc-dark'}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M5.64 5.64l1.42 1.42M16.94 16.94l1.42 1.42M3 12h2M19 12h2M5.64 18.36l1.42-1.42M16.94 7.06l1.42-1.42" />
    </svg>
  {:else}
    <!-- Stroke-drawn like the sun and every other header glyph; a filled moon reads as a
         different icon set beside them. -->
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  {/if}
{/snippet}

<header class="site-header sticky top-0 z-30 border-b border-card-border bg-base-100">
  <div class="nav-inner mx-auto flex max-w-measure-wide items-center justify-between gap-m px-m py-xs">
    <a
      href="/"
      class="site-logo inline-flex items-center gap-[0.6rem] no-underline"
      aria-label="{siteConfig.siteName} home"
      onclick={closeMobile}
    >
      <!-- The club's real mark (aksailingclub.org's own /img/logo.png): a crescent sail hull under
           a star trail. Two fixed raster variants, not an inline recreation: the source has no
           vector original, and this is a brand-identity restoration, not a reinterpretation, so
           the actual asset is the faithful choice. `logo-white` shows only under the dark theme
           (see theme.css's `[data-theme='asc-dark']` convention). The mark carries the header
           alone (Geoff's live-page finding, 2026-07-07: the live site drops the "Alaska Sailing
           Club" wordmark next to it, and this restoration had kept a wordmark the live site
           doesn't); both imgs stay decorative (alt=""), since the surrounding link's own
           `aria-label` is the accessible name regardless of what sits inside it. Sized up from the
           asset's own 52x32 (`.logo-mark`'s CSS height, below) now that the mark is the header's
           sole brand anchor. -->
      <img src="/img/logo.png" alt="" width="52" height="32" class="logo-mark logo-mark-light" />
      <img src="/img/logo-white.png" alt="" width="52" height="32" class="logo-mark logo-mark-dark" />
    </a>

    <!-- Desktop nav: hidden below the collapse breakpoint, replaced by the hamburger drawer.
         Reads `--text-step--1` directly in the stylesheet below (the design-scale audit's fix,
         2026-07-07, corrected that token's own broken clamp so it now lands at the same 0.95rem
         the north star's own `.nav a` recipe always used, plus a touch of letter-spacing). Item
         rhythm is `gap-s`, not the still-too-generous
         `gap-m` a first pass tried: with the logo's own true width protected (see `.site-logo`'s
         `flex-shrink: 0` below) and eleven flex children (seven links, Members' own caret, the
         donate/search/theme-toggle icons) all sharing this one gap, `gap-m` alone pushed the
         row's honest total past `nav-inner`'s own capped width at every tested breakpoint from
         640 to 2560, which is what the shrink-driven overlap bug (this pass's regression) was
         actually compensating for. `gap-s` plus the raised breakpoint below keeps the row
         genuinely fitting, verified by a width sweep. -->
    <nav class="desktop-nav items-center gap-s" aria-label="Primary">
      {#each nav as item (item.url ?? item.label)}
        {@const current = item.url ? isCurrent(item.url) : false}
        {#if hasChildren(item)}
          <!-- Members: a real link to /members/ plus a caret that opens its seven sub-links as a
               DaisyUI v5 popover dropdown (the EditorToolbar recipe: popovertarget/anchor-name on
               the trigger, popover="auto"/position-anchor on the panel), so Escape and light-dismiss
               come from the Popover API for free. A plain link list, not an ARIA menu: nothing here
               behaves like a menu command. The small `gap-3xs` keeps the caret optically tight to
               its own label, while the pair still reads as one `gap-s` item next to its neighbors. -->
          <!-- onmouseenter/onmouseleave on the wrapper, not just the caret (owner-round-2 fix,
               2026-07-07): the panel itself (`.members-dropdown`, below) is a DOM child of this
               same div even though `popover` promotes its paint to the top layer, so hovering
               into the open panel stays inside this element's subtree and never fires the leave
               handler early. A mouse-only convenience layered onto the existing click/keyboard
               path (the link and the caret's own `popovertarget`/Escape handling, both untouched),
               not a new interactive control of its own, so it carries no new role or tab stop. -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="nav-item-dropdown inline-flex items-center gap-3xs"
            onmouseenter={scheduleMembersOpen}
            onmouseleave={scheduleMembersClose}
          >
            <a href={item.url} class="nav-link" class:active={current} aria-current={current ? 'page' : undefined}>
              {item.label}
            </a>
            <button
              type="button"
              class="nav-caret inline-flex h-6 w-6 items-center justify-center text-muted hover:text-base-content"
              aria-label="{item.label} menu"
              aria-expanded={membersMenuOpen}
              popovertarget="members-menu"
              style="anchor-name:--members-menu"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <ul
              bind:this={membersMenuEl}
              popover="auto"
              id="members-menu"
              style="position-anchor:--members-menu"
              ontoggle={(e) => (membersMenuOpen = e.newState === 'open')}
              class="members-dropdown dropdown menu menu-sm rounded-box border border-card-border bg-base-100 p-1 shadow-[var(--cairn-shadow)]"
            >
              {#each item.children as child (child.url ?? child.label)}
                <li><a href={child.url}>{child.label}</a></li>
              {/each}
            </ul>
          </div>
        {:else}
          <a
            href={item.url}
            class="nav-link"
            class:active={current}
            aria-current={current ? 'page' : undefined}
          >
            {item.label}
          </a>
        {/if}
      {/each}
      <!-- The icon trio (owner-round-2 fix, 2026-07-07): donate, search, and the theme toggle
           previously sat at the nav's own `gap-s`, the same rhythm separating one nav link from
           the next, so they read as three more nav items rather than a single utility cluster.
           A tighter inner `gap-2xs` binds the trio into one group; the surrounding `gap-s` (this
           group's own distance from Members, the last nav link) still marks it as a distinct
           cluster at the row's end. -->
      <div class="nav-icon-group inline-flex items-center gap-2xs">
        {@render donateLink()}
        <SearchModal />
        <button
          type="button"
          onclick={toggleTheme}
          aria-label={theme === 'asc-dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          class="theme-toggle inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-field text-muted hover:text-base-content"
        >
          {@render themeIcon()}
        </button>
      </div>
    </nav>

    <div class="mobile-controls items-center gap-1">
      {@render donateLink()}
      <SearchModal />
      <button
        type="button"
        onclick={toggleTheme}
        aria-label={theme === 'asc-dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        class="theme-toggle inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-muted hover:text-base-content"
      >
        {@render themeIcon()}
      </button>
      <button
        type="button"
        class="hamburger inline-flex h-11 w-11 items-center justify-center rounded-field text-base-content"
        onclick={() => (mobileOpen = !mobileOpen)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
      >
        {#if mobileOpen}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        {/if}
      </button>
    </div>
  </div>

  {#if mobileOpen}
    <div class="mobile-menu mx-auto max-w-measure-wide border-t border-card-border px-m py-2xs">
      <div class="mobile-menu-links">
        {#each nav as item (item.url ?? item.label)}
          {@const current = item.url ? isCurrent(item.url) : false}
          <a
            href={item.url}
            class="mobile-link"
            class:active={current}
            aria-current={current ? 'page' : undefined}
            onclick={closeMobile}
          >
            {item.label}
          </a>
          {#if hasChildren(item)}
            <!-- No toggle needed here: the drawer is already a full-screen overlay, so the seven
                 sub-links inline directly under their parent rather than hiding behind a second tap. -->
            <div class="mobile-submenu">
              {#each item.children as child (child.url ?? child.label)}
                <a href={child.url} class="mobile-sublink" onclick={closeMobile}>{child.label}</a>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</header>

{#snippet donateLink()}
  <!-- The header's icon-only trigger, restored beside the search trigger in the same position
       the old header used; the narrow-viewport drawer entry above renders the same heart with
       a visible label instead. -->
  <a
    href="/donate/"
    aria-label="Donate"
    title="Donate"
    class="donate-link inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-field text-muted hover:text-primary"
  >
    {@render donateHeart()}
  </a>
{/snippet}

<style>
  .site-logo {
    transition: opacity 0.15s ease;
  }
  .site-logo:hover {
    opacity: 0.85;
  }
  .site-logo:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .logo-mark {
    height: 2.5rem;
    width: auto;
  }
  .logo-mark-dark {
    display: none;
  }
  :global([data-theme='asc-dark']) .logo-mark-light {
    display: none;
  }
  :global([data-theme='asc-dark']) .logo-mark-dark {
    display: block;
  }

  .desktop-nav {
    display: none;
  }

  .nav-link {
    color: var(--color-base-content);
    text-decoration: none;
    font-weight: 500;
    font-size: var(--text-step--1);
    letter-spacing: 0.01em;
    padding-block: 0.25rem;
    line-height: 1;
    transition: color 0.15s ease;
  }
  .nav-link:hover {
    color: var(--color-primary);
  }
  .nav-link:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    border-radius: 2px;
  }
  /* The story's gold active-nav mark: flag-navy text plus a star-gold underline rule, matching the
     north star's own `.nav a.active { color: #1C4670; box-shadow: 0 2px 0 #E3A008; }`. */
  .nav-link.active {
    color: var(--color-primary);
    font-weight: 650;
    box-shadow: 0 2px 0 var(--color-secondary);
  }

  .theme-toggle,
  .donate-link,
  .nav-caret {
    transition: color 0.15s ease;
  }
  .theme-toggle:focus-visible,
  .donate-link:focus-visible,
  .nav-caret:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  /* The trio's own 44px pointer target (owner-round-2 fix, 2026-07-07): the visible box stays a
     compact 36px (`h-9 w-9`, the desktop nav's own icon size, unchanged so the tightened group
     above still fits the row's own measured width budget), and an invisible `::before` extends
     the actual hit area 4px past every edge instead, the standard expanded-target technique.
     Absolute positioning keeps the extension out of flex layout, so neither the icon's own box
     nor its siblings' spacing shift. Reused by `.search-trigger` in SearchModal.svelte for the
     same fix on the same-sized trigger. */
  .theme-toggle,
  .donate-link {
    position: relative;
  }
  .theme-toggle::before,
  .donate-link::before {
    content: '';
    position: absolute;
    inset: -4px;
  }

  .nav-item-dropdown {
    position: relative;
  }
  /* The dropdown panel: a plain link list (not an ARIA menu), positioned under its own caret via
     the popover anchor pair set inline above. */
  .members-dropdown {
    min-width: 12rem;
  }
  /* DaisyUI's menu class sets display: flex as an author style, which overrides the UA
     popover stylesheet's [popover]:not(:popover-open) { display: none }, so the closed
     panel would otherwise paint at 0,0 on every page. Restate the hidden state here. */
  .members-dropdown:not(:popover-open) {
    display: none;
  }
  .members-dropdown a {
    text-decoration: none;
    color: var(--color-base-content);
  }
  /* A defensive floor for a real, if narrow, race: the popover's top-layer paint is independent of
     this component's own layout, so a live resize past the `.desktop-nav` breakpoint (below,
     46rem) while the panel happens to be open does not itself close it, and it would otherwise
     strand a floating panel with no visible trigger anywhere near it. Forces it closed below the
     same floor the desktop nav itself collapses at, regardless of the popover's own open state. */
  @media (max-width: 45.9375rem) {
    .members-dropdown {
      display: none;
    }
  }

  .mobile-controls {
    display: flex;
  }

  /* A parent link immediately followed by its own submenu drops its divider, so the group reads
     as one block with a single rule below the last sub-link instead of two close-together lines. */
  .mobile-link:has(+ .mobile-submenu) {
    border-bottom: none;
  }
  .mobile-submenu {
    display: flex;
    flex-direction: column;
    padding-left: var(--spacing-s);
    border-bottom: 1px solid var(--color-card-border);
  }
  .mobile-submenu:last-child {
    border-bottom: none;
  }
  .mobile-sublink {
    font-size: var(--text-step--1);
    color: var(--color-muted);
    text-decoration: none;
    padding-block: 0.6rem;
  }
  .mobile-sublink:hover {
    color: var(--color-primary);
  }
  .mobile-sublink:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .hamburger:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .mobile-menu {
    display: flex;
    flex-direction: column;
  }
  .mobile-menu-links {
    display: flex;
    flex-direction: column;
  }
  .mobile-link {
    font-weight: 500;
    color: var(--color-base-content);
    text-decoration: none;
    padding-block: 0.8rem;
    border-bottom: 1px solid var(--color-card-border);
  }
  .mobile-menu-links > .mobile-link:last-child {
    border-bottom: none;
  }
  .mobile-link:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }
  .mobile-link.active {
    color: var(--color-primary);
    font-weight: 650;
  }

  /* Re-derived after the wordmark span was removed above (Geoff's live-page finding, 2026-07-07):
     a fine-grained sweep (every 4px from 600 to 1024, forcing the desktop row on to measure it
     honestly) found the row does NOT simply fit far lower without the wordmark, the plausible
     assumption removing a whole text label invites. The row's overflow is non-monotonic: clean
     from 656-668px, overflowing again from 672-724px (a rendering artifact of the nav's own flex
     wrapping math at those widths, not the wordmark), and only clean continuously from 728px on.
     46rem/736px is that stable floor plus a small cross-browser safety margin, a real but modest
     ~32px improvement on the pre-removal 768px floor, not the family's usual round 640px default.
     The same sweep, re-run with the Members caret/dropdown dropped (the prior 768-959px "tablet
     step-down"), found its own stable floor at 696px, a further ~32-40px than the un-tightened
     row's 736px; too small a win for a second breakpoint tier, so that state is gone rather than
     carried forward for a marginal gain ("prefer the simplest state machine the measurements
     allow"). Below 736px, the hamburger drawer still carries every nav entry, Members' seven
     sub-links included. */
  @media (min-width: 46rem) {
    .desktop-nav {
      display: flex;
    }
    .mobile-controls {
      display: none;
    }
    /* A defensive floor, not a fix for an active bug the way the pre-wordmark-removal version of
       this rule was: nav-inner is a two-item flex row (logo, nav) under
       `justify-content: space-between`, and flex's default shrink math could still compress the
       logo's own box if a future content change ever pushed the row tight again. A global
       flex-shrink: 0 instead broke the much narrower mobile row (logo + search + hamburger) at
       320px, which relies on the same shrink to fit; scoping it to this breakpoint keeps that
       row's own behavior untouched. */
    .site-logo {
      flex-shrink: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .site-logo,
    .nav-link,
    .theme-toggle {
      transition: none;
    }
  }
</style>
