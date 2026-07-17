# Fragments migration and DX/contract harvest: design

> Spec for the `fragments-migration` initiative (ROADMAP). Brainstormed interactively with
> Geoff and approved 2026-07-17. The executable plan is
> `docs/plans/2026-07-17-fragments-migration.md` and its workflow script
> `docs/plans/2026-07-17-fragments-migration.workflow.mjs`. Execution is Opus-conducted per
> Geoff's downshift ruling; this spec carries every judgment the plan needs so the conductor
> executes rather than re-derives.

## What this pass does

Two halves, deliberately entangled. The **migration** bumps the site to cairn `^0.87.0`,
adopts the Fragments concept, and converts the surviving candidates from
`docs/fragment-candidates.md` into fragments. The **harvest** treats the same work as
fragments' first real consumer test outside cairn's own showcase: a designed adversarial probe
matrix plus a friction diary, from both the developer and editor seats, with findings filed to
`~/Projects/cairn-cms/docs/internal/docs-friction-log.md` (perspective-tagged; that log was
cleared at the 0.87.0 cut, so these are its first entries). The hunting question, earned from
the portal pass: not "does the API work" but **where can a consumer be green and wrong**.

## Ratified decisions (Geoff, 2026-07-17)

1. **Probe matrix plus diary.** An explicit hold-it-wrong probe list runs deliberately in
   isolated worktrees, alongside a log-as-you-go diary during the real migration. The probes
   are where green-and-wrong lives; the diary catches what nobody predicted.
2. **Blocks-only conversion bar.** A candidate converts only where every consumer genuinely
   wants the same rendered block. A voice-adapted restatement (the New Member Guide's safety
   prose, Education's card cluster) stays as prose that agrees with the fragment's facts, and
   only block-shaped consumers include it. This extends the standing one-consumer drop rule:
   a fragment that flattens good contextual writing is worse than the duplication.
3. **Claude drives the editor seat.** The editor-seat evaluation runs via a seeded local admin
   session and Playwright (the portal signed-in-audit precedent), screenshots read by the
   conductor. Moments that genuinely need a human hand get flagged for an optional look, never
   a gating walkthrough.

   **DEFERRED at execution (Geoff, 2026-07-17).** E1 to E8 do not run in this pass. cairn's
   settled-but-unreleased `design/invisible-craft-polish` branch rebuilds exactly the surfaces
   they probe: the `::include` atomic chip, the fold pill's absorbed opener, the preview's
   spliced-content boundary, and the publish blast radius. Probing 0.87.0's editor seat would
   harvest friction that the next release already fixes, sending cairn's maintainers at solved
   problems. The editor probes run once ASC is on `^0.88.0`; the workflow script gates them
   behind `{ stage: 'probes', editor: true }`. This pass's harvest is developer-seat only, and
   the friction log says so rather than letting the silence read as "no editor findings".
4. From the approved design: probes run in a **worktree** so deliberate wrongness never touches
   `main`, and the who-to-ask fragment carries the `:::page-cta` body while each page keeps its
   own heading around it.

## Grounding (verified 2026-07-17, not assumed)

- The site pins `^0.86.0`; a 0.x caret excludes higher minors, so the bump to `^0.87.0` is the
  deliberate act that makes anything arrive. Latest published is 0.87.0.
- **0.87.0 is the newest published cairn, but not the newest fragments work** (verified at
  execution, 2026-07-17). cairn's `design/invisible-craft-polish` carries eight unmerged commits
  of fragments editor UI, and a live session was still working that branch, so this pass does not
  merge or release it: two conductors never both run a close ritual on one branch, and its own
  review had just confirmed an unfixed include-chip defect. ASC stays on `^0.87.0`; the editor
  probes defer (ratified decision 3). Nothing in the unreleased window changes the adoption
  contract, which the 0.87.0 changelog states as "Consumers must: nothing at runtime".
- **0.87.0 silently re-derives every entry's excerpt, which the changelog does not tell a
  consumer** (found at Stage 0, filed as a developer finding). `10619010` taught `toPlainText` to
  strip directive markers, so a manifest generated under 0.86.x is stale the moment the bump
  lands and the build fails until `npm run cairn:manifest` runs. The failure reads as unrelated
  content drift; the adopting implementer misdiagnosed it as pre-existing and "proved" it with a
  `git stash` that could not have shown that, since a stash reverts source but never
  `node_modules`. On ASC the regeneration is a live fix: `pages/contact` and `pages/directory`
  carry no explicit `description`, so their meta descriptions had been shipping raw
  `:::contact-form` and `:::callout[...]` markup to search engines.
- The 0.87.0 changelog names the four adoption seams: declare the reserved `fragments` concept
  key (requires `routing: 'embedded'`), glob its directory into `createSiteIndexes`
  (`src/chassis/content.ts`, where the four existing concepts glob) and the manifest plugin,
  add `{ screen: 'fragments' }` to a declared `navLayout`, and forward `resolveFragment` in the
  render wrapper.
- The site already declares a `navLayout` (`src/theme/cairn.config.ts:44`, the role-gated tree
  from initiative 5), so the nav change here is one screen entry in the existing tree. The
  sidebar's arrangement stays with `admin-nav-reorg`; this pass does not own it.
- 0.87.0's other change makes `routing: 'embedded'` genuinely non-routable (no `byPermalink`,
  no `entries()` prerender, absent from `site.all()`). ASC's only embedded concept is
  `notifications` (home-banner data, no URL); `src/theme/routable-concepts.ts` and
  `src/theme/active-notification.ts` already read it the canonical way. Stage 0 still verifies
  this empirically rather than resting on the reasoning.
