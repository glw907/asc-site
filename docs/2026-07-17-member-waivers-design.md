# Member waivers and acknowledgements: functional design

> Spec for the `member-waivers` initiative (ROADMAP). Brainstormed interactively with
> Geoff and approved 2026-07-17 in the combined directory + waivers sitting, informed by
> three commissioned research reports (electronic-signature validity, stored-property
> liability, and the peer-club document inventory; findings summarized in the
> appendices). The directory spec from the same sitting is
> `docs/2026-07-17-member-directory-design.md`. Everything legal-adjacent in this spec
> produces DRAFTS for the club's attorney, who is the gate; nothing here is legal
> advice.

## Purpose

Protect the club from liability, and prove that members have read and accepted the
rules. This is not a member-coverage feature (Geoff's framing, 2026-07-17): the system
exists so the club holds enforceable releases and provable acknowledgements, strong
enough to stand up when it matters. A member cannot join or renew without every release
and acknowledgement that applies to them.

## Ratified decisions (Geoff, 2026-07-17)

1. **Scope is waivers AND acknowledgements.** One generic signable-document model with a
   kind and an audience (all members, or holders of a particular asset kind). A member's
   required-signatures list for a season derives from membership plus what they hold.
   Three kinds: release (a liability waiver), acknowledgement (proof of having read
   rules), and agreement (a bilateral contract such as the storage agreement; the
   stored-property research established that storage terms are contract law, not waiver
   law, and the signing machinery carries all three identically).
2. **The pass delivers a comprehensive document inventory** (Geoff, 2026-07-17): every
   waiver, release, and acknowledgement the club should collect, as a board- and
   attorney-facing artifact the attorney can verify for completeness. The inventory is
   built from the club's actual operations (household membership with children, adult
   and youth classes, club-boat use and qualification, moorings, dry storage, racing,
   work parties, guests) crossed with peer-club and US Sailing practice; see Appendix C,
   whose closing note also fixes the v1 build scope (general release, rules
   acknowledgement, mooring and storage agreements, per-asset acknowledgements, and the
   youth class packet). Only the membership and mooring releases exist today in any
   form. The stored-property question is answered: the club needs a dedicated storage
   agreement, a bilateral contract rather than a release (Appendix B; the attorney
   confirms the drafting).
3. **Typed-name signing.** The member reads the full document text in the page, types
   their legal name, and clicks sign. No drawn-signature canvas, no third-party e-sign
   service.
4. **Documents live in the repo** as season-versioned markdown, one file per version,
   with frontmatter carrying kind, audience, season, and status (draft or published).
   Edited through the admin like any other content and committed through cairn's GitHub
   App. Published versions are frozen: a guard fails if a published document's content
   hash changes rather than a new version being added (the fragment-integrity pattern).
5. **The legal weight lives in the signature record**, not the file. Each signature row
   snapshots everything needed to reproduce the signed record independent of the repo.
6. **Fresh signatures every season.** Season-rollover's annual waiver review becomes:
   edit next season's document versions and publish them.
7. **Gating at the money moments.** Join and renewal are hard-gated on every applicable
   document. Mooring and other asset documents also gate the asset fee payment and the
   season assignment confirmation. Between money moments, an outstanding document is a
   portal "Needs your attention" row, never a lockout.
8. **Admin surface framed as "is the club protected".** A per-season rollup: each
   document with signed and outstanding counts, drill-through to either member list,
   plus per-member signature history with the frozen signed text retrievable.
9. **The general release covers class participation; no separate class waiver**
   (Geoff, 2026-07-17). All class participants are members, so the annual release is
   drafted to expressly name instruction risks (on-water training, capsize and
   recovery drills, cold-water immersion, club-boat use during class), and class
   signup gates on the current-season release without re-presenting it when already
   signed. A member handles this once, at join or renewal. Two exceptions by nature:
   race entries (RRS Rule 82 bars the general text there regardless) and the youth
   medical form (per-season operational data, not a waiver). The attorney confirms
   the single-document coverage in review.

## The signature record

Each signature is a `waiver_acceptances` row (the existing table, evolved by real
migrations) carrying:

- document id, version, season, and kind
- a SHA-256 content hash of the exact text presented, and a full snapshot of that text
- name as typed, ISO timestamp, IP address, and context (join, renewal, class signup,
  mooring fee, storage fee)
- the authenticated member identity, plus the authentication event itself: the
  magic-link token identifier and its issuance and consumption timestamps (research
  finding: IP alone is a weak attribution signal; the auth event is the strong one)
