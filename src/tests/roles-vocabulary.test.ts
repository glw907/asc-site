import { describe, expect, it } from 'vitest';
import { ownerLevelRoles, resolveCapability } from '@glw907/cairn-cms';
import { roles } from '$theme/cairn.config.js';

describe('the declared role vocabulary', () => {
  it('maps the reserved owner to owner capability', () => {
    expect(resolveCapability(roles, 'owner')).toBe('owner');
  });

  it('maps Administrator to owner capability', () => {
    expect(resolveCapability(roles, 'Administrator')).toBe('owner');
  });

  it('maps Club manager to editor capability', () => {
    expect(resolveCapability(roles, 'Club manager')).toBe('editor');
  });

  it('maps Webmaster to editor capability', () => {
    expect(resolveCapability(roles, 'Webmaster')).toBe('editor');
  });

  it('maps Publisher to editor capability', () => {
    expect(resolveCapability(roles, 'Publisher')).toBe('editor');
  });

  it('maps Instructor to none capability', () => {
    expect(resolveCapability(roles, 'Instructor')).toBe('none');
  });

  it('maps an undeclared name to none capability', () => {
    expect(resolveCapability(roles, 'guest')).toBe('none');
  });

  it('counts exactly owner and Administrator as owner-level, the last-owner guard\'s set', () => {
    expect(new Set(ownerLevelRoles(roles))).toEqual(new Set(['owner', 'Administrator']));
  });
});
