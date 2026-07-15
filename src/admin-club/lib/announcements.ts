// The Announce screen's own domain module (`/admin/club/announce`): an editor picks a recently
// published post and, in one deliberate step, can email every current member and/or ping a
// Discord channel about it. This is a site-owned feature, not a cairn engine seam: there is no
// publish-form injection point in the engine (Publish stays untouched), so Announce is its own
// admin screen an editor reaches after publishing, the same "build outside the admin skeleton"
// mode the Events/Classes/Members screens already use for club-domain concerns cairn has no
// opinion about.
//
// A post is git content (`src/content/posts/`), read through `$chassis/content`'s own
// `ContentIndex`, never a row in `CLUB_DB`; `announcements` (migrations/asc-club/0017) only
// records that a send happened, keyed by the post's own content id as a plain string, not a
// foreign key (the same reasoning `events`/`classes` never reference a git-owned concept).
import type { D1Database } from '@cloudflare/workers-types';
import { deriveExcerpt } from '@glw907/cairn-cms/delivery/data';
import { resolveSegment } from './segments';
import { chunkRecipients, RECIPIENT_CHUNK_SIZE } from './bulk-email';
import { sendClubEmail, type EmailBindingEnv } from './club-email';
import {
  ANNOUNCE_CHANNELS,
  ANNOUNCE_CHANNEL_LABEL,
  DEFAULT_ANNOUNCE_CHANNEL,
  isDiscordChannelConfigured,
  type DiscordBindingEnv,
  type DiscordChannel,
} from './discord';

/** The Announce form's own "Summary" prefill budget: wider than `deriveExcerpt`'s general-purpose
 *  200-char default (a list card's blind teaser), since this text is reviewed and edited by a
 *  human before anything sends, not shown unedited. */
export const ANNOUNCE_SUMMARY_MAX_CHARS = 280;

/** Below this many characters, a sentence-terminator cut is too aggressive (a lone "Yes." four
 *  characters in is not a summary); {@link sentenceAwareTrim} keeps the ellipsis fallback instead. */
const SENTENCE_CUT_MIN_CHARS = 120;

/**
 * The Announce form's own "Summary" field prefill (Geoff's 2026-07-08 rulings on the prefill's
 * exact shape). An explicit `description` frontmatter wins verbatim -- the same priority
 * `deriveExcerpt` itself already gives it -- and is never further cut, an author's own written
 * summary is not second-guessed. Absent that, this runs `deriveExcerpt` over the WHOLE flattened
 * body at this screen's own wider budget ({@link ANNOUNCE_SUMMARY_MAX_CHARS}, not the general
 * 200-char default), then refines the cut with {@link sentenceAwareTrim}. A one-word lead
 * paragraph ("Ahoy!") is never treated as the whole summary on its own: `deriveExcerpt` flattens
 * every paragraph break into one running text before it measures any budget, so the cut lands
 * wherever the combined text actually reaches it, never after the first line.
 */
export function deriveAnnouncementSummary(body: string, description: string | undefined): string {
  const excerpt = deriveExcerpt(body, { description, maxChars: ANNOUNCE_SUMMARY_MAX_CHARS });
  if (description?.trim()) return excerpt; // an explicit summary is never re-cut
  return sentenceAwareTrim(excerpt);
}

/**
 * Prefer a complete-sentence cut over `deriveExcerpt`'s own word-boundary-plus-ellipsis when one
 * is available: if the truncated text holds a `.`/`!`/`?` terminator past
 * {@link SENTENCE_CUT_MIN_CHARS}, cut there and drop the ellipsis (a finished sentence needs
 * none); otherwise keep `deriveExcerpt`'s own cut untouched. `excerpt` not ending in an ellipsis
 * means the source text already fit inside the budget with no truncation at all, and is returned
 * as-is (nothing to refine).
 */
function sentenceAwareTrim(excerpt: string): string {
  if (!excerpt.endsWith('…')) return excerpt;
  const truncated = excerpt.slice(0, -1).trimEnd();
  // The word-boundary cut can itself coincidentally land right after a sentence's own terminator
  // (no trailing space survives to search for), so a truncated text already ending in one counts
  // on its own, before searching for an earlier `. `/`! `/`? ` occurrence.
  if (/[.!?]$/.test(truncated)) return truncated.length >= SENTENCE_CUT_MIN_CHARS ? truncated : excerpt;
  const lastTerminator = Math.max(truncated.lastIndexOf('. '), truncated.lastIndexOf('! '), truncated.lastIndexOf('? '));
  if (lastTerminator < SENTENCE_CUT_MIN_CHARS) return excerpt;
  return truncated.slice(0, lastTerminator + 1);
}