- the frontend build hash at sign time, so the club can later show which rendering
  served the text (research finding: the stored-text hash proves the record was not
  altered after signing, not what the browser displayed; recording the build version
  closes a gap industry guidance leaves open)

The existing `context` CHECK (only `class-signup` and `join`) and the missing season
dimension are exactly the schema shortcomings the evolvable-schema rule exists for:
real migrations, never workarounds.

Signature records are never automatically deleted. Alaska tolls a minor's claims into
their twenties (AS 09.10.140), and storage cost is trivial; if the attorney wants a
retention cap, it becomes a deliberate policy later.

A rendered certificate-of-completion view (snapshot, hash, timestamps, auth metadata in
one human-readable artifact) is generated on demand from the row, supporting
self-authentication if a record is ever litigated.

## Minors

Alaska statute (AS 09.65.292) lets a parent waive a child's prospective negligence
claim, which most states do not; the flow is designed to that statute. When a parent
signs for a minor household member, the record additionally captures: the signer's
attested relationship to the minor from the statute's enumerated categories, and the
minor's full legal name and date of birth (the members table already carries
birthdate). Release text signed for a minor must separate the parent's own waived
claims from the statutory election for the child, and no release ever purports to waive
reckless or intentional misconduct. The attorney confirms the drafting; the flow just
guarantees the record.

## The mooring exposure

Moorings are the sharpest liability concern (Geoff, 2026-07-17): a boat can break a
mooring in severe weather or from extreme wake, and a drifting boat can do serious
damage to other boats and property. The club must not carry that liability. This means
the mooring document is more than a release of the member's own claims; its draft must
cover, for the attorney's review:

- the member bears the risk of mooring failure, and the club makes no representation
  about mooring adequacy for any weather or wake condition (which also keeps the
  document clear of the no-safety-representations factor in the Donahue test)
- the member indemnifies and holds the club harmless against third-party claims
  arising from their boat, including a break-away
- whether the club should require proof of liability insurance for moored boats, and
  whether the club is named on it, is a board policy question the draft presents both
  ways for the attorney
- tackle ownership is settled (Geoff, 2026-07-17): **the club owns up to the mooring
  ball; the member owns everything beyond it** (pendant, lines, shackles, and the boat
  itself). The draft encodes the split: the member is responsible for the adequacy,
  condition, and maintenance of their own gear beyond the ball and for their boat's
  suitability for the mooring. The no-bailment, no-custody disclaimer applies
  regardless: the member attaches and detaches their own boat, and the club never
  handles it
- **club-owned ground tackle can still fail in severe conditions, and the documents
  assume it will** (Geoff, 2026-07-17: inspection does not make it perfect). The
  member assumes the risk of failure of any part of the mooring system, expressly
  including the club-owned ground tackle, and the exculpation covers the club's
  ordinary negligence in inspecting and maintaining it, named specifically per
  Donahue. The document itself makes no mention of inspection practice: describing an
  inspection regime in a release reads as a safety representation, the exact thing
  Donahue's sixth factor voids releases for. Inspection is club practice, not a
  documented promise
- because a waiver binds only the member who signs it, a break-away that damages a
  third party's property is reached by the indemnification and the member's own
  insurance, not by the release; that is why the insurance question above carries
  real weight rather than being ceremony
- the stored-property research (Appendix B) concludes the mooring document should
  carry full property-storage substance, not just an injury-style release: a boat on a
  club mooring is stored property, and the no-bailment disclaimer, specifically named
  risks (mooring failure, ice, storm, wake, adjacent-vessel contact), insurance
  requirement, and indemnification all apply on the water as on the dry lot. Whether
  that is one mooring agreement or a release plus a property rider is the attorney's
  drafting choice; the substance is equivalent

## The Mat-Su Borough flow-down

Trailer Row, the tenting area, and trailered boat parking sit on Borough-owned land
under Management Agreement MSB006789 (2022 to 2047, published on the site at
/mat-su-borough-land-management-agreement/). The storage documents must flow the
club's obligations under that agreement down to the members whose property creates
them (verified 2026-07-17 against the published agreement and RV rules):

