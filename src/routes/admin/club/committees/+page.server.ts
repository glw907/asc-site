// The Club section's Committees screen (member-directory pass T6): a minimal CRUD admin surface
// over the whole roles model -- committees, committee memberships, and member positions -- all
// gated the same `clubAdminAction` way Classes, Events, and Assets already establish. A deliberate
// stopgap the queued admin-nav-reorg + admin-roles pass absorbs later (the roles spec's own
// "Seams and sequencing" section), so this stays one list page rather than a per-id detail route.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-db';
import { clubAdminAction } from '$admin-club/lib/club-action';
import { listMemberOptions, type MemberOption } from '$admin-club/lib/assets-store';
import {
  addCommitteeMember,
  approveCommitteeMember,
  createCommittee,
  createMemberPosition,
  listCommitteeMembers,
  listCommittees,
  listMemberPositions,
  moveMemberPosition,
  removeCommitteeMember,
  removeMemberPosition,
  setCommitteeArchived,
  setCommitteeMemberRole,
  updateCommittee,
  updateMemberPosition,
  type CommitteeMemberRow,
  type CommitteeRow,
  type MemberPositionRow,
} from '$admin-club/lib/committees-store';
import {
  parseAddCommitteeMemberForm,
  parseCommitteeForm,
  parseCommitteeMemberRoleForm,
  parseMemberPositionForm,
} from './committees-form-input';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return {
      committees: [] as CommitteeRow[],
      committeeMembers: [] as CommitteeMemberRow[],
      memberPositions: [] as MemberPositionRow[],
      memberOptions: [] as MemberOption[],
      error: 'CLUB_DB is not bound.',
    };
  }
  const [committees, committeeMembers, memberPositions, memberOptions] = await Promise.all([
    listCommittees(db, { includeArchived: true }),
    listCommitteeMembers(db),
    listMemberPositions(db),
    listMemberOptions(db),
  ]);
  return { committees, committeeMembers, memberPositions, memberOptions, error: null as string | null };
};

const DENIED_MESSAGE = 'A club role is required to manage committees.';

function requireId(form: FormData, field: string, label: string): string | { error: string } {
  const value = form.get(field);
  if (typeof value !== 'string' || !value.trim()) return { error: `${label} is required.` };
  return value.trim();
}

