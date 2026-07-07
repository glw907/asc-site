<!-- @component
ASC's public site header: the club-grounds chrome (Task 3), replacing Task 1's placeholder. A
sticky white band over a hairline border, the club's real logo (aksailingclub.org's own
/img/logo.png, restored from the north star's invented placeholder mark; see the completion
pass's manifest item 4) on the left, the primary nav (site.config.yaml's committed menu) on the
right. The current route's link
gets the story's gold active-nav mark (flag-navy text plus a star-gold underline, via
`box-shadow`, matching the north star's own `.nav a.active` rule) and `aria-current="page"`.
Seven nav items plus the theme toggle do not comfortably wrap at 320px, so a hamburger drawer
replaces the desktop row below 640px (the family five-viewport responsive standard), the same
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

  /** True for the one nav item (Members) that carries a live sub-link list. */
  function hasChildren(item: NavNode): item is NavNode & { children: NavNode[] } {
    return !!item.children && item.children.length > 0;
  }

  /**
   * Whether a nav item points at the page being viewed. The home link matches only the exact
   * root; a deeper link matches its own path or anything nested under it.
   */
  function isCurrent(href: string): boolean {
    const path = page.url.pathname;
    if (href === '/') return path === '/';
    return path === href || path.startsWith(`${href}/`);
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.4 14.9A8.5 8.5 0 1 1 9.6 4.1a7 7 0 0 0 10.8 10.8z" />
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
           (see theme.css's `[data-theme='asc-dark']` convention). Decorative (alt=""): the
           adjacent site-name text already carries the link's accessible name via aria-label. -->
      <img src="/img/logo.png" alt="" width="52" height="32" class="logo-mark logo-mark-light" />
      <img src="/img/logo-white.png" alt="" width="52" height="32" class="logo-mark logo-mark-dark" />
      <span class="whitespace-nowrap font-display text-step-1 font-semibold tracking-tight text-base-content">
        {siteConfig.siteName}
      </span>
    </a>

    <!-- Desktop nav: hidden below the collapse breakpoint, replaced by the hamburger drawer.
         Sized directly (not `text-step--1`, too tight per the design-polish pass's measured
         render: 13.44px text read cramped), matching the north star's own `.nav a` recipe
         (0.95rem, a touch of letter-spacing). Item rhythm is `gap-s`, not the still-too-generous
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
          <div class="nav-item-dropdown inline-flex items-center gap-3xs">
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
      <!-- Below 420px the header row collapses Donate and the theme toggle out of
           `.mobile-controls` (the full club name cannot shrink, and the row has no other
           slack); this section restores both as reachable drawer entries, shown only at
           that same narrow range (see the `.mobile-menu-actions` media query below). -->
      <div class="mobile-menu-actions">
        <a href="/donate/" class="mobile-link mobile-action" onclick={closeMobile}>
          {@render donateHeart()}
          Donate
        </a>
        <button type="button" class="mobile-link mobile-action" onclick={toggleTheme}>
          {@render themeIcon()}
          {theme === 'asc-dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        </button>
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
    height: 2rem;
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
    font-size: 0.95rem;
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

  .mobile-controls {
    display: flex;
  }

  /* The club name (whitespace-nowrap, the brand, never truncated) plus the full four-button
     row overflow the viewport below ~420px. Donate and the theme toggle drop out of the row
     there; `.mobile-menu-actions` below restores both as drawer entries in that same range. */
  @media (max-width: 419px) {
    .mobile-controls .donate-link,
    .mobile-controls .theme-toggle {
      display: none;
    }
  }

  .mobile-menu-actions {
    display: none;
  }
  @media (max-width: 419px) {
    .mobile-menu-actions {
      display: flex;
      flex-direction: column;
    }
  }
  .mobile-action {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }
  .mobile-action:last-child {
    border-bottom: none;
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

  /* Raised from 640px (the design-polish pass's own regression): a width sweep with the logo's
     box protected from shrinking (`.site-logo` below) showed the full desktop row's honest total
     (logo + gap-s + all eleven nav/icon items) first fits with zero horizontal overflow at
     ~920px; 960px keeps a clear margin above that measured floor rather than shipping the exact
     crossover point. Below it, the hamburger drawer carries every nav entry instead. */
  @media (min-width: 60rem) {
    .desktop-nav {
      display: flex;
    }
    .mobile-controls {
      display: none;
    }
    /* Scoped to the desktop row alone: nav-inner is a two-item flex row (logo, nav) under
       `justify-content: space-between`, and without this the browser's flex-shrink math
       (site-logo is itself a nested inline-flex container) can compress the logo's own box below
       its content's real width once nav-inner's cap is tighter than the row's natural total.
       Since overflow stays visible, a shrunk box does not clip its own content, it lets the
       wordmark's `<span>` paint past the box's right edge and INTO the nav's own territory
       (measured: the wordmark's true right edge landed inside the nav's box at every width from
       640 to 2560, the design-polish pass's own regression this fixes). A global flex-shrink: 0
       instead broke the much narrower mobile row (logo + search + hamburger) at 320px, which
       relies on the same shrink to fit; scoping it here keeps that row's prior, working
       behavior untouched. */
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