- **The 72-hour relocation covenant.** The Borough can require RVs moved within 72
  hours of notice for work in the easement. The published long-term RV rules already
  carry this ("removed within 72 hours if requested... towing at the member's
  expense"); the storage agreement makes it a signed covenant: the member acknowledges
  the obligation, affirms they are prepared to move on notice, and accepts the towing
  consequence. The annual signing moment also has the member confirm their contact
  info is current, since a 72-hour clock is only survivable if the club can reach them
  (Geoff, 2026-07-17).
- **Indemnification is a chain, not decoration.** Section 21 of MSB006789 has the club
  indemnifying the Borough against claims arising from members' and guests' acts, and
  Section 20 makes the club responsible for the safety of everyone on the property.
  The member-to-club indemnification in the storage and mooring documents is what
  keeps that exposure from resting on the club alone.
- **Fuel and condition rules flow down too.** The agreement prohibits petroleum
  storage on the property, with spills remediated at the club's expense; the RV rules'
  fuel, sanitation, and livable-condition requirements are the flow-down, and the
  storage acknowledgement is where the member's signature meets them.
- **The Trailer Row Use Guidelines already exist as an annually signed document** (the
  RV eligibility rules require a signed copy each season). The storage agreement and
  acknowledgement absorb this existing paper practice into the signing system rather
  than inventing a new obligation.
- **Drafting verification task:** the 72-hour clause traces to the Borough land-use
  permit conditions rather than the management agreement's own text, so drafting
  locates the underlying permit document and verifies the club's RV rules and the new
  storage agreement against both instruments. Discrepancies go to the board with the
  drafts.

## Document drafting bar

The pass delivers high-quality drafts of every v1 document for the attorney's review,
starting from the club's existing documents on the legacy site (the current Release of
Liability Agreement and Rules of the Alaska Sailing Club), never from a blank page.
Release drafts are written against Alaska's controlling six-factor test (Donahue v.
Ledgends): risks specifically and clearly named, the word "negligence" used, language
clear, emphasized, and simple, no public-policy overreach, explicit statement if
exculpating beyond inherent risks, and no safety or maintenance representations.
Cold-water immersion (cold shock, hypothermia) is named explicitly among the risks in
the general, mooring, and race documents; Alaska's specific-risks requirement makes a
generic "risk of drowning" clause a real enforceability weakness, and no surveyed peer
waiver handles this. The six-factor checklist becomes a documented pre-publish gate on
every future document version, so the content bar survives the pass.

## Signing experience

**Governing principle (Geoff, 2026-07-17, verbatim): "as light as it can be while
still being legally sound and protecting the club."** The experience must not scare
anyone off or feel like digital paperwork, and legal soundness is the floor lightness
never trades against. Where the two pull apart, the design resolves the tension with
structure rather than by diluting the legal text; anything lighter than legally sound
is out, and anything heavier than soundness requires is also out.

Signing happens inside the flows it gates: the join and renewal forms, class signup,
and the asset-fee payment step. When several documents apply, they present as one
continuous signing moment: a short welcome line stating what is ahead and roughly how
long it takes, then each document in sequence with a plain-language framing line (what
this is, why the club asks), the full text scrollable in place, and the typed-name
signature. Progress stays visible ("2 of 3"), and each document gets its own distinct
affirmative act, because bundling several releases under one signature is exactly the
pattern courts distrust. Framing copy is drafted carefully so it never paraphrases or
softens the release's legal effect (a summary that misstates the text is worse than no
summary; the attorney reviews the framing lines with the documents).

The annual signing moment for storage and mooring holders also confirms the member's
contact info in the same breath (the Borough flow-down's 72-hour clock depends on
reachability); one glance-and-confirm step, prefilled from the profile, never a form.

Outside the gated flows, the portal's "Needs your attention" row links to one signing
page that clears everything outstanding in a single sitting. One row and the renewal
email are the only prompts; no recurring nags. Occasional-user recognition applies
throughout: the member sees plainly what they are signing, for which season, and what
remains outstanding. The season re-sign is designed to feel like a two-minute part of
renewal, not an annual stack of forms.

## Seams and sequencing

- The portal "Needs your attention" machinery already exists; outstanding documents
  become a new row source.
