<!-- @component
ASC's public site footer: the club-grounds "closing band" (Task 3), matching the north star's own
`<footer>` (flag-navy-deep ground, footer-ink text, a translucent top hairline) exactly, replacing
Task 1's placeholder base-200 band. The same fixed navy-deep ground the home page's own closing CTA
section uses; both read `--color-neutral`/`--color-neutral-content` directly rather than through a
shared component, since they are two independent templates (the footer chrome, the home page's own
markup) that happen to want the same brand device. The footer row boxes to `max-w-measure-wide`,
the same width SiteHeader and the home page's own bands use, so the whole page reads as one
aligned column top to bottom. Discord and Contact restore the two links the completion pass found
missing (manifest item 12); the full list and its order follow the live site's own footer menu
weights. -->
<script lang="ts">
  import { siteConfig } from '$theme/cairn.config';

  /** A footer-nav entry: the visible label and the path it links to. */
  type NavItem = { label: string; href: string };

  const nav: NavItem[] = [
    { label: 'Join', href: '/join/' },
    { label: 'Events', href: '/events/' },
    { label: 'News', href: '/posts/' },
    { label: 'Discord', href: '/discord-server/' },
    { label: 'Governance', href: '/governance/' },
    { label: 'Contact', href: '/contact/' },
    { label: '♥ Donate', href: '/donate/' },
  ];
</script>

<footer class="site-footer border-t border-white/10 bg-flag-navy-deep py-l">
  <div class="mx-auto flex max-w-measure-wide flex-wrap items-center justify-between gap-s px-m text-step--2 text-footer-ink">
    <span>&copy; {new Date().getFullYear()} {siteConfig.siteName} &middot; a 501(c)(3) nonprofit</span>
    <nav class="flex flex-wrap items-center gap-m" aria-label="Footer">
      {#each nav as item (item.href)}
        <a href={item.href} class="footer-link">{item.label}</a>
      {/each}
    </nav>
  </div>
</footer>

<style>
  /* padding-block (the completion pass's touch-target fix, manifest item 4): measured 20px tall,
     short of the 24px minimum. A plain inline link's padding does not affect line-height, so this
     grows the clickable area without shifting the row's own layout. */
  .footer-link {
    color: var(--color-footer-ink);
    text-decoration: none;
    padding-block: 0.3rem;
    transition: color 0.15s ease;
  }
  .footer-link:hover {
    color: var(--color-footer-ink-strong);
  }
  .footer-link:focus-visible {
    outline: 2px solid var(--color-footer-ink-strong);
    outline-offset: 2px;
    border-radius: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .footer-link {
      transition: none;
    }
  }
</style>
