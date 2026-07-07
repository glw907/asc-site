import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { getClubRole, hasAnyClubRole, LastOwnerError, listClubRoles, removeClubRole, setClubRole } from '$admin-club/lib/club-roles';

describe('getClubRole', () => {
  it('maps the stored "club-admin" row to the API role "admin"', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } });
    await expect(getClubRole(db, 'admin@example.com')).resolves.toBe('admin');
  });

  it('keeps "owner" as-is', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'owner' }] } });
    await expect(getClubRole(db, 'owner@example.com')).resolves.toBe('owner');
  });

  it('returns null for an email with no grant at all', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [] } });
    await expect(getClubRole(db, 'nobody@example.com')).resolves.toBeNull();
  });

  it('returns null for an instructor-only email: no admin surface per 2.2', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'instructor' }] } });
    await expect(getClubRole(db, 'instructor@example.com')).resolves.toBeNull();
  });

  it('prefers owner when an email somehow holds both grants', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'club-admin' }, { role: 'owner' }] } });
    await expect(getClubRole(db, 'both@example.com')).resolves.toBe('owner');
  });
});

describe('listClubRoles', () => {
  it('maps each stored row to the API shape', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM club_roles': [
          { email: 'owner@example.com', role: 'owner', granted_by: 'system', granted_at: '2026-07-07 00:00:00' },
          { email: 'admin@example.com', role: 'club-admin', granted_by: 'owner@example.com', granted_at: '2026-07-08 00:00:00' },
        ],
      },
    });
    await expect(listClubRoles(db)).resolves.toEqual([
      { email: 'owner@example.com', role: 'owner', grantedBy: 'system', grantedAt: '2026-07-07 00:00:00' },
      { email: 'admin@example.com', role: 'admin', grantedBy: 'owner@example.com', grantedAt: '2026-07-08 00:00:00' },
    ]);
  });
});

describe('hasAnyClubRole', () => {
  it('is true for an owner or an admin', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'owner' }] } });
    await expect(hasAnyClubRole(db, 'owner@example.com')).resolves.toBe(true);
  });

  it('is false for an email with no grant (or an instructor-only one)', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [] } });
    await expect(hasAnyClubRole(db, 'nobody@example.com')).resolves.toBe(false);
  });
});

describe('setClubRole', () => {
  it('deletes any existing owner/admin row for the email, then inserts the new one', async () => {
    // The target already holds 'club-admin', so a re-grant of 'admin' never touches the
    // owner-count guard at all (assertKeepsAnOwner short-circuits on a non-owner current role).
    const { db, calls } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } });
    await setClubRole(db, 'admin@example.com', 'admin', 'owner@example.com');
    expect(calls.some((c) => c.sql.startsWith('DELETE FROM club_roles') && c.args[0] === 'admin@example.com')).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.sql.startsWith('INSERT INTO club_roles') &&
          c.args[0] === 'admin@example.com' &&
          c.args[1] === 'club-admin' &&
          c.args[2] === 'owner@example.com',
      ),
    ).toBe(true);
  });

  it('never needs the owner count when the grant keeps or gives owner', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } });
    await setClubRole(db, 'admin@example.com', 'owner', 'owner@example.com');
    expect(calls.some((c) => c.sql.includes('COUNT(*)'))).toBe(false);
  });

  it('refuses demoting the last owner to admin', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'owner' }] }, firstResults: { 'COUNT(*)': { n: 1 } } });
    await expect(setClubRole(db, 'owner@example.com', 'admin', 'owner@example.com')).rejects.toThrow(LastOwnerError);
    expect(calls.some((c) => c.sql.startsWith('DELETE FROM club_roles') || c.sql.startsWith('INSERT INTO club_roles'))).toBe(
      false,
    );
  });

  it('allows demoting an owner when another owner remains', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'owner' }] }, firstResults: { 'COUNT(*)': { n: 2 } } });
    await expect(setClubRole(db, 'owner@example.com', 'admin', 'other-owner@example.com')).resolves.toBeUndefined();
  });

  it('refuses via the atomic guard even when the cheap pre-check saw two owners: the race the ' +
    'conditional DELETE closes (a concurrent demotion already dropped the count to one by the ' +
    'time this write actually runs)', async () => {
    const { db, calls } = fakeD1({
      allResults: { 'FROM club_roles': [{ role: 'owner' }] },
      firstResults: { 'COUNT(*)': { n: 2 } }, // the stale pre-check: still sees two owners
      runResults: { "DELETE FROM club_roles WHERE email = ?1 AND role = 'owner'": { changes: 0 } },
    });
    await expect(setClubRole(db, 'owner@example.com', 'admin', 'other-owner@example.com')).rejects.toThrow(
      LastOwnerError,
    );
    // The guarded DELETE ran (and lost the race); the follow-up club-admin delete/insert never did.
    expect(calls.some((c) => c.sql.startsWith("DELETE FROM club_roles WHERE email = ?1 AND role = 'owner'"))).toBe(
      true,
    );
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO club_roles'))).toBe(false);
  });
});

describe('removeClubRole', () => {
  it('deletes only the owner/admin rows for the email', async () => {
    // removeClubRole first reads the email's current role (the last-owner guard's own check,
    // which short-circuits here since 'club-admin' is not 'owner'), then issues the delete.
    const { db, calls } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } });
    await removeClubRole(db, 'admin@example.com');
    const deletes = calls.filter((c) => c.sql.startsWith('DELETE FROM club_roles'));
    expect(deletes).toHaveLength(1);
    expect(deletes[0].sql).toContain("role IN ('owner','club-admin')");
    expect(deletes[0].args).toEqual(['admin@example.com']);
  });

  it('refuses removing the last owner', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'owner' }] }, firstResults: { 'COUNT(*)': { n: 1 } } });
    await expect(removeClubRole(db, 'owner@example.com')).rejects.toThrow(LastOwnerError);
    expect(calls.some((c) => c.sql.startsWith('DELETE FROM club_roles'))).toBe(false);
  });

  it('allows removing an owner when another owner remains', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'owner' }] }, firstResults: { 'COUNT(*)': { n: 2 } } });
    await expect(removeClubRole(db, 'owner@example.com')).resolves.toBeUndefined();
  });

  it('refuses via the atomic guard even when the cheap pre-check saw two owners (same race as ' +
    "setClubRole's own guard test)", async () => {
    const { db, calls } = fakeD1({
      allResults: { 'FROM club_roles': [{ role: 'owner' }] },
      firstResults: { 'COUNT(*)': { n: 2 } },
      runResults: { "DELETE FROM club_roles WHERE email = ?1 AND role = 'owner'": { changes: 0 } },
    });
    await expect(removeClubRole(db, 'owner@example.com')).rejects.toThrow(LastOwnerError);
    expect(calls.some((c) => c.sql.startsWith("DELETE FROM club_roles WHERE email = ?1 AND role = 'club-admin'"))).toBe(
      false,
    );
  });
});
