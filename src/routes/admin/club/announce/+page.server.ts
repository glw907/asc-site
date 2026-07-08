// The Announce screen's list (`/admin/club/announce`): the site's own recently published posts
// (`$chassis/content`'s own `posts` index, the same content the public site serves, never a
// CLUB_DB table), newest first, each row showing whether it has already been announced. Reads
// `announcements` (migrations/asc-club/0017) only for that "Announced" marker; the announce
// action itself lives on the `[id]` detail route.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { latestAnnouncementByPost, listAnnouncements, type AnnouncementRow } from '$admin-club/lib/announcements';
import { posts } from '$chassis/content';

/** How many recent posts the list shows: enough to cover "did I already announce this" for
 *  everything an editor would plausibly still be thinking about, without loading the whole
 *  archive. */
const RECENT_POST_LIMIT = 15;

export interface AnnounceListRow {
  id: string;
  title: string;
  date?: string;
  announced: Pick<AnnouncementRow, 'createdAt' | 'emailCount' | 'discordChannel'> | null;
}

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const recent = posts.all().slice(0, RECENT_POST_LIMIT);

  const db = resolveClubDb(event.platform?.env);
  const latestByPost = db ? latestAnnouncementByPost(await listAnnouncements(db)) : new Map<string, AnnouncementRow>();

  const rows: AnnounceListRow[] = recent.map((post) => {
    const announcement = latestByPost.get(post.id);
    return {
      id: post.id,
      title: post.title,
      date: post.date,
      announced: announcement
        ? { createdAt: announcement.createdAt, emailCount: announcement.emailCount, discordChannel: announcement.discordChannel }
        : null,
    };
  });

  return { posts: rows, error: db ? null : 'CLUB_DB is not bound.' };
};