- Season-rollover owns the annual publish moment; this initiative hands it a concrete
  operation (publish this season's document versions) in place of the current manual
  two-place version bump.
- `waiver-text.ts` and `settings.waiver_text_version` retire once the document model
  lands. The join checkbox upgrades to the typed-name flow; the class-signup checkbox
  disappears for members whose current-season release is on file (decision 9) and
  becomes the typed-name flow only for the member who somehow reaches class signup
  unsigned.
- Whether stored property needs its own agreement affects only the document inventory,
  not the machinery; the model absorbs another document without schema change.

## Appendix A: research summaries

Three commissioned research reports inform this spec (2026-07-17). The full reports,
with citations, are preserved in `docs/research/` (esignature-validity,
stored-property-liability, document-inventory-benchmark, all dated 2026-07-17); the
load-bearing conclusions are captured here and in the decisions above. The drafting
sitting and the board packet work from the full reports.

### Electronic-signature validity

Alaska adopted UETA at AS 09.80. The typed-name flow after full-text display satisfies
the intent-to-sign definition (ESIGN 15 U.S.C. 7006(5); AS 09.80.190), and magic-link
authentication plus the snapshot-and-hash record exceeds the attribution (AS 09.80.060)
and retention (AS 09.80.090; ESIGN 7001(d)) floors. The ESIGN consumer-consent flow
(7001(c)) likely does not apply to a private club waiver, subject to attorney
confirmation. The enforceability risk concentrates in document content, not the
signing medium: Alaska's Kissick/Ledgends/Donahue line voids releases for vague or
unemphasized language, and no Alaska decision has yet applied that test to an
electronically signed release, which the attorney should treat as an open question.
Skipping device fingerprinting is a deliberate proportionality choice for a low-stakes
nonprofit context, recorded here so it reads as considered.

### Questions reserved for the attorney

- Does any Alaska law independently require these documents in writing (which would
  trigger the ESIGN consumer-consent flow)?
- Is gross negligence non-waivable under Alaska recreational-waiver case law?
- Does AS 09.65.292's "in writing, signed by the parent" accept the electronic form
  without further formality?
- How should the club treat the statute's "qualifying relative" signer category
  (grandparent, aunt, uncle, adult sibling residing with the child)?
- The final retention policy, if "never purge" is not simply confirmed.
- Confirmation of the storage-agreement drafting and the further storage questions
  listed at the end of Appendix B.

## Appendix B: stored-property liability

The stored-property research (2026-07-17) answers the open question: **yes, the club
needs a dedicated stored-property document, and it is a bilateral storage agreement,
not another release.** Three independent lines converge: storage duties are bailment
and contract law, a different body than injury-waiver doctrine; every surveyed marina
and storage facility uses a standalone storage agreement, never a folded-in waiver; and
Alaska's statutory gaps mean the club needs contractual lien and abandonment authority
that no release supplies.

Load-bearing findings:

- **No bailment by design.** An unfenced, unattended, self-service lot where members
  keep their own keys sits on the license side of settled case law, not the bailment
  side. The distinction carries a burden shift: a bailee faces a presumption of
  negligence when stored property is damaged; a licensor does not. The agreement
  affirmatively disclaims custody, care, and control, and club practice must match (no
  implied "we keep an eye on it").
- **Alaska has no self-storage lien law** (the last state without one; the 2024 bill
  passed the House and died in the Senate). The fallbacks are the general storage lien
  (AS 34.35.220/.225, three-month clock, public auction, stiff penalties for
  unauthorized sale), the abandoned-vehicle statute for RVs and trailers (AS 28.11),
  and a vessel-disposal procedure (AS 30.30) whose scope may not cover a non-repair
  nonprofit. Selling abandoned property without squarely applicable authority is
  strict-liability conversion, good faith no defense. The agreement therefore carries
  its own lien, deemed-abandoned trigger, notice procedure, and disposal right,
  attorney-checked against those statutes.
- **The clause checklist** for the draft: no-bailment disclaimer; assumption of risk
  naming theft, vandalism, weather, snow load, tree fall, and fire including fire
  spreading from another member's property, with "negligence" used explicitly per
  Donahue; a truthful statement that the lot is unsecured (representing security you
  do not provide is how negligent-security claims attach); exculpation scoped to
  ordinary negligence, never overreaching into gross negligence (an overreaching
  clause can void entirely, the Sunny Isles Marina trap); member-to-club
  indemnification for damage the member's property causes; proof of the owner's own
  insurance as a condition of storage; a club-operations clause for the rare trailer
  move; annual re-sign tied to the storage fee.
- **The mooring document absorbs the same property-risk substance** (see "The mooring
  exposure" above); water storage is more bailment-prone than the dry lot wherever the
  club controls the tackle.

Attorney questions from this report: whether Alaska's Donahue test governs
property-damage-only exculpation or applies only by analogy (no Alaska case on point);
whether the AS 30.30 vessel-disposal procedure covers a non-repair nonprofit; the
current status of self-storage lien legislation at drafting time; additional-insured
versus certificate-only insurance proof; and the abandonment notice period (industry
practice ranges 14 to 90 days).

## Appendix C: the comprehensive document inventory

The board- and attorney-facing inventory (Geoff's ratified deliverable): every waiver,
release, acknowledgement, and agreement the club should collect, built from the club's
operations crossed with US Sailing guidance and real peer-club packets (community
sailing centers and small yacht clubs with moorings, dry storage, and youth programs).
The attorney verifies completeness. "Signs at" maps each document to its natural
moment, per the governing lightness principle: no moment carries more than its own
documents.

| Document | Who signs | Cadence | Signs at | Tier |
|---|---|---|---|---|
| General liability release (expressly covers class participation) | Every adult; parent for each minor | Annual | Join / renewal | Core |
| Club rules acknowledgement | All members | Annual | Join / renewal | Core |
| Mooring agreement (release + property terms) | Mooring holders | Annual | Mooring fee | Core |
| Dry storage agreement (with lien/abandonment clause) | Storage holders | Annual | Storage fee | Core |
| Per-asset rules acknowledgements | Asset holders | Annual | Asset fee | Core |
| Regatta / race entry waiver | Each competitor (parent for minors) | Per event | Race registration | Core (the club runs regattas) |
| Youth medical & emergency form (consent-to-treat) | Parent/guardian | Per season | Class signup | Core for youth classes |
| Minor photo/media consent | Parent/guardian | Standing, revocable | Class signup or profile | Core (public site shows youth photos) |
| Adult photo/media consent | Adult members | Standing, revocable | Join or profile | Recommended |
| Club-boat use agreement (qualification, damage terms) | Qualified members | At qualification + annual | Qualification | Core (club boats exist) |
| Volunteer / work-party coverage | Volunteers | Annual | Inside the general release | Recommended (see note) |
| Guest / visitor waiver | Non-member participants | Per visit or standing | At visit | Recommended, likely post-v1 |
| Proof of insurance (moored/stored boats) | Mooring & storage holders | Annual | With the mooring/storage agreement | Board policy call |
| SafeSport / youth-protection acknowledgement | Instructors, youth-contact volunteers | Per US Sailing cycle | Instructor onboarding | Core given the education mission |

Notes that ride the table into the board packet:

- **There is deliberately no separate class waiver.** All class participants are
  members, and the general release names instruction risks expressly, so class signup
  adds no paperwork for a member whose current-season release is on file (ratified
  decision 9; attorney confirms coverage).
- **Race entries are a separate document by rule, not preference.** Racing Rules of
  Sailing Rule 82 prohibits indemnification language in a race entry document, so the
  general release text cannot serve regatta entries under US Sailing sanction.
- **Cold-water immersion is named explicitly** (cold shock, hypothermia) in the general
  liability, mooring, and race documents. No surveyed peer waiver does this, and
  Alaska's Donahue test requires specific risks rather than boilerplate; this is the
  clearest Alaska-specific drafting improvement available.
- **Volunteer work parties**: no peer sailing club publishes a dedicated tool-use
  waiver; the pragmatic path is naming work parties and tool use among the general
  release's specific risks, with the attorney confirming that suffices.
- **Peer practice runs a family of documents, never one master waiver.** Clubs with
  this activity mix (the fullest real packets found run five separate instruments)
  separate by risk category; the lightness principle is served by the signs-at
  mapping, not by merging documents courts would then read broadly and against the
  drafter.
- **The legacy site's existing documents** (the current Release of Liability Agreement
  and Rules of the Alaska Sailing Club) are the drafting starting point, evaluated
  against this inventory rather than starting blank.
- COPPA governs online data collection from children rather than published photos,
  per general legal commentary; verifiable parental consent before publishing youth
  photos is best practice regardless. Flagged for the attorney, not settled law.

**V1 build scope versus inventory scope:** the signing machinery ships with the
member-flow documents (general release, rules acknowledgement, mooring and storage
agreements, per-asset acknowledgements, youth class packet). The youth medical form is
part signature, part structured data (contacts, conditions, medications); its field
design belongs to the build pass. The regatta waiver rides event registration when the
events redesign lands; the guest waiver needs a non-member flow and is deliberately
post-v1; SafeSport tracking is an admin record, not a member signing flow. The
inventory presents all of it to the board regardless, so scope choices are visible
decisions rather than omissions.
