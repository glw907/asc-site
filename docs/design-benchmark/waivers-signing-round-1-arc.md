# Waivers signing moment — design probe arc log

In-flight arc log for the waivers sitting's T4 signing-experience design (plan
`docs/plans/2026-07-17-member-waivers.md`, T7 sitting). One line per probe with Geoff's
verdict; distilled into `decisions.md` at settle, then this file is removed. The probe
pages live in the session scratchpad, not the repo, per the directory-pass convention
(this arc's copy, with rendered screenshots: `/tmp/claude-1000/-home-glw907-Projects-
aksailingclub-org/cff8dadd-4587-4c30-b928-4c18497b4c33/scratchpad/signing-probe/`). The document text in the probe is the real
`docs/waivers/2027-general-release.md` draft, full length, so legal register and text
length are the true article; contact-confirm values are placeholder.

## Round 1 — the composition (2026-07-18, Fable waivers sitting)

**Probe:** `scratchpad/signing-probe/index.html` (deck) over `frame.html`. Scenarios:
the mid-flow signing moment (sheet and inline variants), the contact-confirm step, and
completion; 1440 + 390, both themes.

**What the composition commits to (for Geoff to ratify or push):**

- **A hairline document list that is also the progress.** Signed entries collapse to a
  receipt line ("Signed just now as ..."), the current document expands in place with a
  quiet "Document 2 of 3" eyebrow, upcoming entries sit muted with "Still to sign."
- **The document sheet.** The legal text renders as its own framed object (white sheet,
  hairline + soft shadow) with the signature strip (sage ground, typed-name field,
  filled navy Sign) as its bottom edge. Candidate A bounds the sheet with an inner
  scroll + fade cue that clears at the text's end; candidate B lays the text inline and
  the page carries it.
- **Framing lines are the drafted `signing-framing-copy.md` verbatim** — they name the
  document and point into the text, never characterizing its legal effect.
- **Zero fireweed, zero gold.** The one filled element is the navy Sign button (and the
  smaller "This is current" confirm); everything else stays in the portal text register.
- **Contact-confirm as a glance card** (storage/mooring holders, once, after the last
  signature): read-only values, "This is current" filled, "Update it" quiet.

**Open questions on the deck:** sheet vs inline; is the collapsed-list progress enough;
filled-navy Sign weight; sheet omits the document's own title (entry heading carries
it); the confirm card's register; the overall lightness bar ("does anything read as
digital paperwork?").

**Verdicts (Geoff, 2026-07-18):**

- **Inline text, both widths** (candidate B), sheet framing retained. Ruled on the
  research: nested scroll regions get overlooked (NN/g; GOV.UK advises against
  scrollable areas in a page) and are awkward on touch; the accordion already contains
  length since only one document expands at a time. Legally equivalent (the e-signature
  research rates full in-page text + typed name above every enforced pattern); inline is
  the most conservative reading of full-text display.
- **Progress: keep as probed** — the collapsed list is the progress; no wizard chrome.
- **Sign button: filled flag navy** — the portal's first filled button; the one weighty
  act earns it. Fireweed stays zero.
- **Contact-confirm: keep as probed** — glance card, read-only rows, filled confirm,
  quiet "Update it".
- **Sheet omits the document's own title** — the entry heading carries it; the record
  still snapshots the full text.

## Round 2 — household signing: multiple adults, kids (2026-07-18, same sitting)

Geoff's prompt: "do we have good UI for multiple members signing, and for signing for
kids/dependents?" Round 1 probed a single adult with no minors; round 2 probes the
household paths.

**Probe:** `frame.html?scenario=family` added to the same deck. A parent mid-moment:
own documents signed, the per-child Part Two entries in the same accordion (full Part
Two text per child, one distinct signature each — bundling releases under one signature
is the pattern courts distrust), the AS 09.65.292 relationship attestation as a quiet
radio group in the signature strip, the child's identity (name, birth year from the
roster) named at the sheet's top, and a household coda naming the other adult's own
outstanding signatures with a send-a-reminder text action.

**The streamliner ("easy and streamlined, but still legally binding" — Geoff's bar):**
"type once, sign each." The first signature in the moment is typed; later documents
prefill the name (editable) and the attestation from the previous child, and each
document still takes its own Sign click — a distinct affirmative act per document with
the retyping ceremony removed. Goes to the attorney flagged for confirmation.

**Policy, as ruled mid-round (SUPERSEDES this round's first cut):** a signature is
personal — one adult can never sign for another — but the gate is
HOUSEHOLD-COMPLETE (Geoff, 2026-07-18, now a dated amendment to spec decision 7):
no payment, no class registration, no joined state until every member's signatures
are in. The money moment is "the only easy lever we have to make sure that members
complete their liability paperwork." The composition therefore ends an incomplete
household's moment at a WAITING state (who remains, nudge action, payment locked),
not at a completed renewal with a quiet coda. `scenario=waiting` probes that state;
the household-signatures block reads "payment waits on these" for the absent adult.

**Verdicts (Geoff, 2026-07-18, "That all works"):**

- **One entry per child, full Part Two text each** — the signature sits adjacent to
  the exact text it adopts; the accordion absorbs the repetition.
- **"Type once, sign each"** — first signature typed fresh, later ones prefill the
  editable name, one Sign click per document. Attorney confirms.
- **Attestation radios in the signature strip** — first child unselected (explicit
  choice), later children carried forward with the note.
- **The waiting card as probed, plus the resumption loop**: when the last signature
  lands, the managing adult gets one email deep-linking to payment, and the portal
  row shows "waiting on {name}" meanwhile. Copy in signing-framing-copy.md.

Both rounds are fully verdicted. The arc's design is the build reference for T4/T5;
distill into decisions.md and remove this log when the build lands.
