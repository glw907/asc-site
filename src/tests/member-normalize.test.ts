import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  normalizeNameCaps,
  normalizePhoneE164,
} from '../admin-club/lib/member-normalize.js';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Fam.One@Example.com  ')).toBe('fam.one@example.com');
  });

  it('is a no-op on an already-normalized address', () => {
    expect(normalizeEmail('fam.one@example.com')).toBe('fam.one@example.com');
  });
});

describe('normalizePhoneE164', () => {
  it('normalizes a bare 10-digit number with +1', () => {
    expect(normalizePhoneE164('9075551234')).toBe('+19075551234');
  });

  it('normalizes a formatted 10-digit number', () => {
    expect(normalizePhoneE164('(907) 555-1234')).toBe('+19075551234');
  });

  it('normalizes an 11-digit number already starting with 1', () => {
    expect(normalizePhoneE164('19075551234')).toBe('+19075551234');
  });

  it('normalizes an already-E.164 number', () => {
    expect(normalizePhoneE164('+19075551234')).toBe('+19075551234');
  });

  it('returns null for an unrecognizable format instead of throwing', () => {
    expect(normalizePhoneE164('call me')).toBeNull();
  });

  it('returns null for a too-short number', () => {
    expect(normalizePhoneE164('5551234')).toBeNull();
  });

  it('returns null for an 11-digit number not starting with 1', () => {
    expect(normalizePhoneE164('29075551234')).toBeNull();
  });
});

describe('normalizeNameCaps', () => {
  it('recases an all-uppercase two-word name', () => {
    expect(normalizeNameCaps('JERRY EDWARD')).toBe('Jerry Edward');
  });

  it('recases an all-lowercase two-word name', () => {
    expect(normalizeNameCaps('bruce lee')).toBe('Bruce Lee');
  });

  it('recases only the lowercase token, leaving the already-cased one alone', () => {
    expect(normalizeNameCaps('christian Hendrickson')).toBe('Christian Hendrickson');
  });

  it('recases a single all-uppercase surname', () => {
    expect(normalizeNameCaps('AMUNDSEN')).toBe('Amundsen');
  });

  it('recases a short all-lowercase name despite the length-3 uppercase floor', () => {
    expect(normalizeNameCaps('zan')).toBe('Zan');
  });

  it('leaves a short all-uppercase token alone (below the length-3 floor)', () => {
    expect(normalizeNameCaps('Stanbro TL')).toBe('Stanbro TL');
  });

  it('leaves a curly-quoted nickname token alone', () => {
    expect(normalizeNameCaps('David ‘DJ’')).toBe('David ‘DJ’');
  });

  it('leaves a parenthesized nickname token alone', () => {
    expect(normalizeNameCaps('Christian (CC)')).toBe('Christian (CC)');
  });

  it('leaves a middle initial and a roman-numeral suffix alone', () => {
    expect(normalizeNameCaps('James R Johnson IV')).toBe('James R Johnson IV');
  });

  it('leaves an already-correct interior-capital surname alone', () => {
    expect(normalizeNameCaps('McDonald')).toBe('McDonald');
  });

  it("leaves an already-correct apostrophe surname alone", () => {
    expect(normalizeNameCaps("O'Brien")).toBe("O'Brien");
  });

  it('leaves a name with a leading already-cased particle alone', () => {
    expect(normalizeNameCaps('The Family of Britt Goudey')).toBe('The Family of Britt Goudey');
  });
});
