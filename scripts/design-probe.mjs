#!/usr/bin/env node
// The design-polish pass's pre-review gate (2026-07-07): four hard-fail checks against every
// band-composed page (an image cropped away from its natural shape, a stray fixed/absolute
// element parked over the top-left corner, a horizontal-overflow regression, an unstyled list or
// table sitting inside a designed band) plus one soft warning (two adjacent bands repeating the
// identical background). This script is not scoped to any one pass; a future page or component
// keeps running through it.
//
// The 2026-07-15 invisible-polish pass banked three standing gates on top of those (batch C of
// docs/plans/2026-07-15-invisible-polish-fixes.md): two hard-fail source-CSS checks (every named
// interactive class's `:hover` rule has a matching `:focus-visible` rule; the named button
// families each declare an `:active` rule) that guard that pass's own interaction-state work
// against regressing unnoticed, plus one soft rendered-page check (touch target size at 390px).
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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const DEFAULT_BASE_URL = 'http://localhost:4173';
const BASE_URL = process.env.BASE_URL || DEFAULT_BASE_URL;
const REPO_ROOT = new URL('..', import.meta.url).pathname;

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
      // Any answer short of a server error means the server is up (a 404 still means it is
      // listening); only a 5xx or a thrown connection error keeps polling.
      if (res.status < 500) return true;
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

// ─── Standing gates from the 2026-07-15 invisible-polish pass (checks f, g, h below) ───────
// Checks (f) and (g) read every stylesheet this site authors itself (src/theme/*.css and every
// component/route <style> block under src/theme and src/routes) rather than rendering a page:
// a browser only ever applies :hover/:focus-visible/:active from real user input, so the source
// CSS is the only place these rules can be verified to exist at all. Check (h) is the one
// browser-rendered check of the three, alongside the existing band checks above.

const CSS_SOURCE_ROOTS = ['src/theme', 'src/routes'];
const INTERACTION_PSEUDOS = [':hover', ':focus-visible', ':active'];
const MIN_TOUCH_TARGET = 40;
const ACTIVE_REQUIRED_FAMILIES = [
  'cta-btn',
  'cta-btn-quiet',
  'asc-cta-btn',
  'nav-link',
  'mobile-link',
  'theme-toggle',
  'search-trigger',
  'donate-link',
  'ghost-btn',
];

/** Every source file under the given roots ending in .css or .svelte. */
function findCssSourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.css') || entry.name.endsWith('.svelte')) files.push(full);
    }
  };
  for (const root of CSS_SOURCE_ROOTS) walk(join(REPO_ROOT, root));
  return files;
}

/** The stylesheet text a file contributes: the whole file for `.css`, the `<style>` block's
 *  contents for `.svelte` (a component with no `<style>` block contributes nothing). */
function cssTextOf(file) {
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.css')) return text;
  const match = text.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return match ? match[1] : '';
}

/** Splits `str` on top-level occurrences of a one-character separator predicate, ignoring
 *  anything inside parentheses: a selector's `:not(.a, .b)` argument, or a compound's
 *  `:not(.not-prose-links *)` clause, never counts as a split point. */
function splitTopLevel(str, isSeparator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && isSeparator(ch)) {
      if (current.trim() !== '') parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

/** The last compound selector in a chain, the target a trailing pseudo-class actually
 *  attaches to: splits on top-level combinators (whitespace, `>`, `+`, `~`) and keeps the
 *  final segment, so `.prose a.asc-card-link:hover` yields `a.asc-card-link:hover` and a
 *  descendant-only rule like `.jump-links a:hover` yields the bare `a:hover`. */
function lastCompound(selector) {
  const compounds = splitTopLevel(selector, (ch) => /[\s>+~]/.test(ch));
  return compounds[compounds.length - 1] ?? '';
}

/** The class names a compound selector declares on its own target element, ignoring anything
 *  inside a functional pseudo-class argument: `a:not(.asc-card-link):hover` never counts
 *  `.asc-card-link` as this compound's own class, so a bare, chassis-styled prose anchor never
 *  reads as "a class selector" the way a dedicated `.search-trigger` does. */
function ownClasses(compound) {
  const stripped = compound.replace(/:[a-zA-Z-]+\([^)]*\)/g, '');
  return new Set([...stripped.matchAll(/\.[A-Za-z0-9_-]+/g)].map((m) => m[0].slice(1)));
}

/** Every rule in every site-authored stylesheet whose selector ends in one of the three
 *  interaction pseudo-classes, flattened to one entry per individual selector (a comma-
 *  separated list splits) with its terminal compound's own class set attached. The shared
 *  bracket regex matches the innermost `selector { body }` pairs regardless of an unmatched
 *  enclosing `@media { ... }` brace, so an `@media (prefers-reduced-motion: reduce)` wrapper
 *  never hides the rules inside it; none of these files nest a rule inside another rule
 *  (Tailwind-v4 `&:hover` nesting), so this stays a flat, single-pass extraction. */
