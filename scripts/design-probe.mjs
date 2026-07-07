#!/usr/bin/env node
// The design-polish pass's pre-review gate (2026-07-07): four hard-fail checks against every
// band-composed page (an image cropped away from its natural shape, a stray fixed/absolute
// element parked over the top-left corner, a horizontal-overflow regression, an unstyled list or
// table sitting inside a designed band) plus one soft warning (two adjacent bands repeating the
// identical background). This script is not scoped to any one pass; a future page or component
// keeps running through it.
//
// Targets BASE_URL if set (point it at a running `wrangler dev` or a deployed environment); with
// no BASE_URL it spawns `vite preview` against the already-built `.svelte-kit` output and tears it
// down on exit. `npm run build` must have already run. `vite preview` carries no Cloudflare
// platform bindings (see playwright.config.ts's own note on this), so the Season band and every
// real photo can render as an empty state or a broken image there; the checks below treat a
// broken image (zero natural size) as unverifiable rather than a violation, so that known gap
// never produces a false failure.
import { createRequire } from 'module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const DEFAULT_BASE_URL = 'http://localhost:4173';
const BASE_URL = process.env.BASE_URL || DEFAULT_BASE_URL;

// The site-wide band rule (site.css carries the same line): only a landing-style page composes
// full-bleed alternating bands (a `.home-shell`-marked root breaking out of the shared reading
// column); every other page stays plain article or list flow inside that column. A page's OWN
// components can still tint a section locally for their own reasons (EventsListing's month
// groups alternate their own background as a zebra-stripe readability aid, entirely inside the
// normal reading column); that is a different, smaller-scale device than page-level band
// composition and not what this rule governs. Home is the only band-composed page today; a
// future page that adopts the same full-bleed composition adds its path here.
const HOME_PATH = '/';
const BAND_COMPOSED_PAGES = [HOME_PATH];

const OVERFLOW_WIDTHS = [320, 390, 1440];
const RATIO_TOLERANCE = 0.12;
const CORNER_BOX = { width: 200, height: 200 };

/** Wait for `url` to answer, polling every 300ms up to `timeoutMs`. */
async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {
      // Not up yet; keep polling.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Start `vite preview` on the default port and resolve once it answers, or null if BASE_URL was
 *  already reachable (nothing to tear down). */
async function ensureServer() {
  if (await waitForServer(BASE_URL, 1000)) return null;
  if (process.env.BASE_URL) {
    throw new Error(`BASE_URL=${BASE_URL} is not reachable; start that server first.`);
  }
  const child = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'ignore',
  });
  const up = await waitForServer(BASE_URL, 30_000);
  if (!up) {
    child.kill();
    throw new Error('vite preview did not come up within 30s; run `npm run build` first.');
  }
  return child;
}

/** A page navigation shared by every check below. 'load', not 'networkidle': the contact/donate
 *  forms mount a Turnstile widget that keeps an open request against an external host with no
 *  sandbox internet access, which networkidle would wait on forever. A short settle after 'load'
 *  is enough for every check here (rendered geometry, computed style), none of which depend on
 *  that widget. */
async function open(browser, path, viewport) {
  const page = await browser.newPage();
  await page.setViewportSize(viewport);
  await page.goto(BASE_URL + path, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  return page;
}

/** Check (a): every <img>'s rendered box ratio against its natural ratio, skipping a broken image
 *  (no natural size to compare) and an explicit `data-crop` opt-out. */
async function checkImageRatios(page, path, offenders) {
  const results = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map((img) => {
      const r = img.getBoundingClientRect();
      return {
        src: img.currentSrc || img.src,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        renderedWidth: r.width,
        renderedHeight: r.height,
        cropOptOut: img.getAttribute('data-crop'),
      };
    });
  });
  for (const img of results) {
    if (img.cropOptOut) continue;
    if (!img.naturalWidth || !img.naturalHeight || !img.renderedWidth || !img.renderedHeight) continue;
    const naturalRatio = img.naturalWidth / img.naturalHeight;
    const renderedRatio = img.renderedWidth / img.renderedHeight;
    const divergence = Math.abs(renderedRatio - naturalRatio) / naturalRatio;
    if (divergence > RATIO_TOLERANCE) {
      offenders.push(
        `${path}: ${img.src} natural ${naturalRatio.toFixed(3)} vs rendered ${renderedRatio.toFixed(3)} ` +
          `(${(divergence * 100).toFixed(1)}% divergence)`,
      );
    }
  }
}

/** Check (b): a visible fixed/absolute element parked over the viewport's top-left 200x200 at
 *  load, the stray-popover class of bug. */
