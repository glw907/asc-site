// The Club section's audit-log write side (pass 2.1 Task 6, rider 2). `adminAction`'s
// `ctx.audit` already logs every mutation structurally (`admin.action.audited`, see the engine's
// own `admin-action.ts`) and calls a site-supplied `event.locals.auditSink` if one is wired, but
// no Club route wired one through to asc-club's own `audit_log` table until now (a gap Tasks 3-5
// each carried forward rather than fixed, since it is a cross-cutting change outside any one
// screen's own files). `src/hooks.server.ts` sets `event.locals.auditSink` to this for every
// `/admin/club/**` request, so every `ctx.audit` call across the section persists a real row.
import type { D1Database } from '@cloudflare/workers-types';
import type { AdminActionAuditRecord, AdminActionAuditSink } from '@glw907/cairn-cms/sveltekit';

/** Build the Club section's `auditSink`: a fire-and-forget insert into `audit_log`. A persist
 *  failure must never fail the user's action (the write it is auditing already ran, or the
 *  action already decided its own outcome on other terms), so this only logs loudly: a broken
 *  sink is then visible in Workers Logs rather than silently dropping rows. */
export function createClubAuditSink(db: D1Database): AdminActionAuditSink {
  return (record: AdminActionAuditRecord) => {
    db.prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(record.editor, record.action, record.entity, record.entityId ?? null, record.detail ?? null)
      .run()
      .catch((err: unknown) => {
        console.error('admin/club: audit_log insert failed', err);
      });
  };
}
