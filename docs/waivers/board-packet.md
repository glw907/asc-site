# Board packet: member waivers and acknowledgements

> Prepared 2026-07-18 for the ASC board and the club's attorney. This packet bundles
> the comprehensive document inventory, the v1 drafts, the questions reserved for
> counsel, and one open verification item on the Borough instruments. Everything
> here is a DRAFT: nothing publishes for real signing until the attorney signs off.
> Background research (with citations) is preserved in the site repo at
> `docs/research/`; the governing design is `docs/2026-07-17-member-waivers-design.md`.

## Why the club is doing this

The club collects one short release at join through MembershipWorks, plus a
one-paragraph class-signup waiver in the new portal, and nothing else. There is no
rules signature of record, no mooring or storage agreement, no minors election, and
no per-season renewal. The new member portal adds a signing
system—full text shown, legal name typed, a permanent evidentiary record per
signature—and this packet supplies the documents worth signing. Two findings
drove the drafting bar:

- Alaska's controlling test for releases (Donahue v. Ledgends, 331 P.3d 342
  (Alaska 2014)) voids vague or unemphasized waivers. The club's join-form release
  never uses the word "negligence" and names no specific risks; it would face that
  test poorly.
- Storage is contract law, not waiver law. A boat on a mooring, an RV on Trailer
  Row, and Alaska's missing self-storage lien statute all call for bilateral
  agreements with their own lien and abandonment machinery, which no release
  supplies.

## The document inventory

Every document the club should collect, built from the club's operations crossed
with US Sailing guidance and real peer-club packets. The attorney verifies
completeness. "Signs at" maps each document to its natural moment, so no moment
carries more than its own documents.

| Document | Who signs | Cadence | Signs at | Tier |
|---|---|---|---|---|
| General liability release (expressly covers class participation) | Every adult; parent for each minor | Annual | Join / renewal | Core |
| Club rules acknowledgement | All members | Annual | Join / renewal | Core |
| Mooring agreement (release + property terms) | Mooring holders | Annual | Mooring fee | Core |
| Dry storage agreement (with lien/abandonment clause) | Storage holders | Annual | Storage fee | Core |
| Per-asset rules acknowledgements (Trailer Row, boat parking, rack) | Asset holders | Annual | Asset fee | Core |
| Regatta / race entry waiver | Each competitor (parent for minors) | Per event | Race registration | Core (the club runs regattas) |
| Youth medical & emergency form (consent-to-treat) | Parent/guardian | Per season | Class signup | Core for youth classes |
| Minor photo/media consent | Parent/guardian | Standing, revocable | Class signup or profile | Core (public site shows youth photos) |
| Adult photo/media consent | Adult members | Standing, revocable | Join or profile | Recommended |
| Club-boat use agreement (qualification, damage terms) | Qualified members | At qualification + annual | Qualification | Core (club boats exist) |
| Volunteer / work-party coverage | Volunteers | Annual | Inside the general release | Recommended |
| Guest / visitor waiver | Non-member participants | Per visit or standing | At visit | Recommended, post-v1 |
| Proof of insurance (moored/stored boats) | Mooring & storage holders | Annual | With the mooring/storage agreement | Board policy call |
| SafeSport / youth-protection acknowledgement | Instructors, youth-contact volunteers | Per US Sailing cycle | Instructor onboarding | Core given the education mission |

Notes that ride the table:

- **There is deliberately no separate class waiver.** All class participants are
  members, and the general release names instruction risks expressly (on-water
  training, capsize and recovery drills, cold water, club boats), so class signup
  adds no paperwork for a member whose current-season release is on file. The
  attorney confirms the single-document coverage.
- **Every asset comes with its rules, signed.** A member keeping an RV on Trailer
  Row signs the Trailer Row Use Guidelines each season—the existing paper
  requirement, moved into the signing system—alongside the Dry Storage
  Agreement. Boat-parking and rack holders sign their own rules the same way, and
  the mooring agreement absorbs the mooring rules directly.
