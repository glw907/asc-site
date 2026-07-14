import { test, expect } from '@playwright/test';

// The unified-signup arc's own functional e2e (plan Task 8, docs/2026-07-13-unified-signup-
// design.md's Testing section): the public join door's happy path and the class-door standing
// gate's no-match pivot, both against the real asc-club schema and fixture data
// (e2e/fixtures/bootstrap-club-db.mjs, e2e/fixtures/events-seed.sql, e2e/fixtures/signup-seed.sql
// -- the latter clears the member/household/membership domain before every run, so a purchaser or
// class-door email never collides with a previous run's rows).
//
// Neither STRIPE_SECRET_KEY nor TURNSTILE_SECRET_KEY is bound locally (.dev.vars carries
// neither): `createCheckout` degrades to `{ stub: true }` instead of redirecting to Stripe
// (payments.ts's own header), and `verifyTurnstile` is skipped entirely when no secret is bound
// (join-apply-form.ts/class-signup-form.ts both gate the check on `platformEnv?.TURNSTILE_SECRET_KEY`
// truthiness) -- so neither submission below needs a real token. The client-side widget itself
// still tries to load and run a real challenge against Cloudflare's own service, though, and a
// headless/automated browser cannot complete one; left unblocked, the widget's own repeated
// challenge-platform retries throw an uncaught page error ("[Cloudflare Turnstile] Error:
// 110200") that SvelteKit's client error boundary catches, replacing the page with a generic 500
// -- not an application bug (confirmed against the real dev server: the join/class-door flows
// both complete correctly once the widget's own network calls are blocked). Both specs abort
// requests to the widget's own domain before navigating, the standard e2e pattern for stubbing
// out a third-party service this suite never needs a real answer from.
test.beforeEach(async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
});

// The portal renew action needs an authenticated member session, and this suite carries no
// member-auth login helper (only the editor/admin Access flow is exercised anywhere in this
// repo's tests); per the task, that flow is skipped here rather than building auth machinery
// from scratch.

test('join happy path: individual tier submits and surfaces the stub checkout degradation', async ({ page }) => {
  await page.goto('/join/apply/');
  await expect(page.getByRole('heading', { level: 1, name: 'Join the club' })).toBeVisible();

  await page.getByRole('radio', { name: /Individual/ }).check();
  await page.getByPlaceholder('Full name').fill('Pat Purchaser');
  await page.getByPlaceholder('Email address').fill('pat.purchaser@example.com');

  await page
    .getByRole('checkbox', { name: /I have read and accept the liability release/ })
    .check();

  await page.getByRole('button', { name: 'Join and continue to payment' }).click();

  await expect(
    page.getByText("Online payment isn't available yet; the club will follow up by email with how to pay."),
  ).toBeVisible();
});

test('class-door pivot: an unknown email at the class door invites into join, carrying the class', async ({
  page,
}) => {
  await page.goto('/classes/test-intro-class/signup');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign up: Test Intro Class' })).toBeVisible();

  await page.getByRole('group', { name: 'Full name' }).getByRole('textbox').fill('Casey Classdoor');
  const emailField = page.getByRole('group', { name: 'Email address' }).getByRole('textbox');
  await emailField.fill('casey.classdoor@example.com');
  // The page's own email-blur probe (checkKnownEmail then checkClassEligibility) pivots the page
  // into the join invitation as soon as an unknown email loses focus, ahead of any submit click
  // -- the same outcome a full server-side submit answers, and the page's own primary path with
  // JS available (class-signup/+page.svelte's own header comment). Blurring is enough; a
  // subsequent submit click would find the form already replaced by the pivot panel.
  await emailField.blur();

  await expect(page.getByText('Classes are for current members.')).toBeVisible();
  const joinLink = page.getByRole('link', { name: 'Join the club' });
  await expect(joinLink).toBeVisible();

  const href = await joinLink.getAttribute('href');
  const url = new URL(href ?? '', 'http://localhost');
  expect(url.pathname).toBe('/join/apply');
  expect(url.searchParams.get('class')).toBe('test-intro-class');
  expect(url.searchParams.get('name')).toBe('Casey Classdoor');
  expect(url.searchParams.get('email')).toBe('casey.classdoor@example.com');
});
