# asc-site

The Alaska Sailing Club's public site: guides, news, pages, and the season calendar, built on
`@glw907/cairn-cms` (0.81.0) using the cairn chassis structure. It replaces the club's prior
Hugo/Blowfish site (`~/Projects/aksailingclub-org`) and its abandoned SvelteKit rebuild
(`~/Projects/aksailingclub-sveltekit`, kept only as phase-2 evidence, not a foundation).

@docs/STATUS.md

## What this is

Three cairn concepts: **posts** (news, results, recaps, a curated tag vocabulary), **pages**
(stable content: guides, governance, education), and **notifications** (a site-declared concept
rendering as the home banner). Everything a member reads is markdown content edited through
cairn's `/admin`; the season calendar is D1 data, not content (see below).

`src/chassis/` carries the genre-free plumbing (content delivery, the token system, prose and
composition CSS, the runtime composition point) verbatim or near-verbatim from cairn-cms's own
showcase; `src/theme/` carries everything specific to this club: the club-grounds palette, the
Fleet/Facilities photo compositions, the Season band, the icon set, and the directive registry
(including the `membershipworks` embed directive). Read `src/chassis/README.md` before touching
anything under `src/chassis/`: a theme file reaches chassis only through its exported seams
(`$chassis` in `.ts`/`.svelte`, a relative `@import` in `.css`), never a direct reach past them.

## The design contract

This site executes a locked design spec, not an ad hoc theme. Durable local copies live in this
repo so the contract survives independent of the cairn-cms repo:

- **`docs/2026-07-06-asc-phase-1-design.md`**: the phase-1 spec — the four named issues (complex
  CSS, busy pages, uneven responsiveness, heavy card use), the locked density recipes (A1 quieted
  bands, B1 editorial pacing, C7 gold-star season taxonomy), the coexistence strategy with the
  existing ops stack, and the phase boundaries.
- **`docs/2026-07-06-asc-home-northstar.html`**: the complete, Geoff-blessed home page example.
  Every locked decision in one rendered artifact; a change to the home page reads against this
  file, not against memory of what it says.

Both are frozen references from the brainstorm that produced this build. A future redesign pass
supersedes them with a new spec and north star, it does not edit these in place.

### The club-grounds color story

The palette replaces the old site's unexamined Blowfish defaults. Roles are the contract; exact
values may tune, but a color never crosses roles:

- **Flag navy** (`~#1C4670`, deep `#12294A`): links, structure, identity. The only link color.
- **Star gold** (`~#E3A008`): marks and waypoints only, never body text — the active-nav
  underline, the notification edge, and the star marking a class or clinic in the Season list
  (education is the mission; the mark encodes it).
- **Fireweed** (`~#B23A77`): the single pop color — primary CTAs, at most twice per page.
- **Building sage** (tints `~#F2F5F1`/`~#E5EBE3`): band and surface neutrals.
- **Harbor ink** (`~#16222E`) and its muted step: text.
- The semantic palette (caution/success/error) stays a separate reserved vocabulary. The
  education category can never collide with a warning color again, the way it did on the old site.

### One-check and visual-fidelity, for any design change

This site follows cairn-cms's family-wide doctrine (see that repo's `CLAUDE.md` for the full
statement): **nothing deploys to production without at least one full-page render read by a
human's own eyes**, and because this is a member-facing site, **Geoff's explicit before/after
approval gates every visual change before it reaches the apex**. Mechanical gates (`npm run
check`, `npm test`, the pixel-diff rider) measure correctness, never resemblance; only a read
screenshot measures what a member sees.

Any non-trivial visual change runs the **visual-fidelity method**: capture the reference first,
build against a screenshot-compare loop, verify with fresh eyes (not the same session that made
the change), then the one-check gate above. The family five-viewport bar (320, 390, 768, 1440,
2560, composed at the extremes) is the acceptance bar for responsiveness; `e2e/site-visual.spec.ts`
is the CI-enforced form of it, and any change that alters rendering must regenerate its baselines
in the same change, never leave them stale.

## The D1 EVENTS_DB rule — read-only, never migrate it here

