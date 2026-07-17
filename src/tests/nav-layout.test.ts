// Initiative 5 Task 4: proves the adapter's declared navLayout tree
// (docs/2026-07-14-admin-roles-navlayout-design.md#phase-2) through cairn's own
// resolveNavLayout, the same primitive the admin shell resolves a request's sidebar with.
import { describe, expect, it } from 'vitest';
import { resolveNavLayout, type ResolvedLayoutSection } from '@glw907/cairn-cms/sveltekit';
import { navLayout } from '$theme/cairn.config.js';

/** The context resolveNavLayout needs beyond the tree itself, matching the site's real
 *  concepts and configured nav menu so the acceptance criteria (every engine screen
 *  referenced, no navMenu-gated `nav` throwing) hold the same way the real admin build does. */
function opts(role: 'owner' | 'club-admin' | 'instructor', capability: 'owner' | 'editor' | 'none') {
  return {
    layout: navLayout,
    adminNav: [],
    concepts: [
      { id: 'posts', label: 'Posts' },
      { id: 'pages', label: 'Pages' },
      { id: 'bulletins', label: 'Bulletins' },
      { id: 'fragments', label: 'Fragments' },
      { id: 'notifications', label: 'Notifications' },
    ],
    navMenuLabel: 'Navigation',
    capability,
    role,
  };
}

function sectionLabels(items: ReturnType<typeof resolveNavLayout>['items']): string[] {
  return items.map((item) => item.label);
}

describe('the declared navLayout tree', () => {
  it('resolves all five groups for an owner', () => {
    const resolved = resolveNavLayout(opts('owner', 'owner'));
    expect(sectionLabels(resolved.items)).toEqual(['Club', 'Outreach', 'Boats & Gear', 'Content', 'Site']);
  });

  it('resolves all five groups for a club-admin', () => {
    const resolved = resolveNavLayout(opts('club-admin', 'editor'));
    expect(sectionLabels(resolved.items)).toEqual(['Club', 'Outreach', 'Boats & Gear', 'Content', 'Site']);
  });

  it('resolves no club groups and no engine screens for an instructor', () => {
    const resolved = resolveNavLayout(opts('instructor', 'none'));
    expect(resolved.items).toEqual([]);
  });

  it('leaves the fallback group empty: every engine screen is referenced', () => {
    const resolved = resolveNavLayout(opts('owner', 'owner'));
    expect(resolved.fallback).toEqual([]);
  });

  it('gates the Club settings entry to owner/club-admin inside the Site group', () => {
    const resolved = resolveNavLayout(opts('owner', 'owner'));
    const site = resolved.items.find((item) => item.label === 'Site') as ResolvedLayoutSection;
    expect(site.children.map((child) => child.label)).toContain('Club settings');
  });

  it('carries distinct labels for the two settings screens, resolving the collision', () => {
    const resolved = resolveNavLayout(opts('owner', 'owner'));
    const site = resolved.items.find((item) => item.label === 'Site') as ResolvedLayoutSection;
    const labels = site.children.map((child) => child.label);
    expect(labels).toContain('Club settings');
    expect(labels).toContain('Site settings');
  });
});
