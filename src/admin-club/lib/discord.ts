// Discord notifications (the ops parity audit's own "Discord notifications absent" gap, see
// docs/2026-07-07-requirements-adversarial-review.md item 3 of the ops-parity verdict): ops
// posted committee-facing pings on payment-request and waitlist events, and the phase-2 system
// had none. This module is deliberately self-contained, with no import from and no edit to
// offers.ts, enrollments.ts, assets-store.ts, club-settings.ts, classes-store.ts, or
// club-email.ts (each mid-merge across sibling worktrees at the time this module was built);
// wiring a real call site into one of those files is the mechanical follow-up
// docs/discord-notifications-wiring.md names, not this pass's own work.
//
// `notifyDiscord` mirrors `club-email.ts`'s own `sendClubEmail` shape for a missing binding: a
// site that has not set the webhook secret degrades to a silent no-op rather than a broken
// admin action, the same reasoning `EmailBindingEnv`'s header gives for `EMAIL`. Unlike
// `sendClubEmail`, this module writes no D1 row of its own (there is no `discord_log` table, and
// this pass adds none): a notification is fire-and-forget, and its only durable record is
// whatever `audit_log` row the real call site already writes for the event itself.
//
// The two committee webhooks are one Discord server, split by committee: `DISCORD_WEBHOOK_ASSETS`
// posts to the assets/storage channel (payment requests, asset requests), `DISCORD_WEBHOOK_CLASSES`
// posts to the classes/program channel (waitlist signups, offers, a class filling). Both are
// Worker secrets on the destination site, not this repo's own config; see the wiring doc's
// "secrets cutover" section for how their values move from the ops worker to this one.
//
// The Announce feature (a published post's own "notify the club" step) adds a second, unrelated
// vocabulary of nine channels (leadership, general, site, fleet, education, racing,
// buccaneer-18, harbor, technology): every public/leadership Discord channel a story can ping,
// not the two narrow committee inboxes above. Both vocabularies share one `DiscordChannel` union
// and one webhook lookup, since a notification only ever needs "which secret does this channel's
// URL live under," not two separate code paths.

/** The Discord webhook binding shape this module needs: a structural subset of whatever the
 *  consuming site's own `Platform.env` carries (mirrors `EmailBindingEnv`'s own reasoning in
 *  `club-email.ts`), read as independently optional strings so a site that has provisioned only
 *  some channels' webhooks still gets pings on those. `ASSETS`/`CLASSES` are the two committee
 *  channels above; the rest are the Announce vocabulary. Only `GENERAL`, `SITE`, `FLEET`,
 *  `EDUCATION`, `RACING`, `HARBOR`, and `TECHNOLOGY` are set as real Worker secrets as of this
 *  writing; `LEADERSHIP` and `BUCCANEER_18` are declared but unconfigured (see
 *  `docs/discord-notifications-wiring.md`'s own cutover note for the committee pair's history). */
export interface DiscordBindingEnv {
  DISCORD_WEBHOOK_ASSETS?: string;
  DISCORD_WEBHOOK_CLASSES?: string;
  DISCORD_WEBHOOK_LEADERSHIP?: string;
  DISCORD_WEBHOOK_GENERAL?: string;
  DISCORD_WEBHOOK_SITE?: string;
  DISCORD_WEBHOOK_FLEET?: string;
  DISCORD_WEBHOOK_EDUCATION?: string;
  DISCORD_WEBHOOK_RACING?: string;
  DISCORD_WEBHOOK_BUCCANEER_18?: string;
  DISCORD_WEBHOOK_HARBOR?: string;
  DISCORD_WEBHOOK_TECHNOLOGY?: string;
}

/** Every channel a notification can target, and so which of `DiscordBindingEnv`'s webhook
 *  secrets `notifyDiscord` reads for it: the two committee inboxes (`assets`, `classes`) plus
 *  the nine-channel Announce vocabulary (see this module's header). */
export type DiscordChannel =
  | 'assets'
  | 'classes'
  | 'leadership'
  | 'general'
  | 'site'
  | 'fleet'
  | 'education'
  | 'racing'
  | 'buccaneer-18'
  | 'harbor'
  | 'technology';

/** Every `DiscordChannel` mapped to the `DiscordBindingEnv` field that carries its webhook URL,
 *  the one place the channel vocabulary and the secret names are tied together. */
const CHANNEL_ENV_KEY: Record<DiscordChannel, keyof DiscordBindingEnv> = {
  assets: 'DISCORD_WEBHOOK_ASSETS',
  classes: 'DISCORD_WEBHOOK_CLASSES',
  leadership: 'DISCORD_WEBHOOK_LEADERSHIP',
  general: 'DISCORD_WEBHOOK_GENERAL',
  site: 'DISCORD_WEBHOOK_SITE',
  fleet: 'DISCORD_WEBHOOK_FLEET',
  education: 'DISCORD_WEBHOOK_EDUCATION',
  racing: 'DISCORD_WEBHOOK_RACING',
  'buccaneer-18': 'DISCORD_WEBHOOK_BUCCANEER_18',
  harbor: 'DISCORD_WEBHOOK_HARBOR',
  technology: 'DISCORD_WEBHOOK_TECHNOLOGY',
};

