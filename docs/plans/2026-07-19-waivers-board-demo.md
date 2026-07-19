# Waivers board-demo pass — plan (2026-07-19)

Make the waivers system live on dev with the NEW draft documents so Geoff can show the
real UI to board members (Geoff, 2026-07-19: "we're not using dev yet" — dev is not
member-facing, so publishing drafts there changes no legal posture; production remains
the legacy site and MW keeps collecting the operative release). The 2027 files stay
draft for the attorney cycle; this pass publishes season-2026 versions of the same
text, and the attorney's approved 2027 versions supersede at season rollover by the
model's own fresh-per-season rule. Signatures collected on dev meanwhile are
board/volunteer demo signatures against draft text — acceptable by Geoff's ruling, and
they live in the ordinary evidence record.

## T1 — Publish season-2026 versions

Outcome: for each of the 8 documents in src/content/documents/, a season-2026 v1 copy
with status published (same document id, same body text verbatim, season: 2026; the
2027 drafts untouched). Freeze-guard ledger entries added for every published version
(the guard now bites on real content for the first time — prove it still fails on a
mutated copy). `npm run cairn:manifest` regenerated and committed.

Test sweep, load-bearing: unit/e2e tests were written when the real corpus had zero
published documents. Sweep for anything asserting the no-published-documents state
against the REAL corpus for the current season (the e2e fixture documents deliberately
live at past seasons and the visual suite overrides current_season, so baselines and
the functional e2e should be unaffected — verify, don't assume). Full gate green.

## T2 — Verify the live moment on dev

Outcome: after push → dev deploy, the real flow verified on dev.aksailingclub.org with
a real member session: the portal "Needs your attention" row appears, /my-account/sign
presents the 2026 documents as the one continuous moment, a signature writes the full
evidence record (verify the row: snapshot, hash, auth event, build hash), the admin
rollup shows the 2026 documents with real signed/outstanding counts, and the
certificate view renders. Capture a board-ready screenshot set at 1440 (light theme
minimum): the moment mid-flow, the completion state, the rollup, one certificate.

## T3 — Demo household (Geoff's call at execution; recommended)

The family device (per-child Part Two, attestation radios, waiting state) is the
centerpiece, and Geoff's own household may not exercise it. Outcome if taken: a
clearly-marked [DEMO] household (two adults, one minor, one mooring assignment) via a
verified script (dry-run plan, audit trail, and a cleanup script that removes every
row) so the live demo can walk the family moment, the waiting state, and the
contact-confirm card end to end. Cleanup runs after the board meeting; the script
proves removal (verify.sql). If skipped, those devices demo from the CI baselines
instead.

## Deploy and record

Push to main (dev deploy). STATUS records: documents published for 2026 on dev by
Geoff's ruling for the board demo; the attorney gate still governs 2027/production;
the 2027 drafts remain the attorney packet. No baseline regeneration expected (specs
pin fixture seasons); if CI's visual suite disagrees, that is a finding to
investigate, not a baseline to regenerate over.
