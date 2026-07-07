import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { resolveClassContact } from '$admin-club/lib/class-contact';

describe('resolveClassContact (the guardian-routing rule)', () => {
  it('routes an adult-teen member with an email on file to themselves', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM members WHERE id': { name: 'Jamie', email: 'jamie@example.com', household_id: 'hh-1' } },
    });
    const contact = await resolveClassContact(db, 'mem-1', 'adult-teen');
    expect(contact).toEqual({ email: 'jamie@example.com', name: 'Jamie' });
  });

  it('routes a youth-track member to the household primary member, even when the child has an email', async () => {
    // Both `members WHERE id` calls (the enrollee, then the household's primary) share one key;
    // a function responder distinguishes them by the bound id argument.
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': (args: unknown[]) =>
          args[0] === 'mem-parent' ? { name: 'Parent Larsen', email: 'parent@example.com' } : { name: 'Kid Larsen', email: 'kid@example.com', household_id: 'hh-1' },
        'FROM households WHERE id': { primary_member_id: 'mem-parent' },
      },
    });
    const contact = await resolveClassContact(db, 'mem-kid', 'youth');
    expect(contact).toEqual({ email: 'parent@example.com', name: 'Parent Larsen' });
  });

  it('falls back to the household primary when an adult-teen member has no email of their own', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': (args: unknown[]) =>
          args[0] === 'mem-primary' ? { name: 'Primary', email: 'primary@example.com' } : { name: 'No Email', email: null, household_id: 'hh-1' },
        'FROM households WHERE id': { primary_member_id: 'mem-primary' },
      },
    });
    const contact = await resolveClassContact(db, 'mem-no-email', 'adult-teen');
    expect(contact).toEqual({ email: 'primary@example.com', name: 'Primary' });
  });

  it('resolves to null when neither the member nor the household primary has an email', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': { name: 'No Email', email: null, household_id: 'hh-1' },
        'FROM households WHERE id': { primary_member_id: null },
      },
    });
    const contact = await resolveClassContact(db, 'mem-1', 'youth');
    expect(contact).toBeNull();
  });

  it('resolves to null when the member itself does not exist', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE id': null } });
    const contact = await resolveClassContact(db, 'no-such-member', 'adult-teen');
    expect(contact).toBeNull();
  });
});
