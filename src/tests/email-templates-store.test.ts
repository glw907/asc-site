import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import {
  buildSampleVariables,
  findUnknownVariables,
  getEmailTemplateWithDefaults,
  getKnownVariables,
  resetEmailTemplate,
  updateEmailTemplate,
} from '$admin-club/lib/email-templates-store';

const STORED_ROW = {
  id: 'class_offer',
  subject: 'A spot is open -- {{item_display_name}} (edited)',
  reply_to: 'program-committee@aksailingclub.org',
  body: 'Hi {{person_name}}, an edited body.',
  updated_at: '2026-07-07 00:00:00',
  updated_by: 'admin@example.com',
};

const DEFAULTS_ROW = {
  default_subject: 'A spot is open -- {{item_display_name}}',
  default_body: 'Hi {{person_name}}, claim it: {{claim_url}} (expires {{expires_at}}). Contact {{committee_email}}.',
};

describe('getKnownVariables', () => {
  it('names the known vocabulary for a documented template', () => {
    expect(getKnownVariables('class_offer')).toEqual([
      'person_name',
      'item_display_name',
      'claim_url',
      'expires_at',
      'committee_email',
    ]);
  });

  it('answers undefined for a template id the map does not name', () => {
    expect(getKnownVariables('no-such-template')).toBeUndefined();
  });
});

describe('findUnknownVariables', () => {
  it('flags a {{token}} not in the known set', () => {
    expect(findUnknownVariables('class_offer', 'Subject with {{typo_var}}', 'Body text.')).toEqual(['typo_var']);
  });

  it('flags nothing when every token is known', () => {
    expect(findUnknownVariables('class_offer', 'Hi {{person_name}}', 'Claim: {{claim_url}}')).toEqual([]);
  });

  it('skips the check entirely for a template id with no recorded vocabulary', () => {
    expect(findUnknownVariables('no-such-template', 'Anything {{goes}}', 'here')).toEqual([]);
  });
});

describe('buildSampleVariables', () => {
  it('produces a sample value for every known variable', () => {
    const sample = buildSampleVariables('class_offer');
    expect(Object.keys(sample).sort()).toEqual(
      ['claim_url', 'committee_email', 'expires_at', 'item_display_name', 'person_name'].sort(),
    );
    expect(sample.claim_url).toContain('https://');
  });

  it('answers {} for an unrecorded template id', () => {
    expect(buildSampleVariables('no-such-template')).toEqual({});
  });
});

describe('getEmailTemplateWithDefaults', () => {
  it('reads the template alongside its defaults', async () => {
    const { db } = fakeD1({
      firstResults: {
        'id, subject, reply_to, body, updated_at, updated_by FROM email_templates': STORED_ROW,
        'default_subject, default_body FROM email_templates': DEFAULTS_ROW,
      },
    });
    await expect(getEmailTemplateWithDefaults(db, 'class_offer')).resolves.toEqual({
      id: 'class_offer',
      subject: STORED_ROW.subject,
      replyTo: STORED_ROW.reply_to,
      body: STORED_ROW.body,
      updatedAt: STORED_ROW.updated_at,
      updatedBy: STORED_ROW.updated_by,
      defaultSubject: DEFAULTS_ROW.default_subject,
      defaultBody: DEFAULTS_ROW.default_body,
    });
  });

  it('answers null for an unknown id', async () => {
    const { db } = fakeD1();
    await expect(getEmailTemplateWithDefaults(db, 'no-such-template')).resolves.toBeNull();
  });
});

describe('updateEmailTemplate', () => {
  it('writes subject, body, and the acting editor, never touching the default columns', async () => {
    const { db, calls } = fakeD1();
    await updateEmailTemplate(db, 'class_offer', { subject: 'New subject', body: 'New body' }, 'admin@example.com');
    expect(calls).toEqual([
      {
        sql: `UPDATE email_templates SET subject = ?1, body = ?2, updated_at = datetime('now'), updated_by = ?3 WHERE id = ?4`,
        args: ['New subject', 'New body', 'admin@example.com', 'class_offer'],
      },
    ]);
  });
});

describe('resetEmailTemplate', () => {
  it('restores subject/body from the default columns and returns the restored row', async () => {
    const restoredRow = { ...STORED_ROW, subject: DEFAULTS_ROW.default_subject, body: DEFAULTS_ROW.default_body, updated_by: 'admin@example.com' };
    // `resetEmailTemplate` reads the row twice (once before the write, alongside its defaults;
    // once after, to return the fresh row): a call-order responder answers each read correctly,
    // since `fakeD1` only keys by SQL substring, not by call sequence.
    let readCount = 0;
    const { db, calls } = fakeD1({
      firstResults: {
        'id, subject, reply_to, body, updated_at, updated_by FROM email_templates': () => (readCount++ === 0 ? STORED_ROW : restoredRow),
        'default_subject, default_body FROM email_templates': DEFAULTS_ROW,
      },
    });

    const result = await resetEmailTemplate(db, 'class_offer', 'admin@example.com');
    expect(result).toEqual({
      ok: true,
      template: expect.objectContaining({ subject: DEFAULTS_ROW.default_subject, body: DEFAULTS_ROW.default_body }),
    });
    const write = calls.find((c) => c.sql.startsWith('UPDATE email_templates SET subject = default_subject'));
    expect(write?.args).toEqual(['admin@example.com', 'class_offer']);
  });

  it('fails closed when no default is recorded for the template (empty default columns)', async () => {
    const { db } = fakeD1({
      firstResults: {
        'id, subject, reply_to, body, updated_at, updated_by FROM email_templates': STORED_ROW,
        'default_subject, default_body FROM email_templates': { default_subject: '', default_body: '' },
      },
    });
    const result = await resetEmailTemplate(db, 'class_offer', 'admin@example.com');
    expect(result).toEqual({ ok: false, error: 'No default is recorded for this template; nothing to reset to.' });
  });

  it('fails closed for an unknown template id', async () => {
    const { db } = fakeD1();
    const result = await resetEmailTemplate(db, 'no-such-template', 'admin@example.com');
    expect(result).toEqual({ ok: false, error: 'No such template.' });
  });
});
