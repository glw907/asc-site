// The Announce screen's form (`/admin/club/announce/<postId>`): send this published post to
// every current member's email and/or a Discord channel, in one deliberate step. A miss on `id`
// (or a draft post's own id, which should never reach here from the list but is checked anyway)
// answers an honest `post: null` rather than a thrown `error(404)` -- the same reasoning
// `events/[id]/+page.server.ts`'s own header gives: a thrown SvelteKit error would rebuild the
// public site's chrome, not the admin shell.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { clubAdminAction } from '$admin-club/lib/club-action';
import {
  announceChannelOptions,
  currentMemberEmails,
  defaultAnnounceChannel,
  deriveAnnouncementSummary,
  latestAnnouncementByPost,
  listAnnouncements,
  recordAnnouncement,
  sendAnnouncementEmails,
  type AnnouncementRow,
} from '$admin-club/lib/announcements';
import { ANNOUNCE_CHANNELS, buildStoryNotice, notifyDiscord, type DiscordBindingEnv, type DiscordChannel } from '$admin-club/lib/discord';
import type { EmailBindingEnv } from '$admin-club/lib/club-email';
import { posts, ORIGIN } from '$chassis/content';

/** `AdminActionEvent`'s own type is narrowed to what `adminAction` itself needs, the same
 *  explained cast `events/[id]/+page.server.ts`'s own `routeId` uses; the real underlying
 *  `RequestEvent` this dynamic route dispatches always carries `params.id`. */
function routeId(event: unknown): string {
  return (event as { params: { id: string } }).params.id;
}

export interface AnnouncePost {
  id: string;
  title: string;
  /** The form's own "Summary" field prefill (`deriveAnnouncementSummary`'s own priority: an
   *  explicit `description` frontmatter verbatim, else a sentence-aware trim of the whole
   *  flattened body). Pre-populated editable text, not a placeholder: this value is exactly what
   *  the form's textarea shows and what sends unless the author edits it. */
  summary: string;
  url: string;
}

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const id = routeId(event);
  const entry = posts.byId(id);
  const post: AnnouncePost | null =
    entry && !entry.draft
      ? {
          id: entry.id,
          title: entry.title,
          summary: deriveAnnouncementSummary(entry.body, entry.frontmatter.description),
          url: `${ORIGIN}${entry.permalink}`,
        }
      : null;

  const db = resolveClubDb(event.platform?.env);
  const env = event.platform?.env;

  let previous: AnnouncementRow | null = null;
  if (db && post) {
    previous = latestAnnouncementByPost(await listAnnouncements(db)).get(post.id) ?? null;
  }

  return {
    post,
    previous,
    error: db ? null : 'CLUB_DB is not bound.',
    channelOptions: announceChannelOptions(env ?? {}),
    defaultChannel: defaultAnnounceChannel(env ?? {}),
  };
};

const DENIED_MESSAGE = 'A club role is required to announce a post.';

export const actions: Actions = {
  send: clubAdminAction(
    async ({ event, form, ctx }) => {
      const id = routeId(event);
      const entry = posts.byId(id);
      if (!entry || entry.draft) {
        ctx.audit({ action: 'announce', entity: 'post', entityId: id, detail: 'rejected: no such published post' });
        return fail(404, { error: 'No such published post.' });
      }

      const message = String(form.get('message') ?? '').trim();
      const subject = String(form.get('subject') ?? '').trim() || entry.title;
      const emailAll = form.get('emailAll') === 'on';
      const notifyDiscordFlag = form.get('notifyDiscord') === 'on';
      const channelRaw = String(form.get('discordChannel') ?? '');
      const channel: DiscordChannel | null = (ANNOUNCE_CHANNELS as readonly string[]).includes(channelRaw)
        ? (channelRaw as DiscordChannel)
        : null;

      if (!message) {
        ctx.audit({ action: 'announce', entity: 'post', entityId: id, detail: 'rejected: empty summary' });
        return fail(400, { error: 'Write a summary before sending.' });
      }
      if (!emailAll && !notifyDiscordFlag) {
        ctx.audit({ action: 'announce', entity: 'post', entityId: id, detail: 'rejected: no channel selected' });
        return fail(400, { error: 'Select email, Discord, or both.' });
      }
      if (notifyDiscordFlag && !channel) {
        ctx.audit({ action: 'announce', entity: 'post', entityId: id, detail: 'rejected: no Discord channel chosen' });
        return fail(400, { error: 'Choose a Discord channel.' });
      }

      const url = `${ORIGIN}${entry.permalink}`;
      // `event.platform?.env` types as the engine's own narrow `AuthEnv` here (`AdminActionEvent`
      // extends `EventBase<AuthEnv>`), which shares no property names with either
      // `EmailBindingEnv` or `DiscordBindingEnv` and so trips TypeScript's weak-type detection
      // ("has no properties in common") if passed to either as-is. The real runtime object always
      // carries the full `Platform.env` intersection (`app.d.ts`) regardless of this narrower
      // type, so widening the local binding to the two structural shapes this action actually
      // calls is a narrow, explained cast, the same fix `offers.ts`'s own `notify.env` uses.
      const env = (event.platform?.env ?? {}) as EmailBindingEnv & DiscordBindingEnv;

      let emailCount = 0;
      if (emailAll) {
        const recipients = await currentMemberEmails(ctx.db);
        const result = await sendAnnouncementEmails(ctx.db, env, { postId: id, subject, message, url, recipients });
        emailCount = result.sentCount;
      }

      if (notifyDiscordFlag && channel) {
        await notifyDiscord(env, buildStoryNotice({ channel, title: entry.title, message, url }));
      }

      const discordChannel = notifyDiscordFlag ? channel : null;
      await recordAnnouncement(ctx.db, {
        postId: id,
        postTitle: entry.title,
        emailed: emailAll,
        emailCount,
        discordChannel,
        actor: ctx.editor.email,
      });

      ctx.audit({
        action: 'announce',
        entity: 'post',
        entityId: id,
        detail: `emailed ${emailCount} member(s)${discordChannel ? `, discord #${discordChannel}` : ''}`,
      });

      return { ok: true as const, emailCount, discordChannel };
    },
    { action: 'announce', entity: 'post', deniedMessage: DENIED_MESSAGE },
  ),
};
