// The events deep-look pass: a fixed filename-to-media-token map for the club's D1-sourced event
// and class photography. Each row's `hero_image` column names a legacy filename ("bnac.jpg"), not
// a cairn `media:` reference, since the photo lives in the club's read-only ops D1
// (`$theme/events-data.ts`), not this site's own content; there is no frontmatter field to hang a
// `fields.image` on, the same reasoning `home-images.ts` documents for the home page's fixed
// photography. The 14 source files (`~/Projects/aksailingclub-org/static/events/images/`) are
// pulled into the media library once, content-hashed; one of them (`end-of-season-party.jpg`)
// turned out to be the exact same bytes already uploaded as the home hero photo
// (`sunset-sail-dock`), so it reuses that entry rather than duplicating it, the dedup working as
// designed.
import { parseMediaToken, type MediaResolve } from '@glw907/cairn-cms/media';

const EVENT_IMAGE_TOKENS: Record<string, string> = {
  'spring-work-party.jpg': 'media:spring-work-party.3ad6a065151bca0a',
  'icebreaker-regatta.jpg': 'media:icebreaker-regatta.269df7f24f1b6072',
  'firecracker-regatta.jpg': 'media:firecracker-regatta.ae5a9345fbdd6df3',
  'pirate-race-youth-cup.jpg': 'media:pirate-race-youth-cup.1df76cccb2448b6f',
  'fireweed-ladies-race.jpg': 'media:fireweed-ladies-race.a35f27a8b70ba44c',
  'governors-cup.jpg': 'media:governors-cup.c90f78621e7639ae',
  'bnac.jpg': 'media:bnac.29d75df78f196b2e',
  'northern-lights-regatta.jpg': 'media:northern-lights-regatta.8e99511edc8a8ba6',
  'fall-work-party.jpg': 'media:fall-work-party.6f5a1099cc1e6702',
  'end-of-season-party.jpg': 'media:sunset-sail-dock.ee278d04cc0db8e2',
  'adult-intro-class-1.jpg': 'media:adult-intro-class-1.a660579bd31517ff',
  'youth-intro-class-1.jpg': 'media:youth-intro-class-1.9c08687cac54de80',
  'adult-intro-class-2.jpg': 'media:adult-intro-class-2.02f488eb2fe199d8',
  'youth-intro-class-2.jpg': 'media:youth-intro-class-2.091a328187aa5733',
};

/**
 * Resolve a D1 row's `hero_image` filename to its delivery URL, or undefined when the row has no
 * image or the filename is not one of the 14 migrated assets (a future ops-side upload the
 * catalogue above does not yet know about). The caller supplies the row's own `hero_image_alt` for
 * display text; this only resolves which bytes to show, matching `resolveMedia`'s own contract
 * (undefined on any miss degrades to the type-colored placeholder, never a broken image).
 */
export function resolveEventImageUrl(
  filename: string | null,
  resolveMedia: MediaResolve,
): string | undefined {
  if (!filename) return undefined;
  const token = EVENT_IMAGE_TOKENS[filename];
  if (!token) return undefined;
  const ref = parseMediaToken(token);
  if (!ref) return undefined;
  return resolveMedia(ref);
}
