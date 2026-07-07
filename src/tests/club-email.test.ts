import { describe, expect, it, vi } from 'vitest';
import { getEmailTemplate, listEmailLog, listEmailTemplates, renderTemplateWithVariables, sendClubEmail } from '../admin-club/lib/club-email';
import { fakeD1 } from './_fake-d1';

const CLASS_OFFER_TEMPLATE = {
  id: 'class_offer',
  subject: 'A spot is open -- {{item_display_name}}',
  reply_to: 'program-committee@aksailingclub.org',
  body: 'Hi {{person_name}}, claim it: {{claim_url}} (expires {{expires_at}}). Contact {{committee_email}}.',
  updated_at: '2026-07-07 00:00:00',
  updated_by: 'authored:pass-2-2',
};

describe('listEmailTemplates / getEmailTemplate', () => {
  it('lists every template, camelCased', async () => {
    const { db } = fakeD1({ allResults: { 'FROM email_templates': [CLASS_OFFER_TEMPLATE] } });
    const templates = await listEmailTemplates(db);
    expect(templates).toEqual([
      {
        id: 'class_offer',
        subject: CLASS_OFFER_TEMPLATE.subject,
        replyTo: CLASS_OFFER_TEMPLATE.reply_to,
        body: CLASS_OFFER_TEMPLATE.body,
        updatedAt: CLASS_OFFER_TEMPLATE.updated_at,
        updatedBy: CLASS_OFFER_TEMPLATE.updated_by,
      },
    ]);
  });

  it('reads null for an unknown template id', async () => {
    const { db } = fakeD1();
    expect(await getEmailTemplate(db, 'no-such-template')).toBeNull();
  });
});

describe('listEmailLog', () => {
  it('reads the send log, newest first, camelCased', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM email_log': [
          {
            id: 'log-1',
            template_id: 'class_offer',
            segment: null,
            recipient: 'sailor@example.com',
            subject: 'A spot is open',
            status: 'sent',
            error_detail: null,
            sent_at: '2026-07-07 12:00:00',
          },
        ],
      },
    });
    const log = await listEmailLog(db);
    expect(log).toEqual([
      {
        id: 'log-1',
        templateId: 'class_offer',
        segment: null,
        recipient: 'sailor@example.com',
        subject: 'A spot is open',
        status: 'sent',
        errorDetail: null,
        sentAt: '2026-07-07 12:00:00',
      },
    ]);
  });
});

describe('sendClubEmail', () => {
  const to = 'sailor@example.com';
  const vars = {
    person_name: 'Sailor',
    item_display_name: 'Youth Sailing 101',
    claim_url: 'https://dev.aksailingclub.org/classes/offer/abc123',
    expires_at: 'July 10, 2026',
    committee_email: 'program-committee@aksailingclub.org',
  };

  it('renders variables, sends through EMAIL, and logs a sent row', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM email_templates': CLASS_OFFER_TEMPLATE } });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await sendClubEmail(db, { EMAIL: { send } }, { to, templateId: 'class_offer', vars });

    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe(to);
    expect(message.from).toContain('aksailingclub.org');
    expect(message.subject).toBe('A spot is open -- Youth Sailing 101');
    expect(message.text).toContain('claim it: https://dev.aksailingclub.org/classes/offer/abc123');
    expect(message.html).toContain('<p>');
    expect(message.html).not.toContain('{{');

    const logWrite = calls.find((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(logWrite?.args[1]).toBe('class_offer'); // template_id
    expect(logWrite?.args[4]).toBe('A spot is open -- Youth Sailing 101'); // subject
    expect(logWrite?.args[5]).toBe('sent'); // status
    expect(logWrite?.args[6]).toBeNull(); // error_detail
  });

  it('escapes HTML-significant characters in a variable before rendering markdown', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM email_templates': CLASS_OFFER_TEMPLATE } });
    const send = vi.fn().mockResolvedValue(undefined);
    await sendClubEmail(
      db,
      { EMAIL: { send } },
      { to, templateId: 'class_offer', vars: { ...vars, person_name: '<script>alert(1)</script>' } },
    );
    const message = send.mock.calls[0][0];
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });

  it('degrades gracefully when EMAIL is unbound: no throw, a failed result, an honest log row', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM email_templates': CLASS_OFFER_TEMPLATE } });
    const result = await sendClubEmail(db, {}, { to, templateId: 'class_offer', vars });

    expect(result).toEqual({ ok: false, error: 'EMAIL binding is not configured' });
    const logWrite = calls.find((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(logWrite?.args[5]).toBe('failed');
    expect(logWrite?.args[6]).toBe('EMAIL binding is not configured');
  });

  it('answers a failed result (never throws) when the EMAIL binding itself rejects the send', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM email_templates': CLASS_OFFER_TEMPLATE } });
    const send = vi.fn().mockRejectedValue(new Error('E_SENDER_NOT_VERIFIED'));
    const result = await sendClubEmail(db, { EMAIL: { send } }, { to, templateId: 'class_offer', vars });

    expect(result).toEqual({ ok: false, error: 'E_SENDER_NOT_VERIFIED' });
    const logWrite = calls.find((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(logWrite?.args[5]).toBe('failed');
    expect(logWrite?.args[6]).toBe('E_SENDER_NOT_VERIFIED');
  });

  it('renderTemplateWithVariables produces exactly what a real send transmits (the edit ' +
    'screen\'s own preview parity guarantee)', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM email_templates': CLASS_OFFER_TEMPLATE } });
    const send = vi.fn().mockResolvedValue(undefined);
    await sendClubEmail(db, { EMAIL: { send } }, { to, templateId: 'class_offer', vars });
    const sent = send.mock.calls[0][0];

    const preview = renderTemplateWithVariables(CLASS_OFFER_TEMPLATE.subject, CLASS_OFFER_TEMPLATE.body, vars);
    expect(preview.subject).toBe(sent.subject);
    expect(preview.html).toBe(sent.html);
    expect(preview.text).toBe(sent.text);
  });

  it('answers a failed result for an unknown templateId, logging the attempt', async () => {
    const { db, calls } = fakeD1();
    const send = vi.fn();
    const result = await sendClubEmail(db, { EMAIL: { send } }, { to, templateId: 'no-such-template', vars: {} });

    expect(result).toEqual({ ok: false, error: 'no such template: no-such-template' });
    expect(send).not.toHaveBeenCalled();
    const logWrite = calls.find((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(logWrite?.args[5]).toBe('failed');
  });
});
