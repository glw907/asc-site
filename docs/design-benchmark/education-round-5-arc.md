# Education live round 5 — arc log (2026-07-13, afternoon)

One line per iteration: probe, verdict, why. Distill into decisions.md at settle, then remove
this file (the round-4 convention). All verdicts below are PROVISIONAL-KEEP: Geoff iterated
forward on each without a revert, but no explicit per-item ratification happened before the
session handed off to the aksailingclub-org project.

- Manifest regen (education lede) — KEEP (committed 523ec54): dev server refused to start;
  the committed manifest lagged the round-4 lede. Content untouched.
- "What You'll Learn" 2x2 — PROVISIONAL-KEEP: Geoff's note ("should be two columns; a single
  column should also have multiple sections") plus his ask for better categories. Eight items
  redistributed into four honest two-item clusters (Know the Boat / Boat Handling / Seamanship
  & Safety / Rules & Racing); right-of-way moved beside racing; `learn-cluster-wide` retired.
- Course-weekend timeline — PROVISIONAL-KEEP, three iterations: (1) merged the at-a-glance
  grid + duplicate narrative paragraphs into one `.course-days` timeline (day + time labels as
  the scan layer, Geoff's narrative verbatim as the read layer; water/ashore legend retired);
  (2) polish pass after Geoff flagged dot misalignment — dot and rail now draw in one
  coordinate frame against a fixed label line-height (measured exact: all five stops on one
  axis, dots centered on their label lines), stops took the class-day gold
  (`--color-star-gold-dot`, the ratified "gold marks classes" vocabulary); (3) rail runs
  through Sunday's paragraph to the block's end (owner's call), not cut at its dot.
- Fleet Tune-Up de-bulleting — PROVISIONAL-KEEP: "over-bulleted" note. Drills + ASC good
  stuff moved to prose, clinic subjects kept as the one short list, Who Can Participate as two
  sentences. All facts preserved, no invented framing beyond connective tissue.
- Sitewide closing CTA (`.page-cta`) — PROVISIONAL-KEEP: quiet base-200 panel, display-face
  lead ("Not finding what you need?"), muted reassurance line, one action. SUPERSEDED the
  round-3 education closing card (stacking both broke A1's one-chrome rule;
  CLOSING_SECTION_HEADING_ID emptied). Rollout to join / members / visiting-the-club /
  renewing-your-membership / new-member-guide QUEUED behind ratification; home is the ruled
  exception and keeps its own close.
- Fireweed action buttons — PROVISIONAL-KEEP (Geoff: "those feel like the two big actions
  for the page"): home's `.cta-btn` recipe extracted as `.asc-cta-btn` in asc-components.css,
  spent exactly twice per the color story's budget — the registration door ("See class dates
  & openings" → /events/) and the closing CTA's "Email us any time". site.css's prose-link
  rule excludes the class by name.
- TOC bottom clamp — KEEP (bug fix, owner-reported): the scrollspy's top-30% band can never
  reach a short final section, so Questions was unreachable. At document end the last section
  is active by definition; the clamp needs the last word inside the observer callback too (a
  bottom jump fires both, observer last). Verified: jump-to-bottom, stepped scroll, and
  mid-page recovery.

- Live class schedule island — NEW PROBE (Geoff's ask, mirroring the live site's table):
  `class-schedule` directive on the education registration band, quiet grid rows (name /
  tabular dates / status chip / action door), reading asc-club live via a remote query.
  Full lifecycle status engine (Completed / In session / Drop-in "Just show up!" / Opens
  <date> / Full→waitlist / Open→register / Dates TBD), pure derivation + 13 unit tests.
  Migration 0018 (drop_in column, class_registration_opens settings key) scratch-proven and
  applied REMOTE; the 2nd Adult Intro end_date typo (2016→2026) repaired on remote; local D1
  rebuilt from all 18 migrations and seeded with the real events/classes/settings rows (no
  member PII). The fireweed registration-door button RETIRED from the band (rows carry their
  own doors; page fireweed budget back to one) — flag for Geoff's verdict. Season-wrapped
  line ("The 2026 class season has wrapped…") is new copy, guide-conformant.
- QUEUED (Geoff, mid-round, Fable time authorized): the unified signup experience — one
  consistent flow and language across both doors (membership join, class signup), including
  join+register-a-class in one pass, now that MembershipWorks is out of the loop. Needs its
  own brainstorm/spec; the schedule's Register links point at /classes/[id]/signup, which is
  where that flow would grow.

- Fleet Tune-Up RENAMED "Skills & Drills Weekend" (Geoff's pick from a four-name slate; the
  old name read as boat repair): D1 name+slug (remote+local), education heading/anchor/lede
  link/prose, racing page link. Product-fact corrections ratified by Geoff mid-round: the
  event takes PRE-REGISTRATION now (drop_in flipped back to 0 both DBs; the "no registration
  required, show up and sail" line replaced), stays free, members-only. Registration copy now
  points at the interest question.
- The "what would you like to learn?" question — LANDED (Geoff's ask): migration 0019
  (class_enrollments.interests, scratch-proven, applied remote+local), optional textarea on
  the public signup form, waitlist path via the existing notes column, quiet "Wants to
  learn:" lines on the admin roster (Sonnet dispatch 9fffa1f, gate green 754). Conductor's
  review found and fixed a data-loss seam the dispatch scope excluded: BOTH offer-claim
  paths (public token, portal) deleted the waitlist row without carrying notes onto the new
  enrollment's interests column; fixed with the binds pinned in tests on each path.
- Admin fields for 0018 — LANDED (Sonnet dispatch c23fb6a, reviewed): Drop-in checkbox on
  the class form, Drop-in badge on the classes list, owner-only "Class registration opens"
  date field on Settings (writer validates YYYY-MM-DD or empty).
- cairn-cms 0.84.2 bump (Geoff's ask at close): the admin cold-isolate token-hang fix; full
  gate on the bump (check 0/0 over 786 files, 754 tests, build green); dev server restarted
  on the new package and smoked (page 200, island mounts, media 200).

- Schedule-pending state (Geoff's ask: "when we increment years, we won't immediately have
  the new class dates"): an empty season now renders "We haven't posted the {season} class
  schedule yet…" instead of the events-page fallback (which stays for a genuine read
  failure); a dateless ROW keeps its per-row Dates TBD chip. Not visible with 2026 data;
  covered by unit tests (15/15).

Owed at settle (unchanged from the round-4 close, plus this round): design-probe script +
fresh-context lens fan-out + full-width render read, simplifier over the whole arc diff, full
gate (check / 725 tests / build), decisions.md distillation, merge to main, manual wrangler
deploy to dev while GitHub Actions stays billing-blocked, Geoff's production before/after.