/** The Announce screen's own channel vocabulary, in the order its `<select>` lists them.
 *  `leadership` is first: the screen's default target, even though (as of this writing) it has
 *  no webhook configured, so the gap is visible rather than silently skipped. */
export const ANNOUNCE_CHANNELS: readonly DiscordChannel[] = [
  'leadership',
  'general',
  'site',
  'fleet',
  'education',
  'racing',
  'buccaneer-18',
  'harbor',
  'technology',
];

/** Display labels for the Announce vocabulary, keyed the same as `ANNOUNCE_CHANNELS`. */
export const ANNOUNCE_CHANNEL_LABEL: Record<string, string> = {
  leadership: 'Leadership',
  general: 'General',
  site: 'Site',
  fleet: 'Fleet',
  education: 'Education',
  racing: 'Racing',
  'buccaneer-18': 'Buccaneer 18',
  harbor: 'Harbor',
  technology: 'Technology',
};

/** The Announce screen's own default channel selection. */
export const DEFAULT_ANNOUNCE_CHANNEL: DiscordChannel = 'leadership';

/** One named, real event this module has a builder for. Drives the embed's color (the
 *  `EMBED_COLORS` map below), kept as its own tag rather than inferred from a notification's
 *  free-text title so the color assignment survives a copy-edited title. */
export type DiscordEventType =
  | 'payment_request'
  | 'asset_request'
  | 'waitlist_signup'
  | 'offer_sent'
  | 'class_filled'
  | 'story_published';

/** One row of a Discord embed's `fields` array: a label and its value, rendered side by side in
 *  the Discord client. */
export interface DiscordEmbedField {
  name: string;
  value: string;
}

/** The shape every builder below returns and `notifyDiscord` accepts: which channel, the
 *  embed's title, its tidy fields, and the event type the color lookup keys on. `description`
 *  and `url` are optional (only `buildStoryNotice` sets them today): a short embed body and a
 *  clickable title, the shape a channel ping wants that the five committee-event builders above
 *  never needed. */
export interface DiscordNotification {
  channel: DiscordChannel;
  eventType: DiscordEventType;
  title: string;
  description?: string;
  url?: string;
  fields: DiscordEmbedField[];
}

/** One color per event type, the one place this module's embed formatting lives (this function's
 *  own header). Warm for a money ask, cool for a heads-up, green for a milestone: loosely
 *  Discord's own default embed palette, not a club design token (an embed has no theme to read
 *  one from). */
const EMBED_COLORS: Record<DiscordEventType, number> = {
  payment_request: 0xe67e22, // orange: action needed, money
  asset_request: 0x3498db, // blue: needs committee review
  waitlist_signup: 0x1abc9c, // teal: a heads-up, no action required
  offer_sent: 0x9b59b6, // purple: a spot changed hands
  class_filled: 0x2ecc71, // green: a milestone, not an ask
  story_published: 0x1c4670, // flag navy: the site's own link color, a plain heads-up
};

function webhookUrl(env: DiscordBindingEnv, channel: DiscordChannel): string | undefined {
  return env[CHANNEL_ENV_KEY[channel]];
}

/** Whether `channel`'s own webhook secret is set on `env`: the Announce screen's own "not
 *  configured" note reads this per option, and its default-channel fallback reads it to find the
 *  first real, sendable channel when `leadership` itself has none. */
export function isDiscordChannelConfigured(env: DiscordBindingEnv, channel: DiscordChannel): boolean {
  return Boolean(webhookUrl(env, channel));
}

/**
 * Post one notification as a Discord webhook embed. Best-effort and never throws: a webhook
 * failure (an unbound secret, a network error, a non-2xx response) is logged and swallowed, the
 * same tradeoff `sendClubEmail` and `offerSpot`'s own notification call make, since a
 * notification must never break the admin action or public write that triggered it. Degrades
 * silently when the channel's own webhook secret is not configured: no fetch is attempted, and
 * the only trace is the logged warning below (there is no `env.EMAIL`-style structured failure
 * result to return, since this module writes no row a caller could read one back from).
 */
export async function notifyDiscord(env: DiscordBindingEnv, notification: DiscordNotification): Promise<void> {
  const url = webhookUrl(env, notification.channel);
  if (!url) {
    console.warn(`admin/club: Discord webhook not configured for channel "${notification.channel}"; "${notification.title}" not sent`);
    return;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: notification.title,
            description: notification.description,
            url: notification.url,
            color: EMBED_COLORS[notification.eventType],
            fields: notification.fields,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error(`admin/club: Discord webhook responded ${response.status} for "${notification.title}"`);
    }
  } catch (err) {
    console.error('admin/club: Discord webhook POST failed', err);
  }
}