`EVENTS_DB` (bound in `wrangler.toml`, database `asc-ops`) is the club's own ops stack's
database, not this site's. This site only ever `SELECT`s from it (`src/theme/season-data.ts`
carries the header comment explaining why). **Never add a migration for it in this repo.** A
schema change to `asc-ops` belongs to the phase-2 ops absorption, in the ops-owning repo, with
real migrations and verification against the live 12+ event rows; this repo's job is to read
whatever shape that data currently has. `AUTH_DB` (`cairn-asc-auth`), by contrast, is this site's
own database (cairn's magic-link auth store) and takes migrations normally.

## Access and the dev hostname

**dev.aksailingclub.org** serves this build (the `asc-site` Worker), behind the same Cloudflare
Access application volunteers already used for the prior migration shell (repointed from
`asc-staging` to `asc-site` at the Task 5 dev takeover; `asc-staging` itself is untouched, still
bound at `staging.aksailingclub.org`). Non-interactive verification (curl, Playwright) uses the
`claude-capture-asc-ref` Access service token
(`ASC_ACCESS_CLIENT_ID`/`ASC_ACCESS_CLIENT_SECRET` in `~/.local/secrets`) with the
`CF-Access-Client-Id`/`CF-Access-Client-Secret` headers. **Production
(`aksailingclub.org`) is not behind Access and is not this Worker yet** — see the deploy story
below. Full Access-app inventory and token-minting steps: the `asc-cloudflare-access` memory in
the cairn-cms project's agent memory.

## Deploy story

- **Push to `main`** runs `.github/workflows/deploy.yml`, which deploys straight to the
  `asc-site` Worker. **That Worker is bound to `dev.aksailingclub.org`, not the production apex.**
  A push to `main` is a dev deploy; it is not gated on Geoff's review by the deploy mechanism
  itself, only by the one-check rule above as a practice.
- **`.github/workflows/ci.yml`** is the pull-request gate: `check`, `test`, `build`, and the
  pixel-diff `test:e2e` suite, with a `workflow_dispatch` mode to regenerate visual baselines.
- **The production apex cutover (`aksailingclub.org` itself) is a separate, deliberate DNS
  change** — repointing the zone apex from the retiring Hugo/GCE origin to this Worker. It is
  **never automatic and never bundled with a routine push to `main`.** It happens only on
  Geoff's explicit go, after his own before/after review of dev, per the phase-1 design spec's
  acceptance criteria. The GCE origin retires only after a soak period following that cutover.

## Build & Dev

```bash
npm install
npm run dev                                          # dev server at http://localhost:5173
npm run build                                        # build to .svelte-kit/cloudflare/
npm run build:search                                 # build + Pagefind search index
npx wrangler dev --remote                            # real D1/R2 bindings (EVENTS_DB, MEDIA_BUCKET)
npm run check                                         # svelte-check, 0 errors/0 warnings
npm test                                              # vitest
npm run test:e2e                                      # Playwright, the pixel-diff visual suite
```

`npm run cairn:manifest` regenerates `src/content/.cairn/index.json` after any content edit made
outside the admin (a direct file edit, a migration script); the admin's own save path regenerates
it automatically.

## New Post

Create `src/content/posts/YYYY-MM-DD-slug.md`:

```yaml
---
title: "Post Title"
date: YYYY-MM-DD
draft: false
description: "One sentence description."
tags: ["tag1"]
image:
  src: "media/<content-hash>"
  alt: "What the photo shows."
---
```

## Worker & Secrets

`GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, and `GITHUB_APP_PRIVATE_KEY_B64` (cairn's GitHub
App, committer `cairn-cms[bot]`; values on file in the cairn-cms repo's `CLAUDE.md` and
`~/.local/secrets`) are set as Worker secrets on `asc-site`. Check with:

```bash
npx wrangler secret list
```

## Documentation

- `docs/STATUS.md`: rolling status, read first.
- `docs/2026-07-06-asc-phase-1-design.md` / `docs/2026-07-06-asc-home-northstar.html`: the design
  contract (see above).
- `docs/content-migration-findings.md`: what migrated from the Hugo site and the deltas taken.
- `docs/events-integration-findings.md`: the `EVENTS_DB` schema verification and taxonomy rules.
- `docs/verification-findings.md`: the phase-1 verification pass, the pixel-diff rider, and the
  dev takeover record.


## The repo family (renamed 2026-07-06)

- **This repo (glw907/aksailingclub-org)** is the NEW site — cairn-based, the club's
  future production site (formerly asc-site; the worker keeps the name `asc-site`).
- **glw907/aksailingclub-legacy** (locally ~/Projects/aksailingclub-legacy) serves the
  LIVE site today (Hugo/Blowfish + the ops/ dashboard) and stays authoritative until the
  cutover; it archives after the soak. Its ops/ dashboard keeps running beside this site
  through the whole phase-2 absorption (the coexistence strategy).
- ~/Projects/aksailingclub-sveltekit is the retired experiment (see its RETIRED.md).
- Claude sessions for ASC work launch HERE; this project has its own memory.
