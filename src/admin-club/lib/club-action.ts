// The Club section's own action wrapper (pass 2.1 Task 6, rider 1): every `/admin/club/**`
// write needs the club-role precondition, not just the section's layout guard, because
// SvelteKit dispatches a matched form action directly and never re-runs an ancestor layout's
// `load` first (traced in club-roles.ts's `hasAnyClubRole` comment). Tasks 4/5 each hand-rolled
// the same three lines (resolve `CLUB_DB`, check the role, `fail` cleanly) at the top of every
// action; this is the one place that check lives now, so a new screen cannot forget it.
import { fail } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import { adminAction } from '@glw907/cairn-cms/sveltekit';
import type { AdminActionContext, AdminActionEvent } from '@glw907/cairn-cms/sveltekit';
import { getClubRole, resolveClubDb, type ClubRole } from './club-roles';

/** What a `clubAdminAction` handler receives: the engine's own verified `editor`/`audit`, plus
 *  the resolved `CLUB_DB` handle and the acting editor's own club role, both already checked by
 *  the wrapper so no handler re-resolves either. */
export interface ClubActionContext extends AdminActionContext {
  db: D1Database;
  clubRole: ClubRole;
}

export interface ClubActionOptions {
  /** Require the 'owner' seat rather than any club role (owner or admin). Defaults to false,
   *  the routine-domain gate Task 5's events and this task's classes both use; Settings' own
   *  role-management and offer-window writes are the owner-only case. */
  ownerOnly?: boolean;
  /** The audit action verb this call site's successful path uses, reused for a guard
   *  rejection (a missing `CLUB_DB` binding or an insufficient role) so a refused attempt reads
   *  the same in the audit log as the write it was refused from. */
  action: string;
  /** The audit entity this call site's successful path uses, reused the same way. */
  entity: string;
  /** The `fail(403)` message shown when the role check refuses. Defaults to a generic message
   *  per `ownerOnly`; a call site names its own domain ("...to manage events") for a clearer
   *  refusal than the generic default. */
  deniedMessage?: string;
}

/**
 * Compose the engine's `adminAction` with the Club section's own role precondition. In order:
 *
 * 1. `adminAction` itself resolves the editor, verifies CSRF, and reads the form once (see its
 *    own doc comment).
 * 2. `CLUB_DB` must resolve off `event.platform.env`, or the action fails closed (500) with an
 *    audited rejection: a missing binding is a deployment misconfiguration, not a normal denial.
 * 3. The acting editor's club role must satisfy `opts.ownerOnly` (owner only) or else be any
 *    granted role (owner or admin); a role that does not fails closed (403), also audited.
 * 4. The handler runs with `ctx` extended by the resolved `db` and `clubRole`, so it never
 *    re-resolves either.
 */
export function clubAdminAction<T>(
  handler: (args: { event: AdminActionEvent; form: FormData; ctx: ClubActionContext }) => Promise<T>,
  opts: ClubActionOptions,
) {
  const deniedMessage = opts.deniedMessage ?? (opts.ownerOnly ? 'Only a club owner can do this.' : 'A club role is required.');

  return adminAction(async ({ event, form, ctx }) => {
    const db = resolveClubDb(event.platform?.env);
    if (!db) {
      ctx.audit({ action: opts.action, entity: opts.entity, detail: 'rejected: CLUB_DB not bound' });
      return fail(500, { error: 'CLUB_DB is not bound.' });
    }
    const clubRole = await getClubRole(db, ctx.editor.email);
    // Written as one `||` so TypeScript narrows `clubRole` past the `null` arm for every line
    // below: after this returns, `clubRole === null` is false, and if `opts.ownerOnly` then
    // `clubRole === 'owner'` too, exactly what `ClubActionContext.clubRole` promises a handler.
    if (clubRole === null || (opts.ownerOnly && clubRole !== 'owner')) {
      ctx.audit({
        action: opts.action,
        entity: opts.entity,
        detail: opts.ownerOnly ? 'rejected: not owner' : 'rejected: no club role',
      });
      return fail(403, { error: deniedMessage });
    }
    return handler({ event, form, ctx: { ...ctx, db, clubRole } });
  });
}