- **Race entries are a separate document because RRS Rule 82 requires it.** Racing
  Rules of Sailing Rule 82 prohibits indemnification language in a race entry
  document, so the general release cannot serve regatta entries under US Sailing
  sanction. The regatta waiver ships with the events redesign.
- **Cold-water immersion is named explicitly** (cold shock, hypothermia) in the
  general release and mooring agreement, and will be in the race document. No
  surveyed peer waiver does this, and Alaska's specific-risks doctrine makes a
  generic "risk of drowning" clause an enforceability weakness. It is the packet's
  main Alaska-specific departure from the surveyed peer waivers.
- **Volunteer work parties** are named among the general release's risks rather
  than getting a separate tool-use waiver; no surveyed sailing club publishes one.
  The attorney confirms that suffices.
- **Photo/media consent** is inventoried but not drafted here: it is a standing,
  revocable consent, not a season-versioned signable, and its design belongs with
  the profile surfaces. COPPA governs online data collection from children rather
  than published photos, but verifiable parental consent before publishing youth
  photos is best practice regardless—flagged for the attorney, not settled law.

## V1 scope

The signing machinery ships with the member-flow documents—the drafts in this
packet. The regatta waiver rides event registration when the events redesign lands;
the guest waiver needs a non-member flow and is deliberately post-v1; SafeSport
tracking is an admin record, not a member signing flow; the club-boat use agreement
joins at the qualification-flow redesign. The inventory lists every document so the
board can see which ones v1 defers, and why.

## The drafts

All in `docs/waivers/`, each with drafting notes for the attorney at the end:

1. `2027-general-release.md`—Release of Liability and Assumption of Risk. Part
   One for the adult; Part Two the per-child parental election under AS 09.65.292.
2. `2027-rules-acknowledgement.md`—the per-season rules signature of record.
3. `2027-mooring-agreement.md`—the mooring contract: the tackle split at the
   ball, assumed ground-tackle failure, break-away indemnification, and the
   insurance question presented both ways for a board decision.
4. `2027-storage-agreement.md`—the dry storage contract for all three storage
   kinds: no-bailment, the unsecured-lot statement, the Borough flow-down (the
   72-hour covenant, fuel prohibition, reachability), the contractual lien and
   abandonment machinery, and the insurance question both ways.
5. `2027-rv-acknowledgement.md`—the Trailer Row Use Guidelines, signable.
6. `2027-boat-parking-acknowledgement.md`—the boat-parking rules, signable.
7. `2027-rack-acknowledgement.md`—the rack rules, signable.
8. `2027-youth-medical-form.md`—the youth medical form's field set and
   consent-to-treat text.
9. `signing-framing-copy.md`—the words around the signing moment. Reviewed with
   the documents because a framing line must never misstate legal effect.
10. `donahue-checklist.md`—the pre-publish gate every future document version
    passes, so the content bar survives this drafting effort.

## Board decisions the drafts present

1. **Insurance for moored and stored boats** (mooring agreement §8, storage
   agreement §8). Each draft carries an Option A (proof of insurance required,
   with a certificate-or-additional-insured sub-choice; the mooring draft adds a
   placeholder liability limit) and an Option B (strongly recommended, not
   required). Peer practice runs both
   ways; the break-away scenario is why it matters for moorings—a release binds
   only the signer, so damage to a third party's boat is reached by
   indemnification and insurance, not by the release.
2. **The abandonment notice period** (storage agreement §10): drafted at 30 days;
   industry practice runs 14–90.
3. **Season labeling**: the drafts target the 2027 season; the board may elect to
   publish for the remainder of 2026 once counsel signs off.

One method the packet states rather than asks: **a family membership application is
not complete until all members have signed.** Signatures come before payment, so no
money is ever taken on an incomplete application and nothing needs expiring or
refunding — the application simply remains incomplete until the household finishes
it. The money moment is the club's one easy enforcement lever for liability
paperwork, and this method uses it.

## The Borough verification item (discrepancy memo)