/** One `announcements` row, camelCased. */
export interface AnnouncementRow {
  id: string;
  postId: string;
  postTitle: string;
  emailed: boolean;
  emailCount: number;
  discordChannel: DiscordChannel | null;
  actor: string;
  createdAt: string;
}

interface AnnouncementRawRow {
  id: string;
  post_id: string;
  post_title: string;
  emailed: number;
  email_count: number;
  discord_channel: string | null;
  actor: string;
  created_at: string;
}

function toAnnouncementRow(row: AnnouncementRawRow): AnnouncementRow {
  return {
    id: row.id,
    postId: row.post_id,
    postTitle: row.post_title,
    emailed: row.emailed === 1,
    emailCount: row.email_count,
    discordChannel: (row.discord_channel as DiscordChannel | null) ?? null,
    actor: row.actor,
    createdAt: row.created_at,
  };
}

/** Every announcement, newest first (`limit` caps the read; the list screen and the detail
 *  screen's own "already announced" lookup share this one query, reduced with
 *  {@link latestAnnouncementByPost}). */
export async function listAnnouncements(db: D1Database, limit = 200): Promise<AnnouncementRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, post_id, post_title, emailed, email_count, discord_channel, actor, created_at
       FROM announcements ORDER BY created_at DESC LIMIT ?1`,
    )
    .bind(limit)
    .all<AnnouncementRawRow>();
  return results.map(toAnnouncementRow);
}

/** The most recent announcement per post, keyed by post id. `rows` must already be newest-first
 *  (`listAnnouncements`'s own order), so the first row seen for a given post is its latest; a
 *  post with no row at all simply has no entry in the returned map. */
export function latestAnnouncementByPost(rows: readonly AnnouncementRow[]): Map<string, AnnouncementRow> {
  const byPost = new Map<string, AnnouncementRow>();
  for (const row of rows) {
    if (!byPost.has(row.postId)) byPost.set(row.postId, row);
  }
  return byPost;
}

export interface RecordAnnouncementArgs {
  postId: string;
  postTitle: string;
  emailed: boolean;
  emailCount: number;
  discordChannel: DiscordChannel | null;
  actor: string;
}

/** Write one `announcements` row for a send attempt. Called once per submit, after whichever of
 *  the email/Discord sends the form selected have already run: this is the durable record, not a
 *  precondition for either send. */
export async function recordAnnouncement(db: D1Database, args: RecordAnnouncementArgs): Promise<void> {
  await db
    .prepare(
      `INSERT INTO announcements (id, post_id, post_title, emailed, email_count, discord_channel, actor)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(crypto.randomUUID(), args.postId, args.postTitle, args.emailed ? 1 : 0, args.emailCount, args.discordChannel, args.actor)
    .run();
}

/** Deduplicate `emails` case-insensitively, keeping each address's first-seen casing: a shared
 *  household email entered on two member rows must reach that household once, not twice. A pure
 *  utility, factored out of {@link currentMemberEmails} so the dedupe behavior itself is directly
 *  testable against contrived input, independent of the demo fixture's own (currently
 *  duplicate-free) data. */
export function dedupeEmails(emails: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const email of emails) {
    const trimmed = email.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, trimmed);
  }
  return [...byKey.values()];
}

/**
 * Every non-archived member's email in a household with `'current'` or `'grace'` standing:
 * a thin call through {@link resolveSegment}'s own `'current'` segment, so Announce and the
 * Compose screen's segment picker (`segments.ts`) can never disagree about who counts as a
 * current member. `resolveSegment` already deduplicates case-insensitively.
 */
export async function currentMemberEmails(db: D1Database): Promise<string[]> {
  const { recipients } = await resolveSegment(db, 'current');
  return recipients.map((recipient) => recipient.email);
}

/** The chunked-send loop this function used to own directly now lives in `bulk-email.ts` (the
 *  Compose screen's own segment blasts share it); re-exported here so a caller (and this module's
 *  own existing tests) that imports either from `announcements.ts` keeps working unchanged. */