function collectInteractionRules() {
  const rules = [];
  for (const file of findCssSourceFiles()) {
    const css = cssTextOf(file);
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = ruleRe.exec(css))) {
      for (const selector of splitTopLevel(match[1], (ch) => ch === ',')) {
        const pseudo = INTERACTION_PSEUDOS.find((p) => selector.endsWith(p));
        if (!pseudo) continue;
        rules.push({ file, selector, pseudo, classes: ownClasses(lastCompound(selector)) });
      }
    }
  }
  return rules;
}

/** Check (f): every class-targeted `:hover` rule must have a matching `:focus-visible` rule
 *  reaching the same class somewhere in the site's own CSS. A bare-tag prose anchor styled
 *  only through an ancestor class (`.jump-links a:hover`) is not "a class selector" by this
 *  rule's own reading and relies on the chassis's shared `a:focus-visible` instead. */
function checkHoverFocusParity(offenders) {
  const rules = collectInteractionRules();
  const focusVisibleClasses = new Set();
  for (const rule of rules) {
    if (rule.pseudo === ':focus-visible') for (const c of rule.classes) focusVisibleClasses.add(c);
  }
  for (const rule of rules) {
    if (rule.pseudo !== ':hover' || rule.classes.size === 0) continue;
    const missing = [...rule.classes].filter((c) => !focusVisibleClasses.has(c));
    if (missing.length > 0) {
      offenders.push(
        `${rule.file}: ${rule.selector} has :hover but no :focus-visible for .${missing.join(', .')}`,
      );
    }
  }
}

/** Check (g): the named button families (guards batch A's `:active` press-state work) must
 *  each declare an `:active` rule somewhere in the site's own CSS. */
function checkActiveExistence(offenders) {
  const rules = collectInteractionRules();
  const activeClasses = new Set();
  for (const rule of rules) {
    if (rule.pseudo === ':active') for (const c of rule.classes) activeClasses.add(c);
  }
  const missing = ACTIVE_REQUIRED_FAMILIES.filter((f) => !activeClasses.has(f));
  if (missing.length > 0) {
    offenders.push(`no :active rule found for the named button family: .${missing.join(', .')}`);
  }
}

/** Check (h), soft: an interactive element's effective hit area, expanding its own rendered
 *  box by any `::before`/`::after` pseudo-element the site uses for its documented expanded-
 *  hit-area technique (`content: ''; position: absolute; inset: -Npx` on a `position: relative`
 *  parent — SiteHeader.svelte's `.nav-caret::before` and its siblings), must clear 40px in its
 *  smaller dimension at the 390 viewport. Warn-only: an icon-in-text link can legitimately stay
 *  small, so this is for a human to skim, not a gate. */
async function checkTouchTargets(page, path, warnings) {
  const hits = await page.evaluate((minTarget) => {
    function pseudoExpansion(el, pseudoSelector) {
      const cs = getComputedStyle(el, pseudoSelector);
      if (cs.content === 'none' || cs.position !== 'absolute') return null;
      const px = (v) => (v === 'auto' ? 0 : parseFloat(v));
      return { top: px(cs.top), right: px(cs.right), bottom: px(cs.bottom), left: px(cs.left) };
    }

    const found = [];
    for (const el of document.querySelectorAll('a, button, [role="button"]')) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      let left = r.left;
      let right = r.right;
      let top = r.top;
      let bottom = r.bottom;
      for (const pseudo of ['::before', '::after']) {
        const exp = pseudoExpansion(el, pseudo);
        if (!exp) continue;
        left = Math.min(left, r.left + exp.left);
        right = Math.max(right, r.right - exp.right);
        top = Math.min(top, r.top + exp.top);
        bottom = Math.max(bottom, r.bottom - exp.bottom);
      }

      const width = right - left;
      const height = bottom - top;
      if (Math.min(width, height) >= minTarget) continue;
      const classes =
        el.className && typeof el.className === 'string'
          ? `.${el.className.trim().split(/\s+/).join('.')}`
          : '';
      found.push(`${el.tagName.toLowerCase()}${classes} (${Math.round(width)}x${Math.round(height)})`);
    }
    return found;
  }, MIN_TOUCH_TARGET);

  for (const hit of hits) {
    warnings.push(`${path} @ 390px: WARN touch target under ${MIN_TOUCH_TARGET}px: ${hit}`);
  }
}

async function main() {
  const offenders = [];
  const warnings = [];

  // Checks (f) and (g) read source CSS directly; they need no server or browser and run
  // regardless of what BAND_COMPOSED_PAGES covers.
  checkHoverFocusParity(offenders);
  checkActiveExistence(offenders);

  const server = await ensureServer();
  const browser = await chromium.launch();

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
        // Check (h) is a rendered check like the four above; 390 is the touch-target viewport,
        // already one of the overflow widths, so it rides that same page open.
        if (width === 390) await checkTouchTargets(overflowPage, path, warnings);
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
