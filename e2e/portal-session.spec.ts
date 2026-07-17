import { test, expect } from '@playwright/test';
import { mintMemberSession } from './helpers/member-session';

// The member-session helper's own proof (T5a, the seeding infrastructure only -- a later task
// writes the real visual spec on top of this): a minted member session against the portal
// fixture household (e2e/fixtures/portal-seed.sql) reaches /my-account already signed in and
// renders the landing, not the sign-in form. DOM assertions only, no screenshot baseline: this
// spec's own job is proving the session mint works, not grading the redesign in flight.
//
// Assertions deliberately avoid the greeting itself: the redesign replaces "Hi, {name}" with
// "Welcome back, {firstName}.", so asserting on either wording would break on a cosmetic change.
// The member's own surname and the standing date survive both wordings.
test('a minted member session loads /my-account signed in, not the sign-in form', async ({ page, context }) => {
  await mintMemberSession(context);
  await page.goto('/my-account');

  await expect(page.getByText('Wright', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toHaveCount(0);
});

// The fixture drift guard (portal-seed.sql's own DRIFT note carries the full reasoning): the
// seeded household's stored dates are fixed literals, but its DERIVED standing is measured
// against the real server clock, so it crosses into the 60-day renewal window on 2027-03-18 and
// the landing switches to the renewal masthead on its own. That would change the visual
// baselines with nothing in the diff to explain it. This assertion turns that crossing into a
// legible failure naming the fix instead.
//
// The renew affordance is named "Renew" on the pre-redesign landing and "Renew for {season}" on
// the redesigned masthead, so the prefix match holds across the rebuild. Note this only bites
// once T2's masthead exists: before then the pre-redesign landing gates its renew form on
// standing.status alone, which stays 'current' until 2027-05-17 regardless of the window.
//
// `.first()` (T3): the landing renders both the desktop and mobile masthead at once (CSS alone
// toggles which is visible, per viewport, matching the design doc's "not a collapse" ruling), so
// the standing sentence exists twice in the DOM -- the same reason the test above already scopes
// its own `getByText('Wright', ...)` the same way.
test('the portal fixture still reads as the routine in-season state, not renewal season', async ({ page, context }) => {
  await mintMemberSession(context);
  await page.goto('/my-account');

  await expect(page.getByText('May 17, 2027', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Renew/ })).toHaveCount(0);
});
