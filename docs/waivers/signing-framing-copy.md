# Signing-flow framing copy

> The finished words for the T4 signing moment, drafted in the waivers sitting from
> `docs/content-briefs/signing-framing-copy.md` and revised against an independent
> critic pass (2026-07-18). The build implements these verbatim; the attorney
> reviews the framing lines beside the documents. The hard rule throughout: a
> framing line says what a document is and why the club asks—it never paraphrases,
> summarizes, or softens what the document legally does. That rule cuts both ways:
> the lines below deliberately do not describe what any document contains, because
> the document itself, shown in full, is the only voice on its own effect.

## Welcome line

Shown once at the top of the signing moment. `{N}` is the document count; the time
estimate is `max(2, 2 × N)` minutes, rounded to a friendly number. The welcome
never claims the member is finished after signing—in the join, renewal, and
asset-fee flows, payment or other steps may follow.

> **Signatures for the {season} season.**
> {N} documents need your signature. Each one is shown in full—plan on about
> {minutes} minutes to read and sign.

Single-document variant:

> **A signature for the {season} season.**
> One document needs your signature. It's shown in full below—plan on a couple of
> minutes to read and sign.

## Progress marker

> Document {i} of {N}

On the list of what remains (the signing page's outstanding view):

> Signed · {title}
> Still to sign · {title}

## Per-document framing lines

One line under each document's title, above the full text. The line names the
document and directs the member into the text; the text speaks for itself.

**Release of Liability and Assumption of Risk**

> This is the club's liability release. Read it in full before you sign: your
> signature means you accepted exactly this text.

**Release of Liability—Part Two, signed per child**

> You're signing this part for {child's name}, as their parent or guardian. Read
> it in full before you sign.

**Club Rules Acknowledgement**

> These are the rules every member agrees to live by. Your signature is the club's
> record that you've read the current season's version.

**Mooring Agreement**

> This is the agreement that comes with your mooring. Read it in full before you
> sign.

**Dry Storage Agreement**

> This is the agreement that comes with your storage space. Read it in full before
> you sign.

**Trailer Row Use Guidelines**

> These are the rules for your Trailer Row space this season.

**Trailered Boat Parking Rules**

> These are the rules for your boat-parking space this season.

**Rack Storage Rules**

> These are the rules for your rack space this season.

**Youth Medical & Emergency Form**

> This is the medical and emergency information {child's name}'s instructors need.
> It's filled out fresh each season.

## The sign row

Label over the name field:

> Type your full legal name

Helper line under the field:

> The club keeps a record of the text you saw, your name as you typed it, and the
> date and time.

Button:

> Sign

After signing a document (inline confirmation, before the next document scrolls
into view):

> Signed {date} as {name}.

## Contact-confirm step (storage and mooring holders)

Card title and line, prefilled fields below (email, phone, mailing address). The
rationale is worded to hold for both agreements—each carries a
notice-to-contact-on-file term, and the storage agreement's Borough clause runs on
72 hours—without attributing the Borough clause to the mooring.

> **Can the club reach you?**
> If your boat or stored property ever has to move on short notice, the clock
> starts when the club contacts you. Confirm this is current.

Confirm action:

> This is current

Edit affordance (opens the same fields editable):

> Update it

## Completion

When everything is signed (and confirmed, where the step applies):

> **That's everything for {season}.**
> Nothing else needs your signature until next season.

Then the flow returns the member to what they were doing; the return action names
it ("Back to renewal," "Back to class signup," "Back to your account").

## Portal "Needs your attention" row

> {N} documents need your signature for the {season} season.

Single:

> The {title} needs your signature for the {season} season.

Row action: **Read and sign**

## Class signup, when the release is already on file

Nothing is shown. No framing line, no reassurance—the flow simply proceeds.
(Decision 9: a member handles the release once, at join or renewal.)