export { chunkRecipients, RECIPIENT_CHUNK_SIZE } from './bulk-email';

/**
 * The announcement email's own subject/body, the sibling render to `discord.ts`'s
 * `buildStoryNotice`: the two never share one composed text (Geoff's own correction, 2026-07-08)
 * because an email and a Discord embed are different shapes, not the same string in two boxes.
 * `subject` is the author-edited subject line (defaults to the post's own title, see the
 * Announce route's own fallback); `body` is greeting-free, the author-edited summary as
 * written (paragraph breaks preserved), a `---` rule, then a plain "Read the full post: <url>"
 * line -- `club-email.ts`'s own minimal markdown pass (`**bold**`, a bare `---` as `<hr>`, a
 * blank line as a paragraph break) renders both without any new formatting support.
 */
export function buildAnnouncementEmailContent(args: { subject: string; message: string; url: string }): { subject: string; body: string } {
  return {
    subject: args.subject.trim(),
    body: `${args.message.trim()}\n\n---\n\nRead the full post: ${args.url}`,
  };
}

export interface SendAnnouncementEmailsResult {
  sentCount: number;
  failedCount: number;
}

/**
 * Email `args.recipients` the same composed subject/body (`buildAnnouncementEmailContent`), one
 * `sendClubEmail` call per recipient (`raw` path, not a stored template: an announcement's content
 * is one-off and per-post, the case `SendClubEmailArgs.raw` exists for), chunked through
 * `bulk-email.ts`'s own shared {@link chunkRecipients} loop (the Compose screen's segment blasts
 * share the identical chunking behavior). A failed send for one recipient never blocks the rest
 * (`sendClubEmail`'s own never-throws contract). `segment` tags each `email_log` row with the post
 * id, so a send's history is traceable back to the announcement that caused it.
 */
export async function sendAnnouncementEmails(
  db: D1Database,
  env: EmailBindingEnv,
  args: { postId: string; subject: string; message: string; url: string; recipients: readonly string[] },
): Promise<SendAnnouncementEmailsResult> {
  const { subject, body } = buildAnnouncementEmailContent(args);
  let sentCount = 0;
  let failedCount = 0;
  for (const chunk of chunkRecipients(args.recipients)) {
    const outcomes = await Promise.all(
      chunk.map((to) => sendClubEmail(db, env, { to, raw: { subject, body }, vars: {}, segment: `announce:${args.postId}` })),
    );
    for (const outcome of outcomes) {
      if (outcome.ok) sentCount += 1;
      else failedCount += 1;
    }
  }
  return { sentCount, failedCount };
}

/** One Discord channel option for the Announce form's `<select>`: its display label and whether
 *  its webhook secret is actually set, so an unconfigured channel still lists (the gap stays
 *  visible) but renders disabled. */
export interface AnnounceChannelOption {
  value: DiscordChannel;
  label: string;
  configured: boolean;
}

/** Every Announce channel, in select order, each marked configured or not. */
export function announceChannelOptions(env: DiscordBindingEnv): AnnounceChannelOption[] {
  return ANNOUNCE_CHANNELS.map((value) => ({
    value,
    label: ANNOUNCE_CHANNEL_LABEL[value],
    configured: isDiscordChannelConfigured(env, value),
  }));
}

/**
 * The channel the Announce form's `<select>` actually binds to on load: `general` when it has
 * a webhook configured (Geoff's ruled default), otherwise the first configured channel in
 * {@link ANNOUNCE_CHANNELS} order, so the form always opens on a channel that can actually send.
 * An unconfigured channel still renders in the option list (disabled, via
 * {@link announceChannelOptions}) so a gap stays visible rather than quietly disappearing.
 * Falls back to `general` when nothing at all is configured; that selection will simply
 * degrade to `notifyDiscord`'s own silent no-op if submitted.
 */
export function defaultAnnounceChannel(env: DiscordBindingEnv): DiscordChannel {
  if (isDiscordChannelConfigured(env, DEFAULT_ANNOUNCE_CHANNEL)) return DEFAULT_ANNOUNCE_CHANNEL;
  return ANNOUNCE_CHANNELS.find((channel) => isDiscordChannelConfigured(env, channel)) ?? DEFAULT_ANNOUNCE_CHANNEL;
}
