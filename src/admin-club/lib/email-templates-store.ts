// The Email edit screen's own write layer (pass 2.3): update and reset-to-default for one
// `email_templates` row, plus the variable vocabulary a template supports (the edit screen's own
// palette and its light unknown-variable guard). `club-email.ts` keeps every read
// (`listEmailTemplates`, `getEmailTemplate`) and the send-time render (`sendClubEmail`,
// `renderTemplateWithVariables`); this module only adds the admin-write concerns pass 2.2's
// read-only screen had no need for.
import type { D1Database } from '@cloudflare/workers-types';
import { getEmailTemplate, type EmailTemplateRow } from './club-email';

/**
 * The known `{{variable}}` vocabulary per template id: which variables a real sender actually
 * passes (`offers.ts`'s own `sendClubEmail` call for `class_offer`; the ops import's own
 * `README`'s "variable vocabulary, template by template" section for the 12 ported/authored
 * templates it documents), plus `renewal_reminder`/`withdrawal_notice` (landed by a sibling
 * pass's own migration, no README section of its own yet), whose vocabulary is scanned off their
 * stored body directly. Kept as one small map, not derived live from a template's current body,
 * because a body's own `{{token}}` set is what the ADMIN typed, exactly the thing the unknown-
 * variable guard below must check AGAINST, not read off of.
 */
export const KNOWN_TEMPLATE_VARIABLES: Readonly<Record<string, readonly string[]>> = {
  asset_approval: ['person_name', 'item_display_name', 'fee_section', 'description_section', 'committee_email'],
  asset_denial: ['person_name', 'item_display_name', 'committee_email'],
  asset_signup: ['person_name', 'item_display_name', 'position', 'description_section', 'committee_email'],
  billing_inquiry: ['person_name', 'person_email', 'person_phone', 'message'],
  class_approval: ['person_name', 'item_display_name', 'registration_url'],
  class_denial: ['person_name', 'item_display_name', 'committee_email'],
  class_offer: ['person_name', 'item_display_name', 'claim_url', 'expires_at', 'committee_email'],
  class_signup: ['person_name', 'item_display_name', 'position', 'comment_section', 'committee_email'],
  donation_receipt: ['donor_name', 'date', 'amount', 'reference', 'note_section'],
  payment_notification: ['person_name', 'person_email', 'asset_type_name', 'amount', 'payment_date'],
  payment_receipt: ['person_name', 'asset_type_name', 'season', 'amount', 'reference'],
  payment_request: ['person_name', 'asset_type_name', 'season', 'fee_display', 'payment_url'],
  renewal_reminder: ['person_name', 'message', 'portal_url', 'committee_email'],
  withdrawal_notice: ['member_name', 'class_name', 'withdrawn_at', 'offer_result'],
};

/** This template's known variable vocabulary, or `undefined` for an id this map does not name
 *  (a future template the map has not caught up to yet; the guard skips it rather than flag
 *  everything as unknown). */
export function getKnownVariables(id: string): readonly string[] | undefined {
  return KNOWN_TEMPLATE_VARIABLES[id];
}

/** Every distinct `{{token}}` a string uses, in first-seen order. */
function extractVariableTokens(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) seen.add(match[1]);
  return [...seen];
}

/** A `{{token}}` this template's known vocabulary does not name, in a subject/body pair: a light
 *  warn-not-block guard (the edit action still saves), so a typo'd variable name surfaces before
 *  a real send silently leaves it unresolved. Answers `[]` for a template id the vocabulary map
 *  does not yet name, since there is nothing to check against. */
export function findUnknownVariables(id: string, subject: string, body: string): string[] {
  const known = getKnownVariables(id);
  if (!known) return [];
  const used = new Set([...extractVariableTokens(subject), ...extractVariableTokens(body)]);
  return [...used].filter((token) => !known.includes(token));
}

/** A readable placeholder for one variable's sample value, so the edit screen's preview never
 *  shows a blank or a raw `{{token}}`. A light heuristic on the variable's own name (`_url`
 *  suffix, a date-like name, a money-like name), falling back to the variable's own name in
 *  words; good enough for an admin-facing preview, not meant to be exact. */
