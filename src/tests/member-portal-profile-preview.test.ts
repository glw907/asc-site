import { describe, expect, it } from 'vitest';
import { profilePreviewLines } from '$member-portal/lib/profile-preview';

const NO_EXTRAS = { hasPositions: false, hasMemberships: false, boatCount: 0, hasAddress: false };
const ALL_EXTRAS = { hasPositions: true, hasMemberships: true, boatCount: 2, hasAddress: true };

describe('profilePreviewLines', () => {
  it('says "not listed" for hidden, and nothing else beyond the roster line', () => {
    expect(profilePreviewLines('hidden', ALL_EXTRAS)).toEqual([
      'Not listed in the member directory.',
      'Your name always shows on any committee roster you belong to, no matter this setting.',
    ]);
  });

  it('shows name-only for partial, with no address even when one exists', () => {
    expect(profilePreviewLines('partial', ALL_EXTRAS)).toEqual([
      'Name only, no contact details.',
      'Your positions show in the directory.',
      'Your committee memberships show in the directory.',
      'Your boats show in the directory.',
      'Your name always shows on any committee roster you belong to, no matter this setting.',
    ]);
  });

  it('shows full contact plus the address for visible', () => {
    expect(profilePreviewLines('visible', ALL_EXTRAS)).toEqual([
      'Name, email, and phone visible to other members.',
      'Your positions show in the directory.',
      'Your committee memberships show in the directory.',
      'Your boats show in the directory.',
      'Your household address shows in the directory.',
      'Your name always shows on any committee roster you belong to, no matter this setting.',
    ]);
  });

  it('omits every optional line when the member has none of those facts', () => {
    expect(profilePreviewLines('visible', NO_EXTRAS)).toEqual([
      'Name, email, and phone visible to other members.',
      'Your name always shows on any committee roster you belong to, no matter this setting.',
    ]);
  });

  it('singularizes the boat line for exactly one boat', () => {
    expect(profilePreviewLines('visible', { ...NO_EXTRAS, boatCount: 1 })).toContain('Your boat shows in the directory.');
  });

  it('never shows the address at partial even with one on file', () => {
    expect(profilePreviewLines('partial', { ...NO_EXTRAS, hasAddress: true })).not.toContain('Your household address shows in the directory.');
  });
});
