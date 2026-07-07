import { describe, it, expect } from 'vitest';
import { REDIRECTS, GOVERNANCE_SUBPAGE_SLUGS } from '$theme/redirects';

// Pins the two completion-pass fixes that live in this data-only module (manifest items 10 and
// 11), so a later edit to REDIRECTS cannot silently drop either without a red test.
describe('redirects', () => {
  it('sends the old Hugo RSS path to the SvelteKit-owned feed route', () => {
    expect(REDIRECTS['index.xml']).toBe('feed.xml');
  });

  it('derives the governance subpage set from the governance/* redirect keys', () => {
    expect(GOVERNANCE_SUBPAGE_SLUGS.has('bylaws')).toBe(true);
    expect(GOVERNANCE_SUBPAGE_SLUGS.has('ascca-bylaws')).toBe(true);
    expect(GOVERNANCE_SUBPAGE_SLUGS.has('articles-of-incorporation')).toBe(true);
    expect(GOVERNANCE_SUBPAGE_SLUGS.has('determination-letter')).toBe(true);
    expect(GOVERNANCE_SUBPAGE_SLUGS.has('elections')).toBe(true);
    expect(GOVERNANCE_SUBPAGE_SLUGS.has('committees')).toBe(true);
    expect(GOVERNANCE_SUBPAGE_SLUGS.has('mat-su-borough-land-management-agreement')).toBe(true);
    // A members-section redirect is not a governance subpage.
    expect(GOVERNANCE_SUBPAGE_SLUGS.has('welcome')).toBe(false);
  });
});
