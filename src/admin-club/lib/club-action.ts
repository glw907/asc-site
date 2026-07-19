// The Club section's own action wrapper (pass 2.1 Task 6, rider 1): every `/admin/club/**`
// write needs the club-role precondition, not just the section's layout guard, because
// SvelteKit dispatches a matched form action directly and never re-runs an ancestor layout's
// `load` first. Tasks 4/5 each hand-rolled the same three lines (resolve `CLUB_DB`, check the
// role, `fail` cleanly) at the top of every action; this is the one place that check lives now,
// so a new screen cannot forget it.
// Initiative 5 Task 2: the role check reads the engine's own verified session
// (`ctx.editor.role`/`ctx.editor.capability`, typed to the site's declared vocabulary via
// `CairnRolesRegister`) instead of a `club_roles` query, since cairn 0.86.0's roles seam is now
// the only role system this site carries.
import { fail } from '@sveltejs/kit';
import type { D1Database, RateLimit } from '@cloudflare/workers-types';
import { adminAction } from '@glw907/cairn-cms/sveltekit';
import type { AdminActionContext, AdminActionEvent } from '@glw907/cairn-cms/sveltekit';
import { CLUB_ROLES, resolveClubDb } from './club-db';
import { checkRateLimit, RATE_LIMIT_MESSAGE } from '$theme/rate-limit';

/** The narrow, explained bridge this module uses to read the site's own `RATE_LIMIT_ADMIN`
 *  binding off a platform env, matching `resolveClubDb`'s own precedent one field below: the
 *  engine types `AdminActionEvent.platform.env` by its own narrow `AuthEnv`, so a site-only
 *  binding is never expressible on it without a cast. */
function resolveAdminRateLimit(env: unknown): RateLimit | undefined {
  return (env as { RATE_LIMIT_ADMIN?: RateLimit } | undefined)?.RATE_LIMIT_ADMIN;
}

/** What a `clubAdminAction` handler receives: the engine's own verified `editor`/`audit`, plus
 *  the resolved `CLUB_DB` handle, already checked by the wrapper so no handler re-resolves it.
 *  A handler that needs the acting editor's role reads `ctx.editor.role`/`ctx.editor.capability`
 *  directly; both are already the wrapper-checked values by the time a handler runs. */
export interface ClubActionContext extends AdminActionContext {
  db: D1Database;
}

export interface ClubActionOptions {
  /** Require owner CAPABILITY rather than any club role (Administrator or Club manager).
   *  Defaults to false, the routine-domain gate Task 5's events and this task's classes both
   *  use; Settings' own role-management and offer-window writes are the owner-only case. */
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
 * 3. The acting editor's role, per the engine's own verified session, must be `'Administrator'`
 *    or `'Club manager'` (named roles, not capability, so a future editor-level role does not
 *    silently inherit club access); `opts.ownerOnly` additionally requires owner CAPABILITY
 *    (`ctx.editor.capability === 'owner'`), the design's distinction between "may act in this
 *    section" and "may act as its owner". Either failure fails closed (403), audited.
 * 4. The handler runs with `ctx` extended by the resolved `db`, so it never re-resolves it.
 */
export function clubAdminAction<T>(
  handler: (args: { event: AdminActionEvent; form: FormData; ctx: ClubActionContext }) => Promise<T>,
  opts: ClubActionOptions,
) {
  const deniedMessage = opts.deniedMessage ?? (opts.ownerOnly ? 'Only a club owner can do this.' : 'A club role is required.');

  return adminAction(async ({ event, form, ctx }) => {
    // Coverage table item 3 (docs/2026-07-15-payments-live-smoke-design.md section 2b): every
    // admin POST, keyed per editor email. `adminAction` has already verified `ctx.editor` by the
    // time this callback runs, so the key is available before any other work.
    if (!(await checkRateLimit(resolveAdminRateLimit(event.platform?.env), `editor:${ctx.editor.email}`))) {
      ctx.audit({ action: opts.action, entity: opts.entity, detail: 'rejected: rate limited' });
      return fail(429, { error: RATE_LIMIT_MESSAGE });
    }

    const db = resolveClubDb(event.platform?.env);
    if (!db) {
      ctx.audit({ action: opts.action, entity: opts.entity, detail: 'rejected: CLUB_DB not bound' });
      return fail(500, { error: 'CLUB_DB is not bound.' });
    }
    const hasClubRole = CLUB_ROLES.includes(ctx.editor.role);
    const satisfiesOwnerOnly = !opts.ownerOnly || ctx.editor.capability === 'owner';
    if (!hasClubRole || !satisfiesOwnerOnly) {
      ctx.audit({
        action: opts.action,
        entity: opts.entity,
        detail: opts.ownerOnly ? 'rejected: not owner' : 'rejected: no club role',
      });
      return fail(403, { error: deniedMessage });
    }
    return handler({ event, form, ctx: { ...ctx, db } });
  });
}
