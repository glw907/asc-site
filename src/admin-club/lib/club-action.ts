// The Club section's own action wrapper (pass 2.1 Task 6, rider 1): every `/admin/club/**`
// write needs the club-role precondition, not just the section's layout guard, because
// SvelteKit dispatches a matched form action directly and never re-runs an ancestor layout's
// `load` first. Tasks 4/5 each hand-rolled the same three lines (resolve `CLUB_DB`, check the
// role, `fail` cleanly) at the top of every action; this is the one place that check lives now,
// so a new screen cannot forget it.
// The roles-adoption pass's T4 (docs/2026-07-19-asc-roles-adoption.md): the role decision reads
// the site's `access` map via `canReach`, not the hardcoded `CLUB_ROLES` array — this wrapper
// COMPOSES `canReach` rather than collapsing onto the engine's own `requireAccess`, because it
// carries responsibilities `requireAccess` has no notion of (the `CLUB_DB` binding resolution,
// the per-editor admin rate-limit below, an audited denial, and injecting the resolved `db` into
// the handler `ctx`) and runs inside a form action (POST), not a load. Reading the map here means
// a POST to `/admin/club/email/*` or `/admin/club/announce/*` admits Publisher through the map's
// deeper keys with no bespoke per-action role list, while every other club POST stays
// Administrator/Club manager through the `/admin/club` section default — the same enforcement the
// layout guard's `requireAccess` call now performs for loads.
import { fail } from '@sveltejs/kit';
import type { D1Database, RateLimit } from '@cloudflare/workers-types';
import { adminAction } from '@glw907/cairn-cms/sveltekit';
import type { AdminActionContext, AdminActionEvent } from '@glw907/cairn-cms/sveltekit';
import { canReach, type AccessMap } from '@glw907/cairn-cms';
import { resolveClubDb } from './club-db';
import { checkRateLimit, RATE_LIMIT_MESSAGE } from '$theme/rate-limit';

/** The narrow, explained bridge this module uses to read the site's own `RATE_LIMIT_ADMIN`
 *  binding off a platform env, matching `resolveClubDb`'s own precedent one field below: the
 *  engine types `AdminActionEvent.platform.env` by its own narrow `AuthEnv`, so a site-only
 *  binding is never expressible on it without a cast. */
function resolveAdminRateLimit(env: unknown): RateLimit | undefined {
  return (env as { RATE_LIMIT_ADMIN?: RateLimit } | undefined)?.RATE_LIMIT_ADMIN;
}

/** The same narrow-bridge pattern as `resolveAdminRateLimit`, for `locals.cairnAccess`:
 *  `AdminActionEvent.locals` is typed to `adminAction`'s own minimal need (`editor`/`auditSink`),
 *  not the guard's full `EventBase.locals`, so the map the guard actually attaches at
 *  `locals.cairnAccess` (`hooks.server.ts`) is never expressible on it without a cast. */
function resolveCairnAccess(locals: unknown): AccessMap | undefined {
  return (locals as { cairnAccess?: AccessMap } | undefined)?.cairnAccess;
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
 * 3. The acting editor must be admitted by the site's `access` map for this request's path
 *    (`canReach(resolveCairnAccess(event.locals), ctx.editor, event.url.pathname)` — the same map the
 *    layout guard's `requireAccess` reads for loads, so a POST and its section's load can never
 *    disagree); `opts.ownerOnly` additionally requires owner CAPABILITY
 *    (`ctx.editor.capability === 'owner'`), the design's distinction between "may act in this
 *    section" and "may act as its owner", and stacks on top of the `canReach` check rather than
 *    replacing it. Either failure fails closed (403), audited.
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
    const hasClubRole = canReach(resolveCairnAccess(event.locals), ctx.editor, event.url.pathname);
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
