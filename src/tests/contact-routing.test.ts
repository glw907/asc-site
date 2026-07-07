import { describe, it, expect } from 'vitest';
import { buildContactEmail } from '$theme/contact-routing';

describe('buildContactEmail', () => {
  it('routes a membership inquiry to the membership committee', () => {
    const email = buildContactEmail({
      name: 'Anne Bonny',
      email: 'abonny@caribbean.bay',
      phone: '(907) 555-1234',
      category: 'membership',
      message: 'How do I renew?',
    });
    expect(email.to).toBe('membership-committee@aksailingclub.org');
    expect(email.subject).toBe('[Membership] How do I renew?');
  });

  it('routes a class question to the program committee', () => {
    const email = buildContactEmail({
      name: 'Anne Bonny',
      email: 'abonny@caribbean.bay',
      phone: '(907) 555-1234',
      category: 'class',
      message: 'When does the beginner course start?',
    });
    expect(email.to).toBe('program-committee@aksailingclub.org');
    expect(email.subject).toBe('[Classes] When does the beginner course start?');
  });

  it('routes feedback to the board', () => {
    const email = buildContactEmail({
      name: 'Anne Bonny',
      email: 'abonny@caribbean.bay',
      phone: '(907) 555-1234',
      category: 'feedback',
      message: 'The dock ramp is loose.',
    });
    expect(email.to).toBe('board@aksailingclub.org');
  });

  it('falls back to the membership committee for an unrecognized category', () => {
    const email = buildContactEmail({
      name: 'Anne Bonny',
      email: 'abonny@caribbean.bay',
      phone: '(907) 555-1234',
      category: 'not-a-real-category',
      message: 'Hello',
    });
    expect(email.to).toBe('membership-committee@aksailingclub.org');
    expect(email.subject).toBe('[General] Hello');
  });

  it('takes only the message first line, capped at 60 characters, for the subject', () => {
    const longLine = 'x'.repeat(80);
    const email = buildContactEmail({
      name: 'Anne Bonny',
      email: 'abonny@caribbean.bay',
      phone: '(907) 555-1234',
      category: 'other',
      message: `${longLine}\nSecond line never appears in the subject.`,
    });
    expect(email.subject).toBe(`[General] ${'x'.repeat(60)}`);
  });

  it('carries the sender name, email, and phone in the body for a reply', () => {
    const email = buildContactEmail({
      name: 'Anne Bonny',
      email: 'abonny@caribbean.bay',
      phone: '(907) 555-1234',
      category: 'other',
      message: 'Hello there',
    });
    expect(email.text).toBe('Hello there\n\n--\nAnne Bonny\nabonny@caribbean.bay | (907) 555-1234');
  });

  it('escapes HTML-significant characters in the html body', () => {
    const email = buildContactEmail({
      name: 'Anne <Bonny>',
      email: 'abonny@caribbean.bay',
      phone: '(907) 555-1234',
      category: 'other',
      message: 'Ships & <script>alert(1)</script>',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('Ships &amp; &lt;script&gt;');
    expect(email.html).toContain('Anne &lt;Bonny&gt;');
  });
});
