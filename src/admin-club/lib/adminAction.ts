// LOCAL STAND-IN for Part C's future engine seam (admin-scoped server helpers, item 3 of
// docs/superpowers/specs/2026-07-06-asc-phase-2-design-suite.md's Part C): "an adminAction
// wrapper (verifies CSRF + editor, exposes a typed audit emit)." Part C replaces this with the
// engine import once cairn ships it.
//
// One correction this stand-in surfaces for that spec line: CSRF is already covered today, not a
// genuine gap. The engine's `createAuthGuard()` (wired in every cairn site's hooks.server.ts)
// validates the double-submit token for every unsafe POST under /admin/**, custom Club routes
// included, before any route's own load or action runs (@glw907/cairn-cms's guard.ts). A Club
// action that renders `<CsrfField />` and posts through the ordinary admin form path is already
// CSRF-safe with no extra call here. The real remaining gap this stub fills is narrower than the
// spec phrasing: the editor-identity convenience, and a typed audit emit cairn has no hook for
// yet.
import { requireOwner, requireSession } from '@glw907/cairn-cms/sveltekit';
import type { Editor } from '@glw907/cairn-cms';

/** The minimal event shape every admin load or action already carries. */
interface AdminActionEvent {
  locals: { editor?: Editor | null };
}

/** One audit-log row this stand-in produces. Part C's engine hook is expected to persist a shape
 *  close to this one; this stub only builds the record, since cairn has nowhere durable to put it
 *  yet (see `audit` below). */
export interface ClubAuditEntry {
  actor: string;
  action: string;
  detail?: Record<string, unknown>;
  at: number;
}

/** What `adminAction` hands back: the signed-in editor, and an `audit` emitter closed over it. */
export interface ClubAdminAction {
  editor: Editor;
  audit: (action: string, detail?: Record<string, unknown>) => ClubAuditEntry;
}

/**
 * The signed-in editor plus a bound `audit` emitter, or a thrown redirect/403 from the same
 * `requireSession`/`requireOwner` gate a hand-written action would call directly. Pass
 * `ownerOnly: true` for a destructive Club action (a season rollover, a delete); every other call
 * defaults to any signed-in editor, matching the guide's `requireSession`/`requireOwner` split.
 */
export function adminAction(
  event: AdminActionEvent,
  opts: { ownerOnly?: boolean } = {},
): ClubAdminAction {
  const editor = opts.ownerOnly ? requireOwner(event) : requireSession(event);
  return {
    editor,
    audit(action, detail) {
      const entry: ClubAuditEntry = { actor: editor.email, action, detail, at: Date.now() };
      // Part C's engine audit hook replaces this line. Today the record has nowhere durable to
      // land, so a Club action that calls `audit()` logs it rather than dropping it silently.
      console.info('club.audit', entry);
      return entry;
    },
  };
}