function sampleValueFor(name: string): string {
  if (/url$/.test(name)) return 'https://aksailingclub.org/sample-link';
  if (/(date|_at)$/.test(name)) return 'July 10, 2026';
  if (name === 'amount' || name === 'fee_display') return '$100';
  if (name === 'position') return '3';
  if (name === 'season') return '2026';
  return `Sample ${name.replace(/_/g, ' ')}`;
}

/** Sample values for every variable this template's known vocabulary names, for the edit
 *  screen's own preview (the send-time render fed placeholder data instead of a real
 *  recipient's). Answers `{}` for a template id the vocabulary map does not yet name. */
export function buildSampleVariables(id: string): Record<string, string> {
  const known = getKnownVariables(id) ?? [];
  return Object.fromEntries(known.map((name) => [name, sampleValueFor(name)]));
}

/** One `email_templates` row's shipped defaults, alongside its live values: the edit screen's own
 *  load (to show what reset would restore) and `resetEmailTemplate`'s own read. */
export interface EmailTemplateWithDefaults extends EmailTemplateRow {
  defaultSubject: string;
  defaultBody: string;
}

interface DefaultsRawRow {
  default_subject: string;
  default_body: string;
}

/** One template plus its `default_subject`/`default_body` (migration 0012), or `null` if no such
 *  row. */
export async function getEmailTemplateWithDefaults(db: D1Database, id: string): Promise<EmailTemplateWithDefaults | null> {
  const [template, defaults] = await Promise.all([
    getEmailTemplate(db, id),
    db.prepare('SELECT default_subject, default_body FROM email_templates WHERE id = ?1').bind(id).first<DefaultsRawRow>(),
  ]);
  if (!template || !defaults) return null;
  return { ...template, defaultSubject: defaults.default_subject, defaultBody: defaults.default_body };
}

/** A template's editable content: what the edit screen's Save action writes. */
export interface EmailTemplateWrite {
  subject: string;
  body: string;
}

/** Write a template's `subject`/`body` (the edit screen's own Save action); `default_subject`/
 *  `default_body` are never touched here, only by `resetEmailTemplate`. */
export async function updateEmailTemplate(db: D1Database, id: string, write: EmailTemplateWrite, updatedBy: string): Promise<void> {
  await db
    .prepare(`UPDATE email_templates SET subject = ?1, body = ?2, updated_at = datetime('now'), updated_by = ?3 WHERE id = ?4`)
    .bind(write.subject, write.body, updatedBy, id)
    .run();
}

/** `resetEmailTemplate`'s outcome: never throws for an ordinary refusal (no such template, or a
 *  template with no default recorded), mirroring `club-email.ts`'s own typed-result functions. */
export type ResetEmailTemplateResult = { ok: true; template: EmailTemplateRow } | { ok: false; error: string };

/**
 * Restore a template's `subject`/`body` from its own `default_subject`/`default_body` (migration
 * 0012's backfill, or whatever an earlier import set them to). Fails closed, rather than write an
 * empty subject/body, when either default column reads `''`: a template inserted since without
 * its own defaults set (a hand-written `INSERT` that forgot the two columns migration 0012 added)
 * has no default recorded yet, and resetting it would be a silent content-destroying footgun, not
 * a real restore.
 */
export async function resetEmailTemplate(db: D1Database, id: string, updatedBy: string): Promise<ResetEmailTemplateResult> {
  const current = await getEmailTemplateWithDefaults(db, id);
  if (!current) return { ok: false, error: 'No such template.' };
  if (!current.defaultSubject || !current.defaultBody) {
    return { ok: false, error: 'No default is recorded for this template; nothing to reset to.' };
  }
  await db
    .prepare(`UPDATE email_templates SET subject = default_subject, body = default_body, updated_at = datetime('now'), updated_by = ?1 WHERE id = ?2`)
    .bind(updatedBy, id)
    .run();
  const restored = await getEmailTemplate(db, id);
  if (!restored) return { ok: false, error: 'No such template.' };
  return { ok: true, template: restored };
}
