// The Committees screen's shared form validation: one parser per posted form shape, the same
// one-parser-per-concept idiom `assets-form-input.ts` and `class-form-input.ts` already establish.
import { COMMITTEE_KINDS, COMMITTEE_ROLES, POSITION_KINDS, type CommitteeKind, type CommitteeRole, type PositionKind } from '$admin-club/lib/committees-store';

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Parse a committee create/edit form post: a name and a valid kind are required, description is
 *  optional, sort order defaults to 0 when blank or not a whole number. */
export function parseCommitteeForm(
  form: FormData,
): { name: string; description: string | null; kind: CommitteeKind; sortOrder: number } | { error: string } {
  const name = form.get('name');
  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'A name is required.' };
  }
  const kind = form.get('kind');
  if (typeof kind !== 'string' || !COMMITTEE_KINDS.includes(kind as CommitteeKind)) {
    return { error: 'A valid kind is required.' };
  }
  const sortOrderRaw = form.get('sortOrder');
  const sortOrder = typeof sortOrderRaw === 'string' && sortOrderRaw.trim() !== '' ? Number(sortOrderRaw) : 0;
  if (!Number.isInteger(sortOrder)) {
    return { error: 'Sort order must be a whole number.' };
  }
  return { name: name.trim(), description: emptyToNull(form.get('description')), kind: kind as CommitteeKind, sortOrder };
}

/** Parse an "add committee member" form post: a committee and a member are required, role
 *  defaults to plain `'member'` when absent. */
export function parseAddCommitteeMemberForm(
  form: FormData,
): { committeeId: string; memberId: string; role: CommitteeRole } | { error: string } {
  const committeeId = form.get('committeeId');
  if (typeof committeeId !== 'string' || !committeeId.trim()) {
    return { error: 'A committee is required.' };
  }
  const memberId = form.get('memberId');
  if (typeof memberId !== 'string' || !memberId.trim()) {
    return { error: 'A member is required.' };
  }
  const roleRaw = form.get('role');
  const role = typeof roleRaw === 'string' && COMMITTEE_ROLES.includes(roleRaw as CommitteeRole) ? (roleRaw as CommitteeRole) : 'member';
  return { committeeId: committeeId.trim(), memberId: memberId.trim(), role };
}

/** Parse a "set committee member role" form post: the role must be one of the allowed values. */
export function parseCommitteeMemberRoleForm(form: FormData): { role: CommitteeRole } | { error: string } {
  const role = form.get('role');
  if (typeof role !== 'string' || !COMMITTEE_ROLES.includes(role as CommitteeRole)) {
    return { error: 'A valid role is required.' };
  }
  return { role: role as CommitteeRole };
}

/** Parse a position create/edit form post: a member, a valid kind, and a title are required. */
export function parseMemberPositionForm(form: FormData): { memberId: string; kind: PositionKind; title: string } | { error: string } {
  const memberId = form.get('memberId');
  if (typeof memberId !== 'string' || !memberId.trim()) {
    return { error: 'A member is required.' };
  }
  const kind = form.get('kind');
  if (typeof kind !== 'string' || !POSITION_KINDS.includes(kind as PositionKind)) {
    return { error: 'A valid kind is required.' };
  }
  const title = form.get('title');
  if (typeof title !== 'string' || !title.trim()) {
    return { error: 'A title is required.' };
  }
  return { memberId: memberId.trim(), kind: kind as PositionKind, title: title.trim() };
}
