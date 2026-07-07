import { test, expect } from '@playwright/test';

// The pixel-diff CI rider (plan Task 5's acceptance: "the pixel-diff rider is in the site's CI").
// This suite is a REGRESSION gate against ASC's own prior render, not a live diff against the
// north star HTML (docs/superpowers/specs/assets/2026-07-06-asc-home-northstar.html in cairn-cms):
// that file is a static mockup with no D1 data or real photography, so it served as the one-time
// build contract Task 3/4 built against, verified by a fresh-context glance read, not an ongoing
// pixel source. Once a human has confirmed a baseline matches intent, this suite catches any future
// unintended drift from it.
//
// Known limitation: wrangler dev's local D1 renders the real Season/events data shape (seeded by
// e2e/fixtures/events-seed.sql; see playwright.config.ts), but the local R2 replica the CI runner
// starts carries no media objects, so every real photo (the hero, fleet, and facilities images)
// renders as the browser's broken-image glyph with its alt text, not the actual photograph. This
// is deterministic across runs (a real layout regression still shows), so it does not weaken the
// gate; it just cannot catch a photo-specific regression, which stays a manual review concern.
// The baselines are CI-canonical: a developer's workstation that has already run `wrangler dev`
// against the real MEDIA_BUCKET (populating its own local R2 replica under the gitignored
// .wrangler/) will render the real photos instead, and diff against these broken-image baselines
// for a reason that is not a regression. Trust a red run here only after also checking it on CI,
// or after clearing the local .wrangler/state/v3/r2 replica first.
const FAMILY_WIDTHS = [320, 390, 768, 1440, 2560];

test('home — light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Ahoy!' })).toBeVisible();
  await expect(page).toHaveScreenshot('home-light.png', { fullPage: true });
});

test('home — dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Ahoy!' })).toBeVisible();
  await expect(page).toHaveScreenshot('home-dark.png', { fullPage: true });
});

// The family five-viewport bar (320/390/768/1440/2560), composed at the extremes: the masthead's
// nav collapses to the menu affordance at 320, and the page stays a deliberate, contained column
// rather than stretching edge to edge at 2560.
for (const width of FAMILY_WIDTHS) {
  test(`home — light — ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page).toHaveScreenshot(`home-light-${width}.png`, { fullPage: true });
  });
}

// The B1 editorial-pacing exemplar (the education page's schedule): real subheads, an at-a-glance
// table, and tightened prose in place of a single long wall of text.
test('education — light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/education/');
  await expect(page.getByRole('heading', { level: 1, name: 'Education' })).toBeVisible();
  await expect(page).toHaveScreenshot('education-light.png', { fullPage: true });
});

// The D1-backed /events template: the same Season listing as the home page, C7-gold taxonomy
// (a gold dot for a class or clinic, muted ink for a routine non-racing entry, plain ink for a
// regatta) reading from the seeded fixture rows.
test('events — light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/events/');
  await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
  await expect(page).toHaveScreenshot('events-light.png', { fullPage: true });
});
