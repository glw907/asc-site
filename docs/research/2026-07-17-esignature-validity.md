# Research: electronic waiver-signing legal soundness (2026-07-17)

> Commissioned for docs/2026-07-17-member-waivers-design.md (Appendix A summarizes it;
> this file is the full report, preserved verbatim for the drafting sitting and the
> attorney packet). Research, not legal advice; the club's attorney is the gate.

## 1. Federal ESIGN Act and Alaska's UETA — signature validity and attribution

Settled statutory law:

- ESIGN, 15 U.S.C. § 7001(a): electronic signatures/records may not be denied legal
  effect solely because they're electronic.
- ESIGN, 15 U.S.C. § 7006(5): "electronic signature" = "an electronic sound, symbol,
  or process, attached to or logically associated with a contract or other record and
  executed or adopted by a person with the intent to sign the record." Intent-to-sign
  is built into the definition; attribution comes from state UETA law.
- Alaska adopted UETA at AS 09.80. Key sections (verified against FindLaw/Justia):
  AS 09.80.040 (legal recognition, mirrors ESIGN 7001(a)-(d)); AS 09.80.060
  (attribution: "attributable to a person if it was the act of the person... may be
  shown in any manner, including a showing of the efficacy of any security
  procedure", judged "from the context and surrounding circumstances"); AS 09.80.190
  ("electronic signature" definition, essentially verbatim with ESIGN 7006(5)).

Analysis (not a holding): full-text display + typed legal name + affirmative sign
click is a textbook deliberate act satisfying intent-to-sign. Persuasive support:
Shattuck v. Klotzbach, 14 Mass. L. Rptr. 360 (Mass. Super. Ct. 2001) (deliberately
typed name sufficient to show intent to authenticate). Practitioner framework
(DocuSign, Adobe, Ironclad): intent, consent-to-transact-electronically, association
of signature with record, reliable retention — all satisfied on the design's face.
For attribution, authenticated magic-link login is itself a "security procedure" of
the kind AS 09.80.060 contemplates, layered under the typed-name act plus member id,
IP, timestamp, and the hash-anchored snapshot.

Genuinely unclear: no statute or case sets a minimum evidentiary bundle for
attribution; it is a fact-specific post-hoc judgment. The design is well above the
statutory floor, which is different from being immune to challenge.

ESIGN 101(c) / 15 U.S.C. § 7001(c) consumer-consent flow: triggers only where another
law requires information be provided to a consumer IN WRITING. Secondary sources (DLA
Piper, FDIC/NCUA guidance) frame it as aimed at independently mandated disclosures
(lending, privacy, benefits), not general private contracting. A club waiver not
independently required in writing appears to fall outside 101(c), so the special
consent flow (paper-right, withdraw-consent, hardware/software disclosure) is likely
unnecessary. Flag for counsel: no source directly analyzed a nonprofit club waiver
against 101(c).

## 2. Electronic waiver enforceability + Alaska case law

General e-contract formation doctrine (Second Circuit line): Specht v. Netscape, 306
F.3d 17 (2d Cir. 2002) (browsewrap struck: terms below the fold); Berkson v. Gogo, 97
F. Supp. 3d 359 (E.D.N.Y. 2015) ("sign-in-wrap" unenforceable for inconspicuous
hyperlink); Nicosia v. Amazon, 834 F.3d 220 (2d Cir. 2016) (notice separated from
action button on cluttered page); Meyer v. Uber, 868 F.3d 66 (2d Cir. 2017) (leading
pro-enforcement case: uncluttered screen, notice coupled to the action). The proposed
design (full text rendered in-page, authenticated signer, typed-name-plus-click) is a
"scrollwrap-plus-typed-signature" pattern structurally above every enforced pattern
and clear of every defect that sank the failures.

Alaska-specific settled doctrine, the four-case arc:

- Kissick v. Schmierer, 816 P.2d 188 (Alaska 1991): intent to release future
  negligence claims "must be conspicuously and unequivocally expressed"; ambiguity
  construed against the drafter.
- Moore v. Hartley Motors, Inc., 36 P.3d 628 (Alaska 2001): ATV class not an
  "essential service" (no public-policy voidness), but reversed on scope — the
  release covered only inherent-risk negligence, not the ordinary negligence alleged.
- Ledgends, Inc. v. Kerr, 91 P.3d 960 (Alaska 2004): rock-gym waiver ineffective for
  insufficient clarity/conspicuousness.
- Donahue v. Ledgends, Inc., 331 P.3d 342 (Alaska 2014): the same gym's redrafted
  waiver upheld; the controlling six-factor test: (1) risk waived specifically and
  clearly set forth; (2) a negligence waiver must use the word "negligence"; (3)
  language clear, emphasized, and simple; (4) no public-policy violation; (5) if
  exculpating beyond inherent risks, it must say so; (6) no representation or
  insinuation of safety/maintenance standards.
- Langlois v. Nova River Runners, 2018 Alas. LEXIS 31 (Mar. 21, 2018): reaffirmed
  Donahue, upheld a rafting waiver; memorandum decision, persuasive only.

Statute: AS 09.65.290 (Civil Liability for Sports or Recreational Activities, 2001),
a general inherent-risk statute running alongside common-law waiver doctrine. No
Alaska statute specific to boating/sailing waivers found; AS 05.25 addresses
negligent-operation civil liability, not pre-injury waivers.

The core open question: no Alaska decision applies the Kissick/Donahue test to an
ELECTRONICALLY signed release, and none merges Alaska waiver doctrine with the
clickwrap line. Reasoning by analogy (the six factors test content, not medium; AS
09.80 gives electronic records parity) suggests the medium is unlikely to be the
failure point — but this is inference, for counsel to weigh. Alaska sits among
roughly twenty states with a strict clarity/conspicuousness standard (contrast
Virginia's Hiett line voiding such releases outright).

## 3. Record retention and integrity

- ESIGN, 15 U.S.C. § 7001(d)(1): retention satisfied by an electronic record that
  accurately reflects the information and remains accessible in a form capable of
  accurate reproduction. AS 09.80.090 tracks UETA §12 almost verbatim (confirmed via
  two independent secondary reproductions; direct primary fetch blocked in this pass).
- The per-signature full-text snapshot plus SHA-256 hash satisfies and exceeds the
  "accurately reflects" prong; the retrievable row satisfies accessibility. Practice
  guidance (BlueInk, useAnvil, Fenwick): relying on mutable git history alone is a
  known weakness; the snapshot+hash is the standard commercial pattern designed to
  survive FRE 901/902(13)-(14) authentication. Treat the git-versioned document as
  the authorial/template record and the DB snapshot as the evidentiary record.
- Alaska limitations: AS 09.10.070(a), 2-year personal-injury period (discovery rule
  applies). AS 09.10.140(a) tolls during minority (suit possible to roughly age 20);
  AS 09.10.140(c) additionally excludes pre-age-8 time for injuries before age 8.
  AS 09.10.055, the 10-year statute of repose, applies "notwithstanding the
  disability of minority" with exceptions (gross negligence, intentional acts,
  defective products, facts not reasonably discoverable).
- Retention recommendation (practice guidance): no automatic deletion; if a purge
  policy is ever wanted, floor no shorter than the signer's 20th birthday or 2 years
  post-membership-termination for adults, confirmed against AS 09.10.055 by counsel.

## 4. Minors and parental waivers

Majority rule elsewhere: a parent cannot waive a minor's own prospective claim
(Woodman v. Kera LLC, 785 N.W.2d 1 (Mich. 2010); Hojnowski v. Vans Skate Park, 901
A.2d 381 (N.J. 2006); Cooper v. Aspen Skiing, 48 P.3d 1229 (Colo. 2002), overridden
by C.R.S. § 13-22-107).

Alaska preempted the question by statute: AS 09.65.292 — a parent may, on the child's
behalf, release the child's prospective NEGLIGENCE claim against a "provider" of a
"sports or recreational activity," in writing, signed by the parent, with the
released activities "clearly and conspicuously set out." (b): a parent may NOT waive
reckless or intentional misconduct. (c): "parent" defined broadly — natural/adoptive
parent, legal guardian, court-appointed representative, agency representative,
power-of-attorney holder, or a qualifying relative (grandparent, aunt, uncle, or
adult sibling residing with the child). AS 09.65.290's "provider" definition
("whether for pay or otherwise") covers a nonprofit club.

Untested: whether courts import the Donahue six-factor test into 09.65.292's "clearly
and conspicuously" language; treatment of the qualifying-relative category. The flow
should capture: the signer's attested relationship per the statute's categories, the
minor's full legal name and date of birth as distinct fields, the parent's own
authenticated identity, and document text separating the parent's own waived claims
from the statutory election for the child.

## 5. Litigation evidentiary gaps

Framework: attribution + intent + integrity, carried by an audit trail. FRE 901 sets
a low bar; FRE 902(13)-(14) allow self-authentication with custodian certification (a
DocuSign-style Certificate of Completion is the standard vehicle).

The unresolved gap: a content hash proves the STORED text wasn't altered after
signing, not that the browser RENDERING matched it (a CSS/JS defect could display
something incomplete). Clickwrap litigation demands proof of "what the operative
version looked like at that time" (Cullinane; Meyer; Specht; the Boston Bar Journal
survey); Nager v. Tesla (D. Kan. 2019) refused arbitration where only generic process
descriptions were offered. Recording the frontend build hash per signature addresses
this; no published industry guidance was found resolving it otherwise.

