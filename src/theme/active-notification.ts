// The home page's notification banner: the single live entry of the site-declared `notifications`
// concept (`routing: 'embedded'`, see cairn.config.ts's header comment), or none. Pulled out of
// the home page's own server load into a pure, unit-testable function: the concept's render path
// (this selection plus the +page.svelte strip that shows it) is correct engine wiring, but had no
// test of its own to prove the expiry rule against a concrete date, which is exactly the rule this
// module now guards.
import type { ContentIndex } from '@glw907/cairn-cms/delivery';

/** The notification fields the home banner reads. */
export interface NotificationFields {
  body: string;
  expires: string;
}

/** One notification's home-banner projection: title and body, the two the banner shows. */
export interface ActiveNotification {
  title: string;
  body: string;
}

/**
 * The single live notification, or undefined when none is current. Only one entry is ever
 * current at a time (the site-declared concept's whole point), so this reads every entry's
 * `expires` and returns the first whose date has not yet passed; an unparsable or missing
 * `expires` reads as already-expired (the safe failure for a low-stakes banner), matching the
 * migration's own note that an expired bulletin is correct, honest behavior, not a bug. `today` is
 * an injected `YYYY-MM-DD` string so this stays a pure function of its inputs rather than reading
 * the clock itself.
 */
export function activeNotification(
  notifications: ContentIndex<NotificationFields>,
  today: string,
): ActiveNotification | undefined {
  for (const summary of notifications.all()) {
    const entry = notifications.byId(summary.id);
    if (!entry) continue;
    const expires = entry.frontmatter.expires;
    if (typeof expires === 'string' && expires >= today) {
      return { title: entry.title, body: entry.frontmatter.body };
    }
  }
  return undefined;
}
