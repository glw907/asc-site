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
  // Round 3, pass C (the promise hero): the page's own title ("Education") demotes to an eyebrow
  // above the h1, and the display promise takes the h1 role instead. Text matches the frontmatter
  // `promise` field (education.md), updated by a later headline pass (ad590de) that this
  // assertion had fallen behind.
  await expect(page.getByRole('heading', { level: 1, name: 'Come learn to sail with us.' })).toBeVisible();
  // The class-schedule island (unified-signup arc, ClassSchedule.svelte) reads its rows through a
  // remote query, not SSR: while the read is in flight it renders five ghost rows, a different
  // height than the one real fixture class's resolved row, so a screenshot taken before the await
  // settles flakes on height alone. Waiting for the ghost list to clear (its own `aria-busy`
  // marker) is the fix, matching the sibling long-form-pipeline test's own hydration wait below.
  await expect(page.locator('.class-schedule ul[aria-busy="true"]')).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot('education-light.png', { fullPage: true });
});

// Regression for the pipeline-ordering bug (edu-round-3): the long-form page's group split used to
// run against html the program-section and registration-band wraps had already applied, so a group
// boundary that fell inside the band's own wrapper divs cut the slice through them, leaving one
// {@html} segment with an unclosed div and the next with its stray closer. The browser's
// error-correcting parser repaired each segment independently, which duplicated the whole
// Registration-through-Questions block on hydration. 'load', not 'networkidle' (the design-probe
// script's own note: some pages keep a request open past 'load'), plus a short settle for
// hydration to finish.
test('education — long-form pipeline renders no duplicate section', async ({ page }) => {
  await page.goto('/education/', { waitUntil: 'load' });
  await page.waitForTimeout(300);

  await expect(page.locator('#how-to-register--pricing')).toHaveCount(1);

  const band = page.locator('.registration-band');
  await expect(band.locator('#how-to-register--pricing')).toHaveCount(1);
  await expect(band.locator('#swim-test-capsize-drill-and-life-jackets')).toHaveCount(0);

  const dividerLabels = page.locator('.group-divider-label');
  await expect(dividerLabels).toHaveCount(3);
  await expect(dividerLabels.nth(0)).toHaveText('Registration & logistics');
  await expect(dividerLabels.nth(1)).toHaveText('Preparing for class');
  await expect(dividerLabels.nth(2)).toHaveText('Policies & questions');
});

// The D1-backed /events template: the events-redesign pass's season spine (month waypoints,
// Off-Season and Meetings & Governance as the spine's own closing waypoints, the calendar-
// subscribe bar) reading from the seeded fixture rows in every row shape the manifest
// (docs/events-manifest.md) and the redesign brief describe. Content assertions over a screenshot
// here: the redesign intentionally breaks the prior card-grid baseline, which regenerates on CI
// post-merge rather than being hand-verified pixel-by-pixel in this suite.
test('events — light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/events/');
  await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Off-Season' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Meetings & Governance' })).toBeVisible();
  // A spine row from each section, proving the full read/group/render pipeline, not just the
  // shell: each row's name links to its own /events/[id] page.
  await expect(page.getByRole('link', { name: 'Test Regatta' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Test Off-Season Social' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Test Annual Meeting' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'iCal / Apple' })).toBeVisible();
  await expect(page).toHaveScreenshot('events-light.png', { fullPage: true });
});

for (const width of FAMILY_WIDTHS) {
  test(`events — light — ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/events/');
    await expect(page).toHaveScreenshot(`events-light-${width}.png`, { fullPage: true });
  });
}

// The real .ics feed the calendar-subscribe bar's links point at.
test('events calendar.ics — real feed', async ({ page }) => {
  const res = await page.request.get('/events/calendar.ics');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/calendar');
  const body = await res.text();
  expect(body).toContain('BEGIN:VCALENDAR');
  expect(body).toContain('SUMMARY:Test Regatta');
  expect(body).toContain('UID:test-regatta@aksailingclub.org');
});

// The per-event page (a real event, with a photo-less placeholder in this fixture): the facts
// slab, the description, and the register/signup action zone all render off the same seeded row.
test('event detail — light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/events/test-regatta');
  await expect(page.getByRole('heading', { level: 1, name: 'Test Regatta' })).toBeVisible();
  await expect(page.getByText('10:00 AM')).toBeVisible();
  await expect(page.getByRole('definition').getByText('Alaska Sailing Club', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add to calendar' })).toBeVisible();
  await expect(page).toHaveScreenshot('event-detail-light.png', { fullPage: true });
});

// The per-class page: the same route, keyed by the class's own id (never its season-scoped slug),
// carrying the fee fact and its internal signup-route action instead of an outbound register link.
test('class detail — light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/events/test-intro-class');
  await expect(page.getByRole('heading', { level: 1, name: 'Test Intro Class' })).toBeVisible();
  await expect(page.getByText('$150')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/classes/test-intro-class/signup');
  await expect(page).toHaveScreenshot('class-detail-light.png', { fullPage: true });
});

// The public join door (plan Task 8, the unified-signup arc): tier selection with live
// settings-driven prices, the purchaser's own fields, and the optional class-pick list, reading
// the same fixture classes/settings the join-and-class-door functional spec exercises. The
// Turnstile widget's own script is blocked here for the same reason the functional spec blocks
// it (join-and-class-door.spec.ts's own header): left unblocked, a real network path to
// Cloudflare's challenge platform renders non-deterministic third-party widget content this
// suite has no reason to pixel-diff.
test('join apply — light', async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/join/apply/');
  await expect(page.getByRole('heading', { level: 1, name: 'Join the club' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Individual/ })).toBeVisible();
  await expect(page).toHaveScreenshot('join-apply-light.png', { fullPage: true });
});

for (const width of FAMILY_WIDTHS) {
  test(`join apply — light — ${width}px`, async ({ page }) => {
    await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/join/apply/');
    await expect(page).toHaveScreenshot(`join-apply-light-${width}.png`, { fullPage: true });
  });
}

// /events/[id].ics: the per-event add-to-calendar endpoint, exactly one VEVENT.
test('event detail .ics — real feed', async ({ page }) => {
  const res = await page.request.get('/events/test-regatta.ics');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/calendar');
  const body = await res.text();
  expect(body).toContain('UID:test-regatta@aksailingclub.org');
  expect(body.indexOf('BEGIN:VEVENT', body.indexOf('BEGIN:VEVENT') + 1)).toBe(-1);
});