The storage documents flow down the club's obligations for the Borough-owned land
(Trailer Row, tenting, trailered parking). Verification against the instruments,
run 2026-07-18:

- **Management Agreement MSB006789** (full text on the club site): contains the
  fuel-storage prohibition (§19), the club's responsibility for safety of all
  persons (§20), and the club-to-Borough indemnification (§21)—all reflected in
  the storage agreement. It contains **no 72-hour, RV, or relocation language**.
- **The 72-hour clause** traces to the earlier Borough land use permit, per the
  club's own published RV rules ("based on the Mat-Su Borough Land Use Permit").
  The Borough manager's Apr–Jun 2022 quarterly report confirms the land "has been
  under Borough Permit since 2013." **The permit's text is not in the club's
  posted records and is not published by the Borough online.**
- **Action for the board:** request the permit file from the Matanuska-Susitna
  Borough Land and Resource Management Division (the agreement's own administrator:
  350 E. Dahlia Avenue, Palmer, AK 99645; (907) 861-7869; lmb@matsugov.us — phone
  and email retrieved from matsugov.us on 2026-07-18, so confirm them when
  calling). Ask
  for the land use permit issued to Alaska Sailing Club, Inc. before the December
  13, 2013 cash bond (check #1106), superseded by Management Agreement MSB006789.
  A fallback is a public records request to the Borough Clerk, (907) 861-7801,
  citing Ordinance Serial No. 22-023 (adopted April 19, 2022), whose assembly
  packet likely attached the permit as background.
- Until the permit text is in hand, the drafts encode the club's published rules,
  which are the club's own binding statement of the obligation. Counsel should
  re-verify the covenant set once the permit is retrieved; any discrepancy comes
  back to the board.

## Questions reserved for the attorney

From the commissioned research (full reports with citations in `docs/research/`):

**Electronic signing**
1. Does any Alaska law independently require these documents in writing, which
   would trigger the ESIGN consumer-consent flow (15 U.S.C. § 7001(c))?
2. Does AS 09.65.292's "in writing, signed by the parent" accept the electronic
   form without further formality?
3. How should the club treat the statute's qualifying-relative signer category
   (grandparent, aunt, uncle, adult sibling residing with the child)?
4. The retention policy: the design never auto-deletes; confirm "never purge," or
   set a deliberate floor (research suggests no shorter than the signer's 20th
   birthday, per AS 09.10.140, checked against the AS 09.10.055 repose statute).

**Releases**
5. Is gross negligence non-waivable under Alaska recreational-waiver case law?
   (The drafts carve it out regardless.)
6. Do courts import the Donahue six-factor test into AS 09.65.292's "clearly and
   conspicuously" standard for the parental election?
7. Does Donahue govern property-damage-only exculpation, or apply only by analogy?
   (No Alaska case on point; the drafts meet the stricter standard anyway.)
8. Confirm the general release's single-document coverage of class participation,
   work parties, and casual club racing.

**Storage and moorings**
9. The storage agreement's §10 lien/abandonment machinery against AS 34.35.220/.225
   (three-month clock, public auction, penalty for unauthorized sale), AS 28.11
   (abandoned vehicles/trailers), and AS 30.30.100–.140 (vessel disposal—does
   its repair-business scope cover a non-repair nonprofit?). Conversion is
   strict-liability; the club will not act on the clause until counsel confirms it.
10. Current status of Alaska self-storage lien legislation (HB 97 died in the
    Senate, 2024; re-verify at drafting time).
11. Additional-insured versus certificate-only, if the board requires insurance,
    and the appropriate liability limit.
12. Any AS 45.45.900-style skepticism (sole-negligence property indemnification,
    construction context) that could reach the storage indemnity.
13. Whether the mooring agreement's incorporation of the storage agreement's
    lien terms by reference (mooring §9) is sound, or should be spelled out.

**Insurer**
14. Ask the club's insurer (US Sailing's Gowrie/Burgee program or current carrier)
    whether coverage is conditioned on specific signed waivers, and whether the
    carrier has required waiver language of its own.
