// The Club section's email domain (pass 2.2's email port): reads/writes `email_templates` and
// `email_log`, and `sendClubEmail`, the one send path every future consumer (segment sends in
// 2.3, the offer notification wired this pass) is meant to share. Templates are plain markdown
// with `{{variable}}` placeholders (`scripts/import/ops-email-templates.mjs`'s own header proves
// this against ops's real rendering code, nothing Resend-specific survived the port), rendered
// here with the same two small, dependency-free steps ops itself used: a mustache-lite variable
// substitution, then a deliberately minimal markdown-to-HTML pass (bold, `---` rules, paragraph
// breaks) -- ported in spirit from `~/Projects/aksailingclub-legacy/shared/{template,markdown}.js`,
// not the site's own `renderMarkdown` (the directive-registry pipeline `cairn.config.ts` builds
// for PUBLIC CONTENT pages, which needs `resolve`/`resolveMedia` callbacks an email has no use
// for and no content-directive vocabulary of its own to render).
//
// `@glw907/cairn-cms` exports the Cloudflare Email Sending TYPES (`AuthBranding`,
// `MagicLinkMessage`) from its root but not the `cloudflareSend` FUNCTION or its `escapeHtml`
// helper (neither is a public export subpath); this module reads `env.EMAIL.send(...)` directly,
// the same durable shape CLAUDE.md's own "Cloudflare email" note documents, rather than reaching
// into engine internals for a function it cannot import anyway.
import type { D1Database } from '@cloudflare/workers-types';

/** The Cloudflare Email Sending binding shape this module needs: a structural subset of
 *  `CairnPlatformBindings['EMAIL']`, read loosely (optional) rather than trusting that type's own
 *  `NonNullable` promise, because that promise is a compile-time guard against a site forgetting
 *  to WIRE the binding, not a guarantee it is present at runtime (see that type's own doc comment:
 *  a missing binding still surfaces as `config.bindings-missing` in practice). Mirrors
 *  `resolveClubDb`'s own reasoning for the same kind of gap between a type and the real runtime
 *  object. */
export interface EmailBindingEnv {
  EMAIL?: {
    send(message: { to: string; from: string; subject: string; html: string; text: string }): Promise<void>;
  };
}

const FROM_ADDRESS = 'Alaska Sailing Club <noreply@aksailingclub.org>';

/** One `email_templates` row, camelCased. */
export interface EmailTemplateRow {
  id: string;
  subject: string;
  replyTo: string | null;
  body: string;
  updatedAt: string;
  updatedBy: string;
}

interface EmailTemplateRawRow {
  id: string;
  subject: string;
  reply_to: string | null;
  body: string;
  updated_at: string;
  updated_by: string;
}

function toTemplateRow(row: EmailTemplateRawRow): EmailTemplateRow {
  return { id: row.id, subject: row.subject, replyTo: row.reply_to, body: row.body, updatedAt: row.updated_at, updatedBy: row.updated_by };
}

/** Every template, alphabetical by id: the Email screen's own list. */
export async function listEmailTemplates(db: D1Database): Promise<EmailTemplateRow[]> {
  const { results } = await db
    .prepare('SELECT id, subject, reply_to, body, updated_at, updated_by FROM email_templates ORDER BY id')
    .all<EmailTemplateRawRow>();
  return results.map(toTemplateRow);
}

/** One template by id, or `null`: the detail screen's own read, and `sendClubEmail`'s own
 *  `templateId` resolution. */
export async function getEmailTemplate(db: D1Database, id: string): Promise<EmailTemplateRow | null> {
  const row = await db
    .prepare('SELECT id, subject, reply_to, body, updated_at, updated_by FROM email_templates WHERE id = ?1')
    .bind(id)
    .first<EmailTemplateRawRow>();
  return row ? toTemplateRow(row) : null;
}

/** One `email_log` row, camelCased. */
export interface EmailLogRow {
  id: string;
  templateId: string | null;
  segment: string | null;
  recipient: string;
  subject: string;
  status: 'sent' | 'failed';
  errorDetail: string | null;
  sentAt: string;
}

interface EmailLogRawRow {
  id: string;
  template_id: string | null;
  segment: string | null;
  recipient: string;
  subject: string;
  status: string;
  error_detail: string | null;
  sent_at: string;
}