- Contract points the changelog already answers (probes confirm rather than discover): a
  dangling include fails the build the way a dangling `cairn:` link does; a fragment including
  another fragment is refused at save; deleting a still-included fragment is refused with its
  consumers named; a fragment's computed permalink 404s.
- The survey exists: `docs/fragment-candidates.md`, nine cases with canonical wording already
  converged by the 2026-07-15 pass. Its own header names this pass as its consumer. The first
  content task is verify-and-extend, never re-survey.
- The editor-seat seeding recipe exists: `e2e/helpers/admin-session.ts` mints a local admin
  session against the local D1 replica (member analogue at `e2e/helpers/member-session.ts`).

## Stage 0: bump and adopt

The diary is on from the first command. Every unclear moment in the adoption recipe is a
developer-tagged finding; the recipe's own clarity is harvest material.

1. Bump `@glw907/cairn-cms` to `^0.87.0`, `npm install`.
2. Verify the embedded-enforcement change against `notifications` empirically: the home banner
   still renders; notification entries no longer appear in `site.all()`, the sitemap, or any
   feed; nothing in the repo reads notifications through `byPermalink` or `entries()`.
3. Adopt the four seams: concept declaration in `src/theme/cairn.config.ts` (key `fragments`,
   `routing: 'embedded'`); glob `src/content/fragments/*.md` into `createSiteIndexes` and the
   manifest plugin; `{ screen: 'fragments' }` in the existing `navLayout`, gated like
   posts/pages; forward `resolveFragment` in the render wrapper.
4. Gate green: `npm run check` (0/0), `npm test`, `npm run build`.

Acceptance: gate green with the concept declared and an empty `src/content/fragments/`
directory live; the notifications verification recorded; diary entries captured (including
"nothing was unclear", if true, which is itself a datapoint).

## Stage 1: the probe matrix

Runs after Stage 0, before any real migration, in worktrees branched from the adopted state.
Every probe records a finding even when the answer is "behaves exactly as documented", because
a confirmed promise is harvest data too. Findings that are this site's own contract failures
get fixed here; cairn's get filed against cairn.

### Developer seat