// -- Notification builders --------------------------------------------------------------------
//
// One builder per real event named in the ops parity audit and the auto-email principle's own
// send inventory (docs/2026-07-07-requirements-adversarial-review.md). Each is a pure function
// (no D1, no fetch): it shapes a `DiscordNotification` from plain args a call site already has
// in hand after its own write succeeds, and never resolves anything itself, matching this
// module's "no import from the hot library files" constraint.

/** An approved asset request's "pay to confirm" ask went out to the member (the payment build's
 *  own send; see the auto-email inventory's "Approved-asset 'pay to confirm'" row). `dueBy` is
 *  the payment window's own deadline, already formatted by the caller (this module has no date
 *  formatter of its own; mirrors `offerSpot`'s own caller-formats-first convention with
 *  `formatClubTimestamp`). */
export function buildPaymentRequestNotice(args: {
  memberName: string;
  assetTypeName: string;
  amount: string;
  dueBy: string;
}): DiscordNotification {
  return {
    channel: 'assets',
    eventType: 'payment_request',
    title: `Payment request sent: ${args.assetTypeName}`,
    fields: [
      { name: 'Member', value: args.memberName },
      { name: 'Amount', value: args.amount },
      { name: 'Due by', value: args.dueBy },
    ],
  };
}

/** A member submitted a new asset request (an RV spot, mooring, parking) awaiting committee
 *  review. `notes` is the member's own free-text note, if they left one. */
export function buildAssetRequestSubmittedNotice(args: {
  memberName: string;
  assetTypeName: string;
  notes?: string | null;
}): DiscordNotification {
  const fields: DiscordEmbedField[] = [
    { name: 'Member', value: args.memberName },
    { name: 'Asset type', value: args.assetTypeName },
  ];
  if (args.notes) fields.push({ name: 'Notes', value: args.notes });
  return {
    channel: 'assets',
    eventType: 'asset_request',
    title: 'New asset request: needs review',
    fields,
  };
}

/** A public signup landed on a full class's waitlist (`signUpForClass`'s own `'waitlisted'`
 *  outcome). */
export function buildWaitlistSignupNotice(args: {
  className: string;
  applicantName: string;
  position: number;
}): DiscordNotification {
  return {
    channel: 'classes',
    eventType: 'waitlist_signup',
    title: `New waitlist signup: ${args.className}`,
    fields: [
      { name: 'Name', value: args.applicantName },
      { name: 'Position', value: String(args.position) },
    ],
  };
}

/** A freed spot was offered to one waitlist entry (`offerSpot`, whether admin-triggered today or
 *  the auto-offer chain once it lands, per the adversarial review's own "unparked" note; both
 *  paths call the same function and so the same call site). */
export function buildOfferSentNotice(args: {
  className: string;
  applicantName: string;
  expiresAt: string;
}): DiscordNotification {
  return {
    channel: 'classes',
    eventType: 'offer_sent',
    title: `Offer sent: ${args.className}`,
    fields: [
      { name: 'Offered to', value: args.applicantName },
      { name: 'Expires', value: args.expiresAt },
    ],
  };
}

/** A signup filled the last open spot in a class (`signUpForClass`'s own `'enrolled'` outcome,
 *  when the enrollment that just landed brought the class to capacity). */
export function buildClassFilledNotice(args: { className: string; capacity: number }): DiscordNotification {
  return {
    channel: 'classes',
    eventType: 'class_filled',
    title: `Class filled: ${args.className}`,
    fields: [{ name: 'Capacity', value: String(args.capacity) }],
  };
}

/** A channel ping is short by design, not a newsletter: Discord's own embed `description` hard
 *  caps at 4096 characters, but this module's own target is far tighter, a glance-length teaser
 *  someone reads in a chat scrollback. `maxChars` defaults to that deliberately short target. */
export const STORY_DESCRIPTION_MAX_CHARS = 280;

/** Trim `text` to at most `maxChars`, cutting at the last whitespace boundary and appending an
 *  ellipsis when it would otherwise run over. The same word-boundary idiom
 *  `content/excerpt.ts`'s own `deriveExcerpt` uses, reimplemented here rather than imported: that
 *  helper strips markdown out of a raw post body, while this module's input is already the
 *  author's own edited, plain-text summary. */
export function truncateForEmbed(text: string, maxChars = STORY_DESCRIPTION_MAX_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * A published post's own Discord channel ping (the Announce screen, pass "announce"): the
 * embed's title links to the live post (`url`), and `message` (the author's edited summary,
 * shared with the email send's own body -- see `announcements.ts`'s
 * `buildAnnouncementEmailContent`, this function's sibling render) is truncated to a tight embed
 * description, never the full text a newsletter would carry. `channel` is caller-supplied rather
 * than fixed (unlike every builder above): the Announce screen lets an admin pick from the
 * nine-channel vocabulary, so there is no one right channel this function could hardcode.
 */
export function buildStoryNotice(args: { channel: DiscordChannel; title: string; message: string; url: string }): DiscordNotification {
  return {
    channel: args.channel,
    eventType: 'story_published',
    title: args.title,
    description: truncateForEmbed(args.message),
    url: args.url,
    fields: [],
  };
}