async function checkStrayCorner(page, path, offenders) {
  const found = await page.evaluate((box) => {
    const hits = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      // A visually-hidden accessibility node (SvelteKit's own `#svelte-announcer` aria-live
      // region, or a hand-rolled sr-only span) renders as a 1x1 point; that is not the
      // meaningfully-sized stray element this check is hunting for.
      if (r.width <= 4 || r.height <= 4) continue;
      const intersects = r.left < box.width && r.top < box.height && r.right > 0 && r.bottom > 0;
      if (intersects) hits.push(el.tagName + (el.className ? `.${String(el.className).split(' ').join('.')}` : ''));
    }
    return hits;
  }, CORNER_BOX);
  for (const hit of found) offenders.push(`${path}: ${hit} intersects the top-left ${CORNER_BOX.width}x${CORNER_BOX.height} corner`);
}

/** Check (c): horizontal overflow at the given width. */
async function checkOverflow(page, path, width, offenders) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  if (overflow.scrollWidth > overflow.clientWidth) {
    offenders.push(`${path} @ ${width}px: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`);
  }
}

/** Check (d): a <ul>/<ol>/<table> inside a `<section>` (a designed band) with no author class,
 *  rendering the UA default list marker or table border. */
async function checkUnstyledBandLists(page, path, offenders) {
  const found = await page.evaluate(() => {
    const hits = [];
    for (const section of document.querySelectorAll('section')) {
      for (const el of section.querySelectorAll('ul, ol, table')) {
        if (el.className.trim() !== '') continue;
        const cs = getComputedStyle(el);
        const isDefaultList = (el.tagName === 'UL' && cs.listStyleType === 'disc') || (el.tagName === 'OL' && cs.listStyleType === 'decimal');
        const isDefaultTable = el.tagName === 'TABLE' && cs.borderCollapse === 'separate' && cs.borderSpacing !== '0px 0px';
        if (isDefaultList || isDefaultTable) hits.push(el.tagName.toLowerCase());
      }
    }
    return hits;
  });
  for (const tag of found) offenders.push(`${path}: unstyled <${tag}> in a designed band (no author class, UA default marker/border)`);
}

/** Check (e), soft: on a band-composed page, adjacent full-width bands must not repeat the
 *  identical background. A section with no background (transparent, the page's own ground
 *  showing through) never counts as a "band" for this comparison; only two visibly-tinted
 *  neighbors repeating the same color are worth a human's eyes. */
async function checkBandAlternation(page, path, warnings) {
  const sequence = await page.evaluate(() => {
    // `.home-shell` is the same band-composition marker `:has(> .home-shell)` reads in site.css;
    // a future band-composed page carries the same marker class on its own root.
    const root = document.querySelector('.home-shell');
    if (!root) return [];
    return Array.from(root.children)
      .filter((el) => el.tagName === 'SECTION')
      .map((el) => getComputedStyle(el).backgroundColor);
  });
  const isTransparent = (bg) => bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
  const repeats = [];
  for (let i = 1; i < sequence.length; i++) {
    if (isTransparent(sequence[i]) || isTransparent(sequence[i - 1])) continue;
    if (sequence[i] === sequence[i - 1]) repeats.push(i);
  }
  warnings.push(`${path}: band sequence [${sequence.map((c) => (isTransparent(c) ? '—' : c)).join(', ')}]`);
  if (repeats.length > 0) {
    warnings.push(`${path}: WARN adjacent bands repeat the identical background at position(s) ${repeats.join(', ')}`);
  }
}

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch();
  const offenders = [];
  const warnings = [];

  try {
    // The four hard-fail checks plus the band-alternation warning, against every band-composed
    // page (today, just home). A future band-composed page joins BAND_COMPOSED_PAGES and picks up
    // every check here for free.
    for (const path of BAND_COMPOSED_PAGES) {
      const page = await open(browser, path, { width: 1440, height: 900 });
      await checkImageRatios(page, path, offenders);
      await checkStrayCorner(page, path, offenders);
      await checkUnstyledBandLists(page, path, offenders);
      await checkBandAlternation(page, path, warnings);
      await page.close();

      for (const width of OVERFLOW_WIDTHS) {
        const overflowPage = await open(browser, path, { width, height: 900 });
        await checkOverflow(overflowPage, path, width, offenders);
        await overflowPage.close();
      }
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  if (warnings.length > 0) {
    console.warn('design-probe: warnings (not fatal)');
    for (const w of warnings) console.warn(`  ${w}`);
  }

  if (offenders.length > 0) {
    console.error('design-probe: FAILED');
    for (const o of offenders) console.error(`  ${o}`);
    process.exit(1);
  }

  console.log('design-probe: all checks passed');
}

main().catch((err) => {
  console.error('design-probe: crashed:', err);
  process.exit(1);
});