| ID | Probe | What to observe |
|----|-------|-----------------|
| P1 | Declare `fragments` without `routing: 'embedded'` | What tells you, and when: config parse, build, or silent acceptance |
| P2 | Omit `resolveFragment` from the render wrapper | The prime green-and-wrong candidate: does an include silently splice to nothing, or fail loudly? |
| P3 | Omit the manifest-plugin glob (keep the `createSiteIndexes` glob) | Does the admin see fragments the delivery layer serves, or vice versa; which surface diverges |
| P4 | Dangling include (`::include{fragment="never-existed"}`) | Confirm the build fails; read the error as a first consumer would (does it name the file, the include, the fix?) |
| P5 | Include inside a **bulletin** | The docs say "any post or page"; is the third concept in or out, and is the boundary told or discovered? |
| P6 | Fragment permalink | Confirm the 404 and the sitemap/feed exclusion on the local build |
| P7 | Omit the `createSiteIndexes` glob (keep the manifest glob) | The mirror of P3: which layer notices, what the editor sees |

### Editor seat (seeded local admin, Playwright, screenshots read by the conductor)

| ID | Probe | What to observe |
|----|-------|-----------------|
| E1 | Create, publish, include via the picker | The whole first-editor loop: discoverability, picker flow, save |
| E2 | Splice in preview; the fold pill | Does the included block read as content; does the fold pill's label and tooltip carry |
| E3 | **Published consumer, draft fragment** | The named dark corner: what does the public page render; what warns the editor, and when |
| E4 | Rename a fragment with multiple inbound includes | Verify the rewrite commit touches every consumer; check a draft consumer's unsaved buffer |
| E5 | Delete a still-included fragment | Confirm the refusal names consumers; read the dialog as an editor would |
| E6 | Nested include (fragment including a fragment) | Confirm the save refusal and its message |
| E7 | `::include` with no fragment attribute | The 0.87.0-fixed papercut: confirm the preview notice |
| E8 | Fragment carrying site directives (`:::facts`, `:::table{variant="fees"}`), a `cairn:` link, and media | Render parity inside a consumer; this is what makes the real migration safe |

Finding schema, one entry per probe: probe ID, seat tag (`developer` | `editor`), the
contract's promise, observed behavior, green-and-wrong verdict (could a consumer ship this
wrong state with all gates green?), severity, and the friction-log-ready sentence.

## Stage 2: survey verification and the verdict table

Each of the nine candidates gets re-verified against today's content files, plus one sweep for
duplicates born since 2026-07-15. Verification applies the blocks-only bar and may flip a
provisional verdict with logged reasoning; flips surface to the conductor before extraction.

A distinction sharpened after the brainstorm's first read: **an include is a block splice, so a
table row is not a consumer.** Join's fee table carries `Moorings | $300/season` as a row
inside a larger table; no fragment can land there. That moved two candidates from convert to
likely-drop, and motivated the agreement test below.

| # | Candidate | Provisional | Reasoning |
|---|-----------|-------------|-----------|
| 1 | Mooring cost and eligibility | Likely drop | Moorings' facts block is the only block-shaped consumer; Join holds a table row. Agreement test pins `$300/season` in both files. |
| 2 | Club address | Convert | Visiting carries the canonical one-row facts block; converge Contact's "Our Location" onto it (a class-b edit); Home's prose restatement stays agreeing. |
| 3 | Storage fees | Likely drop | The fees table lives only on Join; per-resource pages state their own fee in their own shapes. Agreement test pins the four amounts across the named files. |
| 4 | Club-boat ground rules | Partial | Visiting's `:::steps` block converged in the 07-15 retrofit; verify whether Club Boat Use & Qualification hosts the same block as source of truth. NMG's restatement stays prose. |
| 5 | Life-jacket rule (kids 12 and under) | Likely drop | Three contextual mentions, no shared block. Agreement test. |
| 6 | Camping and RV quick facts | Partial | Visiting's facts block is canonical; verify whether Education's "Camping at the ASC" can converge onto the same block. NMG stays prose. |
| 7 | Who-to-ask contact routes | Convert | Visiting, Join, and NMG already close with the identical `:::page-cta` (canonical action `Contact us`); converge Contact's "Other Ways to Reach Us" if it fits (class-b). The fragment carries the page-cta body; pages keep their own heading. |
| 8 | Class registration path | Likely drop | Join's `:::steps` block is the only block-shaped consumer; Education's card cluster stays by the blocks-only bar. Agreement test on the shared facts. |
| 9 | Discord channel vocabulary | Drop | Wants an inline include, which cairn does not have. The gap files as a developer-tagged finding; forcing a block would be worse than the duplication. |

