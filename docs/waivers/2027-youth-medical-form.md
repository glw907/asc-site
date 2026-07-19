---
title: "Youth Medical & Emergency Form—field set and consent text"
kind: acknowledgement
audience: youth-class
season: 2027
status: draft
---

> **DRAFT for attorney review—not in force.** Drafted 2026-07-18. This document is
> part structured data, part signature: the field set defines what the class-signup
> flow collects per child per season, and the consent block at the end is the signed
> text. Modeled on the University Yacht Club, Quassapaug Sailing Center, and US
> Sailing youth forms. Drafting notes follow.

# Alaska Sailing Club—Youth Medical & Emergency Form

**Season: 2027. One form per child, completed fresh each season** (medical facts
change; last year's form is never carried forward). A parent or guardian completes
and signs it at youth class signup, and instructors for the child's class can view
it for the duration of the class.

## Field set

### The child

| Field | Type | Required |
|---|---|---|
| Full legal name | text (prefilled from household roster) | yes |
| Date of birth | date (prefilled from household roster) | yes |
| Swim comfort | choice: comfortable / learning / non-swimmer | yes |

### Emergency contacts

At least two contacts, ordered. The signing parent is contact 1 by default.

| Field | Type | Required |
|---|---|---|
| Name | text | yes |
| Relationship to child | text | yes |
| Phone | phone | yes |
| **Authorized to pick up the child** | checkbox, per contact | explicit choice |

Pickup authorization is its own flag, never inferred: an emergency contact is not
automatically a person the club may release the child to.

### Medical information

| Field | Type | Required |
|---|---|---|
| Conditions checklist | checkboxes: asthma / diabetes / cardiac condition / seizures or epilepsy / food allergy / medication allergy / insect-sting allergy / other | yes ("none" is an explicit choice) |
| Condition details, incl. severity and response plan | text, required when any box is checked | conditional |
| Current medications and dosages | text ("none" explicit) | yes |
| Medications the child carries at class (inhaler, EpiPen, ...) | text | no |
| Physician name and phone | text | yes |
| Insurance carrier and policy number | text | yes |

## Signed consent text

**Consent to emergency treatment.** If my child is injured or becomes ill during
club activities and I cannot be reached, I authorize the Club's instructors and
officers to obtain emergency medical care for my child, including first aid,
ambulance transport, evacuation, and hospital treatment, and I authorize the
treating providers to act on their consent. I am solely responsible for all costs
of that care, transport, evacuation, and rescue.

**My information is true.** The medical information I have given is complete and
current to the best of my knowledge, and I will tell the Club if it changes during
the season.

**Who may collect my child.** The Club may release my child only to me or to a
contact I marked as authorized for pickup.

I agree that typing my legal name and clicking Sign creates a binding electronic
signature.

---

## Drafting notes for the attorney (not part of the signed document)

1. **This is operational data, not a waiver** (ratified decision 9's second
   exception): the release of liability for class participation lives in the
   general release's Part Two. This form exists so an instructor on a dock with a
   sick child knows who to call, what the child's conditions are, and that
   treatment is authorized. Please review the consent-to-treat wording.
2. **Cadence.** Fresh per season, per child, at class signup—unlike the waivers,
   because stale medical data is operationally dangerous, not just legally stale.
3. **Field-set sources.** UYC two-part packet (info + consent-to-treat with cost
   language), Quassapaug camper emergency form (denial-of-participation if
   unsigned), US Sailing medical form, Burlington's allergy variant. Burlington's
   medical-professional countersignature on allergies was considered and not
   adopted (disproportionate for a small volunteer club)—flag if you disagree.
4. **Access control.** Instructor visibility is scoped to the child's class and
   season in the build; the form data never appears in any member-facing surface.
5. **Photo/media consent for minors is deliberately NOT on this form**—it is a
   separate, revocable, standing consent (the Quassapaug model), handled at class
   signup or on the household profile, outside this per-season medical form.