function toLogRow(row: EmailLogRawRow): EmailLogRow {
  return {
    id: row.id,
    templateId: row.template_id,
    segment: row.segment,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status === 'failed' ? 'failed' : 'sent',
    errorDetail: row.error_detail,
    sentAt: row.sent_at,
  };
}

/** The most recent sends, newest first: the Email screen's own send-log list. Empty today (no
 *  consumer has sent through this module in production yet); the offer notification wired this
 *  pass is its first real writer. */
export async function listEmailLog(db: D1Database, limit = 100): Promise<EmailLogRow[]> {
  const { results } = await db
    .prepare('SELECT id, template_id, segment, recipient, subject, status, error_detail, sent_at FROM email_log ORDER BY sent_at DESC LIMIT ?1')
    .bind(limit)
    .all<EmailLogRawRow>();
  return results.map(toLogRow);
}

/** Substitute `{{key}}` placeholders with `vars[key]`, leaving an unresolved key as-is (ported
 *  from ops's own `shared/template.js`; this port has no need for that function's dot-notation
 *  nesting, since every call site here passes a flat `Record<string, string>`). */
function renderVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

/** Escape the five HTML-significant characters before any markdown formatting is applied, so a
 *  variable's own value (a person's name, a free-text note) can never inject markup into the sent
 *  message. Mirrors the engine's own internal `escapeHtml` (not a public export, see this module's
 *  header), reimplemented rather than imported. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A deliberately minimal markdown-to-HTML pass, ported from ops's own `shared/markdown.js`:
 *  `**bold**`, a bare `---` line as `<hr>`, a blank line as a paragraph break, a single newline as
 *  `<br>`. Every stored template body uses only these (see `ops-email-templates.README.md`'s own
 *  "nothing to adapt" section); a v1 send helper has no need for the site's own directive-registry
 *  renderer (this module's header explains why). */
function markdownToHtml(md: string): string {
  return escapeHtml(md)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .split(/\n\n+/)
    .map((para) => para.trim())
    .filter((para) => para.length > 0)
    .map((para) => (para === '---' ? '<hr>' : `<p>${para.replace(/\n/g, '<br>')}</p>`))
    .join('\n');
}

/** The Email detail screen's own read-only preview render (`email/[id]`): the stored body as
 *  authored, structurally rendered with NO variable substitution (there is no real recipient or
 *  send context to substitute with on a static preview screen), so a `{{placeholder}}` shows
 *  literally rather than silently vanishing or throwing. A thin, exported wrapper around this
 *  module's own send-time renderer, kept as one function so the preview can never structurally
 *  drift from what a real send actually produces. */
export function renderTemplatePreviewHtml(body: string): string {
  return markdownToHtml(body);
}

/** One rendered template, ready to send or to preview. */
export interface RenderedTemplate {
  subject: string;
  /** The rendered markdown, pre-HTML: the plaintext send body. */
  text: string;
  html: string;
}

/**
 * Render a subject/body pair against `vars` through the exact two steps `sendClubEmail` itself
 * runs (`renderVariables`, then `markdownToHtml`), exported so the email edit screen's own
 * sample-data preview calls the identical code path a real send does rather than a parallel
 * reimplementation that could drift from it. `sendClubEmail` below calls this same function
 * rather than duplicating its steps; a draft subject/body pair (not yet saved) works exactly the
 * same as a stored template's, so the edit screen can preview unsaved changes too.
 */
export function renderTemplateWithVariables(subject: string, body: string, vars: Record<string, string>): RenderedTemplate {
  const renderedSubject = renderVariables(subject, vars);
  const text = renderVariables(body, vars);
  return { subject: renderedSubject, text, html: markdownToHtml(text) };
}

/** Write one `email_log` row for a send attempt, whatever its outcome. Logged unconditionally
 *  (including a missing-binding refusal): the row records "we tried to notify X about Y", which is
 *  useful history independent of whether the binding happened to be wired at the time. */
async function writeEmailLog(
  db: D1Database,
  args: { templateId: string | null; segment: string | null; recipient: string; subject: string; status: 'sent' | 'failed'; errorDetail: string | null },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO email_log (id, template_id, segment, recipient, subject, status, error_detail)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(crypto.randomUUID(), args.templateId, args.segment, args.recipient, args.subject, args.status, args.errorDetail)
    .run();
}