A convert whose verification leaves it with one real consumer gets dropped, not converted.

## The agreement test (the site-contract arm)

Dropped candidates whose facts must still agree get a new `src/tests/content-agreement.test.ts`:
for each canonical fact (the `$300/season` mooring fee, the storage amounts, the life-jacket
rule's age), assert the canonical string appears in each named content file. This is the
mechanism behind "prose that agrees": where a fragment cannot reach (rows, voice-adapted
prose), the test catches drift that today nothing catches. It is the "fix the site contract's
own failures here" arm of the harvest, and it encodes the drop verdicts so they cost something
to silently violate.

## Stage 3: the migration

- Fragment IDs are kebab and content-descriptive: `club-address`, `who-to-ask`, and whatever
  the verdict table's survivors need. The ID is editor-facing (the picker, the include line),
  so name for the editor, not the developer.
- Two change classes, deliberately separated in commits:
  - **Class a, pixel-identical extraction**: consumers already converged on canonical wording;
    replacing the block with `::include` must not change rendering. The CI visual baselines
    coming back unchanged is the proof (the same trick that proved the portal rebuild shifted
    no other page).
  - **Class b, convergence edits**: Contact's address and who-to-ask sections, and anything
    else the verdict table converges. These visibly change rendering and get conductor render
    reads at 390/1440 plus Geoff's before/after at the deploy gate, per the standing rule.
- Content edits made outside the admin get `npm run cairn:manifest`.
- When conversion completes, delete `docs/fragment-candidates.md` per its own header. Dropped
  candidates' rationale lives in this spec's verdict table and the agreement test.

## Stage 4: close

- Distill the diary and probe findings into
  `~/Projects/cairn-cms/docs/internal/docs-friction-log.md`, perspective-tagged
  (`developer` | `editor` | `maintainer` | `operator`). This discharges the standing DX-harvest
  mandate for the fragments surface.
- Full gate. Visual baselines: class-a extractions must come back unchanged; class-b edits
  regenerate via the `ci.yml` `update_snapshots` dispatch only (never a local run), and the
  dispatch's log gets read, not just its conclusion.
- Push to `main` deploys dev; Geoff's before/after on the class-b pages remains the open gate
  for anything beyond dev, per the deploy story.
- STATUS and ROADMAP updated; the probe worktrees removed.

## Execution shape

Opus-conducted, same-session orchestrate-and-verify. The plan doc carries the conductor's
steps and gates; the workflow script carries the fan-out stages (`adopt`, `probes`, `survey`,
`extract`), selected by `args.stage` so the conductor runs judgment between stages: triage
probe findings into the friction log, resolve verdict flips, review every diff. Extraction
runs serially (multiple fragments edit the same consumer pages, so parallel writers would
race). Work happens on a `fragments-migration` branch with a PR to `main` at close, the portal
pass's shape.

## Pass-level acceptance

- `^0.87.0` on `main`, full gate green, the fragments concept live with its admin screen.
- Every probe (P1 to P7, E1 to E8) executed with a recorded finding.
- Friction-log entries filed and perspective-tagged in the cairn repo.
- The verdict table resolved: converts extracted (class-a baselines unchanged), drops encoded
  in the agreement test, `docs/fragment-candidates.md` deleted.
- Class-b pages rendered for Geoff's before/after; the apex remains ungated by this pass.