Attribution strength: Schrock v. Nomac Drilling (W.D. Pa. 2016) upheld where the
audit trail corroborated the signer; IO Moonwalkers v. Banc of America (N.C. Ct. App.
2018) leaned on the access-view-sign chain plus post-signing conduct. IP alone is
weak (DHCP rotation, VPN, carrier-grade NAT); store the authentication event (token
id, issuance, consumption) tied to the signature. Sifuentes v. Dropbox (N.D. Cal.
2022): no evidence the user saw the notice defeats enforcement — the full-text
in-page display plus per-document affirmative act answers this.

Device fingerprinting: proportionality guidance associates it with regulated or
high-fraud contexts; email-link authentication plus a solid audit log is adequate for
a low-stakes nonprofit. Skipping it is a documented deliberate choice.

## Design verdict

Sound as-is: the typed-name flow (intent), magic-link + snapshot/hash record
(attribution and retention above the floors), full in-page text (conspicuousness),
annual re-sign, private-contract framing (101(c) likely inapplicable).

Required changes: draft text to the Donahue six factors with a documented pre-publish
checklist; explicit reckless/intentional carve-outs everywhere; the minors flow needs
its own capture (relationship category, minor name and DOB); store the authentication
event, not just IP.

Recommended strengthenings: on-demand certificate-of-completion artifact; record the
frontend build hash per signature; never auto-delete; skip fingerprinting with the
reasoning documented.

Attorney questions: any Alaska law independently requiring these documents in writing
(101(c) trigger); gross-negligence waivability in Alaska; Donahue-into-09.65.292
importation; electronic form under 09.65.292's "in writing, signed"; the
qualifying-relative policy; the final retention floor.
