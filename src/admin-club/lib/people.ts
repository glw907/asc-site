// The public-signup minimal member shape (this pass's own Part 2, migration 0005_member_domain's
// arrival): every write path that touches a real person (enrollments.ts's signup, offers.ts's
// claim, classes-store.ts's instructor assignment) now needs a real `members.id` to reference,
// since those tables' `REFERENCES members(id)` columns (0001_substrate) finally have a real target
// table. This module is the one place that resolves "a name and an email" into that id, upserting
// by email so the same person's second signup or a repeat instructor assignment finds their
// existing row rather than minting a duplicate.
import type { D1Database } from '@cloudflare/workers-types';
import { normalizeEmail, normalizeNameCaps, normalizePhoneE164 } from './member-normalize.js';

/** `ensureMember`'s input: the minimal shape a public form or an admin action can supply. `phone`
 *  is optional: not every caller collects one (the classes admin's instructor assignment form
 *  never does). */
export interface EnsureMemberInput {
  name: string;
  email: string;
  phone?: string | null;
}

/** `ensureMember`'s result: the ids a caller needs to write a `member_id`-referencing row, plus
 *  whether this call minted a fresh member (and household) or found an existing one. */
export interface EnsureMemberResult {
  memberId: string;
  householdId: string;
  created: boolean;
}

/**
 * Resolve a real `members.id` for a person identified by name, email, and (optionally) phone,
 * upserting by email. An existing `members` row for that email returns its ids as-is: name and
 * phone are NEVER updated here, even when this call's own arguments differ from what is stored,
 * because this is the public-signup MINIMAL shape, not an edit. The 2.2 join flow is the one
 * enrichment path for a member's fuller detail (birthdate, directory visibility, household
 * membership beyond the one primary seat), and it never routes through `ensureMember`.
 *
 * A new person gets a fresh, minimal one-member household: the ratified schema's own
 * deferred-not-null dance (`households.primary_member_id REFERENCES members(id)`, so the member
 * must exist before the household's own row can name it) runs as one `db.batch()`, insert the
 * household with `primary_member_id` unset, insert its first member, then set the household's
 * `primary_member_id` to that member, so a caller never observes a household with no primary
 * member or a member with no household.
 *
 * The lookup itself matches on the normalized email (`member-normalize.js`'s `normalizeEmail`),
 * since that is what a prior call, live or imported, would have stored. A fresh row's name,
 * email, and phone are normalized the same way this codebase's other live write paths do
 * (`member-portal/lib/profile.ts`, `member-portal/lib/household.ts`); a phone that does not
 * parse to E.164 is never a reason to refuse a signup, so it stores trimmed as given rather than
 * blocking the caller.
 */
export async function ensureMember(db: D1Database, input: EnsureMemberInput): Promise<EnsureMemberResult> {
  const email = normalizeEmail(input.email);
  const existing = await db
    .prepare('SELECT id, household_id FROM members WHERE email = ?1 LIMIT 1')
    .bind(email)
    .first<{ id: string; household_id: string }>();
  if (existing) return { memberId: existing.id, householdId: existing.household_id, created: false };

  const name = normalizeNameCaps(input.name);
  const phone = input.phone ? (normalizePhoneE164(input.phone) ?? input.phone.trim()) : null;

  const householdId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT INTO households (id, name) VALUES (?1, ?2)').bind(householdId, name),
    db
      .prepare('INSERT INTO members (id, household_id, name, email, phone) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(memberId, householdId, name, email, phone),
    db.prepare('UPDATE households SET primary_member_id = ?1 WHERE id = ?2').bind(memberId, householdId),
  ]);

  return { memberId, householdId, created: true };
}