export const actions: Actions = {
  createCommittee: clubAdminAction(
    async ({ form, ctx }) => {
      const parsed = parseCommitteeForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'create', entity: 'committee', detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      const id = await createCommittee(ctx.db, parsed);
      ctx.audit({ action: 'create', entity: 'committee', entityId: id });
      return { ok: true };
    },
    { action: 'create', entity: 'committee', deniedMessage: DENIED_MESSAGE },
  ),

  updateCommittee: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireId(form, 'committeeId', 'A committee');
      if (typeof id !== 'string') {
        ctx.audit({ action: 'update', entity: 'committee', detail: `rejected: ${id.error}` });
        return fail(400, { error: id.error });
      }
      const parsed = parseCommitteeForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'update', entity: 'committee', entityId: id, detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      await updateCommittee(ctx.db, id, parsed);
      ctx.audit({ action: 'update', entity: 'committee', entityId: id });
      return { ok: true };
    },
    { action: 'update', entity: 'committee', deniedMessage: DENIED_MESSAGE },
  ),

  archiveCommittee: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireId(form, 'committeeId', 'A committee');
      if (typeof id !== 'string') {
        ctx.audit({ action: 'archive', entity: 'committee', detail: `rejected: ${id.error}` });
        return fail(400, { error: id.error });
      }
      const archived = form.get('archived') !== 'false';
      await setCommitteeArchived(ctx.db, id, archived);
      ctx.audit({ action: archived ? 'archive' : 'restore', entity: 'committee', entityId: id });
      return { ok: true };
    },
    { action: 'archive', entity: 'committee', deniedMessage: DENIED_MESSAGE },
  ),

  addMember: clubAdminAction(
    async ({ form, ctx }) => {
      const parsed = parseAddCommitteeMemberForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'add', entity: 'committee-member', detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      const id = await addCommitteeMember(ctx.db, parsed);
      ctx.audit({ action: 'add', entity: 'committee-member', entityId: id });
      return { ok: true };
    },
    { action: 'add', entity: 'committee-member', deniedMessage: DENIED_MESSAGE },
  ),

  approveMember: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireId(form, 'committeeMemberId', 'A committee member');
      if (typeof id !== 'string') {
        ctx.audit({ action: 'approve', entity: 'committee-member', detail: `rejected: ${id.error}` });
        return fail(400, { error: id.error });
      }
      await approveCommitteeMember(ctx.db, id);
      ctx.audit({ action: 'approve', entity: 'committee-member', entityId: id });
      return { ok: true };
    },
    { action: 'approve', entity: 'committee-member', deniedMessage: DENIED_MESSAGE },
  ),

  declineMember: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireId(form, 'committeeMemberId', 'A committee member');
      if (typeof id !== 'string') {
        ctx.audit({ action: 'decline', entity: 'committee-member', detail: `rejected: ${id.error}` });
        return fail(400, { error: id.error });
      }
      await removeCommitteeMember(ctx.db, id);
      ctx.audit({ action: 'decline', entity: 'committee-member', entityId: id });
      return { ok: true };
    },
    { action: 'decline', entity: 'committee-member', deniedMessage: DENIED_MESSAGE },
  ),

  removeMember: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireId(form, 'committeeMemberId', 'A committee member');
      if (typeof id !== 'string') {
        ctx.audit({ action: 'remove', entity: 'committee-member', detail: `rejected: ${id.error}` });
        return fail(400, { error: id.error });
      }
      await removeCommitteeMember(ctx.db, id);
      ctx.audit({ action: 'remove', entity: 'committee-member', entityId: id });
      return { ok: true };
    },
    { action: 'remove', entity: 'committee-member', deniedMessage: DENIED_MESSAGE },
  ),

  setMemberRole: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireId(form, 'committeeMemberId', 'A committee member');
      if (typeof id !== 'string') {
        ctx.audit({ action: 'set-role', entity: 'committee-member', detail: `rejected: ${id.error}` });
        return fail(400, { error: id.error });
      }
      const parsed = parseCommitteeMemberRoleForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'set-role', entity: 'committee-member', entityId: id, detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      await setCommitteeMemberRole(ctx.db, id, parsed.role);
      ctx.audit({ action: 'set-role', entity: 'committee-member', entityId: id, detail: `role=${parsed.role}` });
      return { ok: true };
    },
    { action: 'set-role', entity: 'committee-member', deniedMessage: DENIED_MESSAGE },
  ),

  createPosition: clubAdminAction(
    async ({ form, ctx }) => {
      const parsed = parseMemberPositionForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'create', entity: 'member-position', detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      const id = await createMemberPosition(ctx.db, parsed);
      ctx.audit({ action: 'create', entity: 'member-position', entityId: id });
      return { ok: true };
    },
    { action: 'create', entity: 'member-position', deniedMessage: DENIED_MESSAGE },
  ),

  updatePosition: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireId(form, 'positionId', 'A position');
      if (typeof id !== 'string') {
        ctx.audit({ action: 'update', entity: 'member-position', detail: `rejected: ${id.error}` });
        return fail(400, { error: id.error });
      }
      const parsed = parseMemberPositionForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'update', entity: 'member-position', entityId: id, detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      await updateMemberPosition(ctx.db, id, { kind: parsed.kind, title: parsed.title });
      ctx.audit({ action: 'update', entity: 'member-position', entityId: id });
      return { ok: true };
    },
    { action: 'update', entity: 'member-position', deniedMessage: DENIED_MESSAGE },
  ),

  removePosition: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireId(form, 'positionId', 'A position');
      if (typeof id !== 'string') {
        ctx.audit({ action: 'remove', entity: 'member-position', detail: `rejected: ${id.error}` });
        return fail(400, { error: id.error });
      }
      await removeMemberPosition(ctx.db, id);
      ctx.audit({ action: 'remove', entity: 'member-position', entityId: id });
      return { ok: true };
    },
    { action: 'remove', entity: 'member-position', deniedMessage: DENIED_MESSAGE },
  ),

  movePosition: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireId(form, 'positionId', 'A position');
      if (typeof id !== 'string') {
        ctx.audit({ action: 'reorder', entity: 'member-position', detail: `rejected: ${id.error}` });
        return fail(400, { error: id.error });
      }
      const direction = form.get('direction') === 'up' ? 'up' : 'down';
      await moveMemberPosition(ctx.db, id, direction);
      ctx.audit({ action: 'reorder', entity: 'member-position', entityId: id, detail: `direction=${direction}` });
      return { ok: true };
    },
    { action: 'reorder', entity: 'member-position', deniedMessage: DENIED_MESSAGE },
  ),
};
