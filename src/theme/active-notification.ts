// The home page's notification banner: the single live entry of the `bulletins` concept whose
// expiry has not yet passed (production's own model, restored by pass-B sidebar T3,
// docs/2026-07-18-admin-sidebar-2-design.md decision 4). The earlier content migration split
// production's single bulletins concept into this feed plus an invented `notifications` banner
// concept, which duplicated entries; that concept has now retired and this module reads
// `bulletins` directly. Pulled out of the home page's own server load into a pure,
// unit-testable function: the concept's render path (this selection plus the +page.svelte strip
// that shows it) is correct engine wiring, but had no test of its own to prove the expiry rule
// against a concrete date, which is exactly the rule this module now guards.
import type { ContentIndex } from '@glw907/cairn-cms/delivery';

/** The bulletin fields the home banner reads (the detail line and expiry, both optional per
 *  `cairn.config.ts`'s `bulletins` fieldset; a bulletin carrying neither still publishes its own
 *  page, it just never claims the banner). */
export interface BulletinBannerFields {
  detail?: string;
  expires?: string;
}

/** One bulletin's home-banner projection: title and body, the two the banner shows. */
export interface ActiveNotification {
  title: string;
  body: string;
}

/**
 * The single live bulletin for the home banner, or undefined when none is current. `bulletins`
 * are dated, so `ContentIndex.all()` already returns them newest-first; this returns the first
 * entry whose `expires` has not yet passed, matching production's "latest unexpired bulletin"
 * rule. An unparsable or missing `expires` reads as already-expired (the safe failure for a
 * low-stakes banner: a bulletin published with no expiry never silently claims it forever).
 * `today` is an injected `YYYY-MM-DD` string so this stays a pure function of its inputs rather
 * than reading the clock itself.
 */
export function activeNotification(
  bulletins: ContentIndex<BulletinBannerFields>,
  today: string,
): ActiveNotification | undefined {
  for (const summary of bulletins.all()) {
    const entry = bulletins.byId(summary.id);
    if (!entry) continue;
    const expires = entry.frontmatter.expires;
    if (typeof expires === 'string' && expires >= today) {
      return { title: entry.title, body: entry.frontmatter.detail ?? '' };
    }
  }
  return undefined;
}

/** One run of a notification body's text, either plain or the one bold "timely fact" a `**...**`
 *  pair marks. */
export interface BodySegment {
  text: string;
  bold: boolean;
}

/**
 * Splits a notification body on `**bold**` markers into plain and bold runs, for the home
 * pennant's "the timely fact bold" treatment (the round-3 redesign). `body` is a plain-text field
 * (the bulletin's `detail` line, not markdown), so this is the one narrow, safe convention the
 * pennant reads, never a route into `{@html}`: every segment still renders through Svelte's own
 * text interpolation, which escapes it the same as plain text. An unpaired or absent `**` leaves
 * the whole body as one plain segment.
 */
export function parseBoldSegments(body: string): BodySegment[] {
  return body
    .split(/\*\*(.+?)\*\*/g)
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((segment) => segment.text !== '');
}
