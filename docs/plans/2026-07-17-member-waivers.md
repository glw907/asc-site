# Member waivers and acknowledgements — plan (2026-07-17)

Executes docs/2026-07-17-member-waivers-design.md (read it first; its Ratified
decisions, mooring exposure, and Borough flow-down sections govern every task; the
appendices carry the research the drafting leans on). TWO UNITS (Geoff's three-unit
ruling, 2026-07-17; the directory pass is the third):

- **The Fable sitting — T7 plus the T4 signing-experience design.** Legal-adjacent
  drafting and the lightness-bar UI/UX are the two Fable-tier pieces (Geoff: ensure
  Fable input into the waivers UX "so it's as clean and light as it can be"). Depends
  only on the spec and research, not the build; schedulable any time, and it MUST land
  before the build session reaches T4. Past the included-access window it runs as a
  deliberate Fable sitting per the post-cutoff rules, never a silent default.
- **The Opus build session — T1 through T6 and T8**, after the directory pass ships.
  Straightforward development executing the spec plus the Fable sitting's ratified
  signing composition and framing copy. Sonnet implementers per task; the conductor
  reviews each diff and verifies the full gate between dispatches.

Nothing in this pass is legal advice; every document ships as a DRAFT for the club's
attorney, who is the gate before any document publishes for real signing.

## T1 — The document model

Outcome: signable documents as season-versioned markdown in the repo, one file per
version, frontmatter carrying kind ('release' | 'acknowledgement' | 'agreement'),
audience ('all-members' | an asset kind), season, and status ('draft' | 'published'),
edited through the admin like other content. A loader resolves the published version
of each document for a season. A freeze guard in the test suite (the
fragment-integrity pattern) fails when a published document's content hash changes
rather than a new version being added; prove the guard fails by mutating a published
fixture before trusting it.

## T2 — Schema: the signature record

Outcome: asc-club migrations (scratch-proven, forward/rollback/verify, applied live)
evolving `waiver_acceptances` to the spec's record: document id, version, season,
kind, SHA-256 content hash, full text snapshot, name-as-typed, timestamp, IP, context
(the CHECK extends beyond 'class-signup'/'join' to 'renewal', 'mooring-fee',
'storage-fee'), the auth event (magic-link token id, issued-at, consumed-at), the
frontend build hash, and the minors fields (signer relationship from the AS 09.65.292
categories, minor member id). Existing rows migrate forward losslessly. No automatic
deletion anywhere; tests assert the record round-trips byte-identical text.

## T3 — The requirement engine

Outcome: a pure, tested derivation: given a member, their household's holdings, and a
season, the list of applicable documents (audience × holdings) and each one's
signed/outstanding state against the published versions. Class participation adds no
document (spec decision 9). Unit tests cover: all-members documents, asset-kind
documents appearing only for holders, a mid-season newly published version making a
prior signature stale for the new season only (fresh-per-season, never retroactive
within one), and a minor needing a parent signature.

## T4 — The signing flow (builds the Fable sitting's ratified design)

Outcome: the one continuous signing moment per the spec's governing principle
("as light as it can be while still being legally sound and protecting the club"),
executing the composition, anatomy, and framing copy the Fable sitting ratified with
Geoff — the build implements that reference, it does not re-design it. The moment:
welcome line with count and time expectation, each document in sequence with its
plain-language framing line, full text scrolled in place, typed legal name, one
distinct affirmative act per document, visible progress. Records write everything T2
defines, snapshot taken from the exact text served. The minors path: parent signs per
child, attesting relationship, minor identity from the household roster. For storage
and mooring holders the moment ends with the prefilled contact-info confirm step
(Borough flow-down; glance-and-confirm, never a form).

## T5 — Gates and portal integration

Outcome: join and renewal hard-gate on every applicable document, and the gate is
HOUSEHOLD-COMPLETE (decision 7 as amended 2026-07-18): no payment is taken, no
membership activates, and no joined state displays until every member's signatures
are in; an incomplete household gets a waiting state naming who remains plus a
sign-in nudge, and payment unlocks when the household completes. Asset-fee payment
and season assignment confirmation gate on the matching asset documents; class
signup requires an active (signature-complete) membership, gates on the
current-season general release, and presents nothing when it is already on file
(decision 9). Outstanding documents surface as portal "Needs your attention"
rows linking to one signing page that clears everything in a sitting; no other nags.
`waiver-text.ts` and `settings.waiver_text_version` retire; the join checkbox
upgrades to the typed-name flow. web-auth-security-reviewer runs on the signing and
gating surfaces before the pass closes.

## T6 — Admin: is the club protected

Outcome: a per-season club-admin rollup per spec decision 8: each document with
signed and outstanding counts, drill-through to either member list, per-member
signature history, the frozen signed text retrievable, and the on-demand
certificate-of-completion view (snapshot, hash, timestamps, auth metadata in one
human-readable artifact).

## T7 — The Fable sitting: document drafts, signing-experience design, board packet

Two deliverables in one sitting: the attorney-ready draft packet (below) and the
ratified signing-experience design for T4 — HTML probes of the signing moment (the
welcome line, one document's full anatomy, the progress treatment, the contact-confirm
step) at 390 and 1440 in both themes, grounded in the real draft documents so text
length and legal register are the real thing, verdicted by Geoff per the
probe-iteration process. The framing copy is drafted here too (it must never
paraphrase legal effect; the attorney reviews it beside the documents), so the build
session receives finished words, not placeholders.

Outcome: attorney-ready DRAFTS, written from the club's existing legacy-site documents
(never a blank page) against the spec's drafting bar: the Donahue six-factor checklist
per release, cold-water immersion named explicitly, reckless/intentional carve-outs
everywhere, the mooring agreement encoding the tackle split at the ball, assumed
ground-tackle failure, no inspection-practice language, indemnification and the
insurance question presented both ways; the storage agreement carrying the Appendix B
clause checklist including the contractual lien/abandonment machinery and the
72-hour Borough relocation covenant; the rules acknowledgements; and the youth
medical form's field set. Locate the underlying Borough land-use permit and verify
the RV rules and storage agreement against it (flow-down section's verification
task); discrepancies go to the board memo. The board packet bundles Appendix C's
inventory, the drafts, and the attorney question list from the appendices.
register-check runs on every draft before Geoff reads it.

## T8 — Verification and the deploy gate

Outcome: e2e coverage of the signing flow (sign, gate, re-sign season boundary,
minors path) plus a visual spec for the signing moment and admin rollup with
CI-minted baselines (update_snapshots dispatch; read the log); the freeze guard, the
requirement engine, and the record round-trip all green; a fresh-context coherence
read at 390/1440; then Geoff's before/after. The pass ships to dev with drafts marked
DRAFT; nothing publishes for real signing until the attorney's sign-off, which is a
separate, later act recorded in STATUS.