/** `sendClubEmail`'s outcome: mirrors this module's other typed-result functions (never throws
 *  for an ordinary send failure, since a failed notification should never fail the admin action
 *  that triggered it -- see `offers.ts`'s own consumer for why). */
export type SendClubEmailResult = { ok: true } | { ok: false; error: string };

export interface SendClubEmailArgs {
  to: string;
  /** Render from a stored template by id (the common case: every named consumer this pass has).
   *  Exactly one of `templateId`/`raw` is required; `raw` exists for a future one-off send with no
   *  stored template behind it (no consumer this pass needs it, but the shape costs nothing to
   *  support now rather than re-deriving it later). */
  templateId?: string;
  raw?: { subject: string; body: string; replyTo?: string | null };
  vars: Record<string, string>;
  /** The batch this send belongs to (`'current'`, `'lapsed'`, `'class:<id>'`), or `null` for a
   *  single, one-off send (this pass's only real caller, the offer notification). Segment sends
   *  are 2.3's own scope; this field exists on `email_log` and is threaded through now so that
   *  pass writes no new column. */
  segment?: string | null;
}

/**
 * Render a template (or the caller's own `raw` subject/body) against `vars`, send it through the
 * `EMAIL` binding, and log the attempt. Degrades gracefully when `EMAIL` is not bound (the site's
 * own docs already document CLUB_DB/TURNSTILE_SECRET_KEY/STRIPE_SECRET_KEY each degrading the same
 * way): still writes an honest `email_log` row (`status: 'failed'`, a plain error detail), still
 * returns `{ ok: false, ... }`, never throws. A send that fails at the binding itself (a
 * not-yet-onboarded sender, a delivery error) degrades the same way.
 */
export async function sendClubEmail(db: D1Database, env: EmailBindingEnv, args: SendClubEmailArgs): Promise<SendClubEmailResult> {
  const source = args.templateId ? await getEmailTemplate(db, args.templateId) : args.raw;
  if (!source) {
    const errorDetail = args.templateId ? `no such template: ${args.templateId}` : 'no template or raw content given';
    await writeEmailLog(db, {
      templateId: args.templateId ?? null,
      segment: args.segment ?? null,
      recipient: args.to,
      subject: '(unresolved)',
      status: 'failed',
      errorDetail,
    });
    return { ok: false, error: errorDetail };
  }

  const { subject, text: bodyMarkdown, html } = renderTemplateWithVariables(source.subject, source.body, args.vars);

  if (!env.EMAIL) {
    await writeEmailLog(db, {
      templateId: args.templateId ?? null,
      segment: args.segment ?? null,
      recipient: args.to,
      subject,
      status: 'failed',
      errorDetail: 'EMAIL binding is not configured',
    });
    return { ok: false, error: 'EMAIL binding is not configured' };
  }

  // A template's own `replyTo` (or `raw.replyTo`) is not threaded into this call: Cloudflare's
  // Email Sending binding (unlike Resend, ops's own transport) has no `reply_to` field in its
  // `send()` message shape (`CairnPlatformBindings['EMAIL']`'s own type; see this module's header
  // on why club-email reads that shape directly). A documented v1 limitation, not an oversight;
  // the stored `reply_to` column still carries the address forward for a future pass that wants it
  // (a raw MIME message via `cloudflare:email` could set the header, the same subsystem the
  // engine's own durable gotcha note on Email Routing documents, but that is a bigger lift than a
  // v1 send helper needs).
  try {
    await env.EMAIL.send({ to: args.to, from: FROM_ADDRESS, subject, html, text: bodyMarkdown });
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    await writeEmailLog(db, {
      templateId: args.templateId ?? null,
      segment: args.segment ?? null,
      recipient: args.to,
      subject,
      status: 'failed',
      errorDetail,
    });
    return { ok: false, error: errorDetail };
  }

  await writeEmailLog(db, {
    templateId: args.templateId ?? null,
    segment: args.segment ?? null,
    recipient: args.to,
    subject,
    status: 'sent',
    errorDetail: null,
  });
  return { ok: true };
}
