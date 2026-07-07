import { describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { sendClassWelcomeEmail } from '$admin-club/lib/class-welcome';

const TEMPLATE_ROW = {
  id: 'class_welcome',
  subject: "You're enrolled",
  reply_to: null,
  body: 'Hi {{person_name}}, {{item_display_name}} {{youth_note}} {{committee_email}}',
  updated_at: '2026-01-01 00:00:00',
  updated_by: 'authored:job-runner',
};

describe('sendClassWelcomeEmail', () => {
  it('is a no-op (no marker, no query) when no env is given', async () => {
    const { db, calls } = fakeD1();
    await sendClassWelcomeEmail(db, undefined, { enrollmentId: 'e-1', className: 'Keelboat Basics', track: 'adult-teen', memberId: 'mem-1' });
    expect(calls).toHaveLength(0);
  });

  it('marks the welcome touch and sends with an empty youth_note for an adult-teen class', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM members WHERE id': { name: 'Jamie', email: 'jamie@example.com', household_id: 'hh-1' },
        'FROM email_templates': TEMPLATE_ROW,
      },
    });
    await sendClassWelcomeEmail(db, { EMAIL: { send } }, { enrollmentId: 'e-1', className: 'Keelboat Basics', track: 'adult-teen', memberId: 'mem-1' });

    expect(calls.some((c) => c.sql.startsWith('INSERT OR IGNORE INTO class_reminders_sent') && c.args[1] === 'welcome')).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].text).not.toContain('parent or guardian');
  });

  it('substitutes the youth-specific note for a youth-track class', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    // `resolveClassContact`'s two `members WHERE id` calls (the enrolled child, then the
    // household's primary member) share one key; a function responder distinguishes them by the
    // bound id argument, the same convention `class-contact.test.ts` already uses.
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': (args: unknown[]) =>
          args[0] === 'mem-parent' ? { name: 'Parent', email: 'parent@example.com' } : { name: 'Kid', email: null, household_id: 'hh-1' },
        'FROM households WHERE id': { primary_member_id: 'mem-parent' },
        'FROM email_templates': TEMPLATE_ROW,
      },
    });
    await sendClassWelcomeEmail(db, { EMAIL: { send } }, { enrollmentId: 'e-1', className: 'Youth Sailing', track: 'youth', memberId: 'mem-kid' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe('parent@example.com');
    expect(send.mock.calls[0][0].text).toContain('parent or guardian');
  });

  it('never throws when the contact resolves to null (nothing to notify)', async () => {
    const send = vi.fn();
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': { name: 'Kid', email: null, household_id: 'hh-1' },
        'FROM households WHERE id': { primary_member_id: null },
      },
    });
    await expect(
      sendClassWelcomeEmail(db, { EMAIL: { send } }, { enrollmentId: 'e-1', className: 'Youth Sailing', track: 'youth', memberId: 'mem-kid' }),
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
