// Initiative 5 Task 4: proves the adapter's declared navLayout tree
// (docs/2026-07-14-admin-roles-navlayout-design.md#phase-2) through cairn's own
// resolveNavLayout, the same primitive the admin shell resolves a request's sidebar with.
import { describe, expect, it } from 'vitest';
import { resolveNavLayout, type ResolvedLayoutSection } from '@glw907/cairn-cms/sveltekit';
import { navLayout } from '$theme/cairn.config.js';

/** The context resolveNavLayout needs beyond the tree itself, matching the site's real
 *  concepts and configured nav menu so the acceptance criteria (every engine screen
 *  referenced, no navMenu-gated `nav` throwing) hold the same way the real admin build does.
 *  0.88 replaced the loose `capability`/`role` pair with a single `editor: Editor`, the same
 *  shape `locals.editor` carries; this stub fills the two fields the resolver doesn't read
 *  (`email`/`displayName`) with fixed placeholders. `role` covers the reserved, un-granted
 *  `owner` plus the T2 vocabulary's granted names (docs/2026-07-19-asc-roles-adoption.md). */
function opts(role: 'owner' | 'Administrator' | 'Club manager' | 'Instructor', capability: 'owner' | 'editor' | 'none') {
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
    editor: {
      email: 'editor@example.com',
      displayName: 'Test Editor',
      role,
      capability,
    },
  };
}

function sectionLabels(items: ReturnType<typeof resolveNavLayout>['items']): string[] {
  return items.map((item) => item.label);
}

describe('the declared navLayout tree', () => {
  it('resolves all five groups for an Administrator', () => {
    const resolved = resolveNavLayout(opts('Administrator', 'owner'));
    expect(sectionLabels(resolved.items)).toEqual(['Club', 'Outreach', 'Boats & Gear', 'Content', 'Site']);
  });

  it('resolves all five groups for a Club manager', () => {
    const resolved = resolveNavLayout(opts('Club manager', 'editor'));
    expect(sectionLabels(resolved.items)).toEqual(['Club', 'Outreach', 'Boats & Gear', 'Content', 'Site']);
  });

  it('resolves no club groups and no engine screens for an Instructor', () => {
    const resolved = resolveNavLayout(opts('Instructor', 'none'));
    expect(resolved.items).toEqual([]);
  });

  it('leaves the fallback group empty: every engine screen is referenced', () => {
    const resolved = resolveNavLayout(opts('Administrator', 'owner'));
    expect(resolved.fallback).toEqual([]);
  });

  it('gates the Club settings entry to Administrator/Club manager inside the Site group', () => {
    const resolved = resolveNavLayout(opts('Administrator', 'owner'));
    const site = resolved.items.find((item) => item.label === 'Site') as ResolvedLayoutSection;
    expect(site.children.map((child) => child.label)).toContain('Club settings');
  });

  it('carries distinct labels for the two settings screens, resolving the collision', () => {
    const resolved = resolveNavLayout(opts('Administrator', 'owner'));
    const site = resolved.items.find((item) => item.label === 'Site') as ResolvedLayoutSection;
    const labels = site.children.map((child) => child.label);
    expect(labels).toContain('Club settings');
    expect(labels).toContain('Site settings');
  });

  // T2 (docs/2026-07-19-asc-roles-adoption.md): the reserved `owner` role stays declared for
  // `defineRoles`'s own sake, but is never granted club access -- only `Administrator` is. This
  // proves the phantom carries no club-gated entries, matching the layout guard's own denial
  // (`club-layout-guard.test.ts`).
  it('resolves no club groups for the reserved, un-granted owner role', () => {
    const resolved = resolveNavLayout(opts('owner', 'owner'));
    expect(sectionLabels(resolved.items)).toEqual(['Content', 'Site']);
    const site = resolved.items.find((item) => item.label === 'Site') as ResolvedLayoutSection;
    expect(site.children.map((child) => child.label)).not.toContain('Club settings');
  });
});
