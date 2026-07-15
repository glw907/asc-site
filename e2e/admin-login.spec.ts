import { test, expect } from '@playwright/test';
import { mintAdminSession } from './helpers/admin-session';

// The admin e2e login helper's own proof: a minted owner session reaches /admin and renders the
// split-desk sidebar (docs/2026-07-14-admin-roles-navlayout-design.md#phase-2) with no
// magic-link email loop. DOM assertions only, no screenshot baseline: the admin surface stays
// out of the pixel-diff visual suite (site-visual.spec.ts's own header explains why that suite
// exists at all).
test('an owner-role editor session renders the admin sidebar', async ({ page, context }) => {
  await mintAdminSession(context);
  await page.goto('/admin');

  const sidebar = page.getByRole('navigation', { name: 'Site content' });
  await expect(sidebar).toBeVisible();
  // A stable subset per the task's own acceptance, not every leaf: the split-desk tree's Club
  // group, and the Content group's Posts entry.
  await expect(sidebar.getByText('Club', { exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Posts' })).toBeVisible();
});
