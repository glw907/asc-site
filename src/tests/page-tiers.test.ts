import { describe, it, expect } from 'vitest';
import { isPrimaryPage } from '$theme/page-tiers';

describe('isPrimaryPage', () => {
  it.each(['education', 'racing', 'events', 'join', 'members', 'contact'])(
    'is true for the primary nav slug %s',
    (slug) => {
      expect(isPrimaryPage(slug)).toBe(true);
    },
  );

  it('excludes home', () => {
    expect(isPrimaryPage('')).toBe(false);
  });

  it('excludes a Members nav child', () => {
    expect(isPrimaryPage('new-member-guide')).toBe(false);
  });

  it('excludes an arbitrary interior slug', () => {
    expect(isPrimaryPage('bylaws')).toBe(false);
  });
});
