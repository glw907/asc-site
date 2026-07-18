import { describe, expect, it } from 'vitest';
import {
  parseAddCommitteeMemberForm,
  parseCommitteeForm,
  parseCommitteeMemberRoleForm,
  parseMemberPositionForm,
} from '../routes/admin/club/committees/committees-form-input';

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

describe('parseCommitteeForm', () => {
  it('errors when the name is missing', () => {
    expect(parseCommitteeForm(formOf({ kind: 'established' }))).toEqual({ error: 'A name is required.' });
  });

  it('errors on an invalid kind', () => {
    expect(parseCommitteeForm(formOf({ name: 'Fleet', kind: 'social' }))).toEqual({ error: 'A valid kind is required.' });
  });

  it('errors on a non-integer sort order', () => {
    expect(parseCommitteeForm(formOf({ name: 'Fleet', kind: 'established', sortOrder: '1.5' }))).toEqual({
      error: 'Sort order must be a whole number.',
    });
  });

  it('parses a full form, trimming the name and nulling a blank description', () => {
    expect(parseCommitteeForm(formOf({ name: ' Fleet ', description: '  ', kind: 'established', sortOrder: '2' }))).toEqual({
      name: 'Fleet',
      description: null,
      kind: 'established',
      sortOrder: 2,
    });
  });

  it('defaults sort order to 0 when blank', () => {
    expect(parseCommitteeForm(formOf({ name: 'Fleet', kind: 'established' }))).toEqual({
      name: 'Fleet',
      description: null,
      kind: 'established',
      sortOrder: 0,
    });
  });
});

describe('parseAddCommitteeMemberForm', () => {
  it('errors when the committee is missing', () => {
    expect(parseAddCommitteeMemberForm(formOf({ memberId: 'm-1' }))).toEqual({ error: 'A committee is required.' });
  });

  it('errors when the member is missing', () => {
    expect(parseAddCommitteeMemberForm(formOf({ committeeId: 'c-1' }))).toEqual({ error: 'A member is required.' });
  });

  it('defaults role to member when absent or invalid', () => {
    expect(parseAddCommitteeMemberForm(formOf({ committeeId: 'c-1', memberId: 'm-1' }))).toEqual({
      committeeId: 'c-1',
      memberId: 'm-1',
      role: 'member',
    });
  });

  it('parses an explicit role', () => {
    expect(parseAddCommitteeMemberForm(formOf({ committeeId: 'c-1', memberId: 'm-1', role: 'chair' }))).toEqual({
      committeeId: 'c-1',
      memberId: 'm-1',
      role: 'chair',
    });
  });
});

describe('parseCommitteeMemberRoleForm', () => {
  it('errors on an invalid role', () => {
    expect(parseCommitteeMemberRoleForm(formOf({ role: 'president' }))).toEqual({ error: 'A valid role is required.' });
  });

  it('parses a valid role', () => {
    expect(parseCommitteeMemberRoleForm(formOf({ role: 'co-chair' }))).toEqual({ role: 'co-chair' });
  });
});

describe('parseMemberPositionForm', () => {
  it('errors when the member is missing', () => {
    expect(parseMemberPositionForm(formOf({ kind: 'officer', title: 'Commodore' }))).toEqual({ error: 'A member is required.' });
  });

  it('errors on an invalid kind', () => {
    expect(parseMemberPositionForm(formOf({ memberId: 'm-1', kind: 'chairperson', title: 'Commodore' }))).toEqual({
      error: 'A valid kind is required.',
    });
  });

  it('errors when the title is missing', () => {
    expect(parseMemberPositionForm(formOf({ memberId: 'm-1', kind: 'officer' }))).toEqual({ error: 'A title is required.' });
  });

  it('parses a full form, trimming the title', () => {
    expect(parseMemberPositionForm(formOf({ memberId: 'm-1', kind: 'officer', title: ' Commodore ' }))).toEqual({
      memberId: 'm-1',
      kind: 'officer',
      title: 'Commodore',
    });
  });
});
