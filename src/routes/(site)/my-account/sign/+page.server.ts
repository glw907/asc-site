// /my-account/sign (member-waivers T4): the one continuous signing moment. Presents everything
// outstanding for the signed-in member -- their own applicable documents, each household minor's
// Part Two as its own entry, and (for the household's responsible adult) the household's asset
// documents -- as one accordion the member clears in a sitting, then, for a mooring or storage
// holder, the contact-confirm glance card. Every signature is recorded server-side from the exact
// text served (the snapshot and hash are taken here, never trusted from the client), and the load
// re-derives the outstanding set on every navigation so a signed entry collapses to a receipt and
// the next one becomes current.
//
// The design is the RATIFIED probe (docs/design-benchmark/waivers-signing-round-1-arc.md); the
// member-facing words are verbatim from docs/waivers/signing-framing-copy.md. This route is the
// signing surface the portal's "Needs your attention" row and the gated flows (renew, asset fees,
// class signup) link into, reachable standalone from the portal too.
//
// Member-waivers T5b adds the join/renewal household-complete loop's OWN half here: once the
// signer's own moment is done, `load` also reports whether the whole household is complete
// (`household.active`/`household.complete`/`household.rows`), the `sendNudge` action lets an
// adult with nothing left of their own email another outstanding adult a sign-in link
// (cooldown-guarded), and the `sign` action fires the one-time resumption email to the managing
// adult once THEIR signature is the one that completes the household (never when the managing
// adult is the one signing -- their own moment continues straight to payment). The money-moment
// HARD GATE itself (redirecting a member here before they can pay) lives in each gated route's own
// file (`/my-account/renew`, the landing's asset-fee actions, `/my-account/classes`'s own
// register action), never here: this route only ever reports and records, it never refuses a visit.
import { redirect, fail } from '@sveltejs/kit';
import { version } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { issueMemberCsrfToken } from '$member-auth/lib/auth';
import { resolveMemberDb } from '$member-auth/lib/db';
import { portalAction, type PortalActionContext, type PortalActionEvent } from '$member-portal/lib/portal-action';
import { documents } from '$chassis/content';
import { renderMarkdown } from '$theme/cairn.config';
import { getCurrentSeason } from '$admin-club/lib/club-settings';
import { getHouseholdInfo, getHouseholdAddress, listHouseholdMembers } from '$member-portal/lib/household';
import { listHouseholdAssignments } from '$member-portal/lib/assets';
import { computeAge } from '$member-portal/lib/age-gate';
import { loadPublishedDocuments } from '$theme/documents';
import {
  deriveHouseholdRequirements,
  loadHouseholdRequirements,
  type AssetKind,
  type SignatureRecord,
} from '$member-portal/lib/waiver-requirements';
import { householdSignatureGate } from '$member-portal/lib/household-signature-gate';
import {
  applyContactUpdate,
  hasContactConfirmation,
  isSignerRelationship,
  isSigningContext,
  loadMomentSignatures,
  recordContactConfirmation,
  recordSignature,
  resolveSessionAuthEvent,
  type SignerRelationship,
  type SigningContext,
} from '$member-portal/lib/signatures';
import { nudgeRecentlySent, resumptionAlreadySent, sendWaiverNudgeEmail, sendWaiverResumptionEmail } from '$member-portal/lib/waiver-notify';
import type { EmailBindingEnv } from '$admin-club/lib/club-email';
import { isSafeNextPath } from '$member-portal/lib/return-path';
import { buildHouseholdSignatureRows, buildSigningMoment, waitingIntroLine, type SigningItem } from './sign-view';

export const prerender = false;

/** Alaska's age of majority, the line AS 09.65.292's parental election turns on (matching
 *  `waiver-requirements.ts`'s own `ADULT_MIN_AGE`; a member with no birthdate reads as an adult,
 *  the same permissive default). */
const ADULT_MIN_AGE = 18;

/** The asset kinds whose holder gets the Borough contact-confirm step: a mooring, or any of the
 *  three dry-storage kinds (all covered by the Dry Storage Agreement). */
const CONTACT_CONFIRM_KINDS: ReadonlySet<AssetKind> = new Set(['mooring', 'rv-parking', 'boat-parking', 'small-boat-rack']);

/** The season's context, from `?context=`, defaulting to `renewal` for a standalone portal visit;
 *  the gated flows T5 wires pass their own (`join`, `mooring-fee`, ...). */
function resolveContext(url: URL): SigningContext {
  const raw = url.searchParams.get('context');
  return raw && isSigningContext(raw) ? raw : 'renewal';
}

/** The completion coda's own "return to what they were doing" target (member-waivers T5b), from
 *  `?next=` -- `$member-portal/lib/return-path.ts`'s own closed allowlist, `null` for anything it
 *  does not recognize. */
function resolveNext(url: URL): string | null {
  const raw = url.searchParams.get('next');
  return isSafeNextPath(raw) ? raw : null;
}

/** The join/renewal household-complete loop's own money-moment paths (member-waivers T5b/T5c, spec
 *  rule 7's amendment): where the resumption email deep-links once the household finishes. Renewal
 *  resumes at `/my-account/renew` (its `dues` checkout); a join resumes at
 *  `/my-account/finish-joining` (T5c's own join payment-resume door, which rebuilds the join
 *  checkout from the persisted rows). `null` for the non-money contexts (class-signup, asset fees),
 *  which never enter this household-complete loop. */
function paymentPathFor(context: SigningContext): string | null {
  if (context === 'renewal') return '/my-account/renew';
  if (context === 'join') return '/my-account/finish-joining';
  return null;
}

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) redirect(303, '/my-account');

  const db = resolveMemberDb(event.platform?.env);
  if (!db) return { csrf, degraded: true as const, context: resolveContext(event.url), next: resolveNext(event.url) };

  const season = await getCurrentSeason(db);
  const context = resolveContext(event.url);
  const householdId = member.householdId;

  const [household, memberRows, assignments, momentSignatures, address] = await Promise.all([
    getHouseholdInfo(db, householdId),
    listHouseholdMembers(db, householdId),
    listHouseholdAssignments(db, householdId, season),
    loadMomentSignatures(db, householdId, season),
    getHouseholdAddress(db, householdId),
  ]);

  const publishedDocuments = loadPublishedDocuments(documents, season);
  const activeMembers = memberRows.filter((row) => row.archivedAt === null);
  const assetKinds = [...new Set(assignments.map((assignment) => assignment.assetType as AssetKind))];

  // The engine's SignatureRecord is the minimal shape; the moment rows carry the extra display
  // fields, so the derivation reads the ids off them and the view reads the names off them too.
  const signatureRecords: SignatureRecord[] = momentSignatures.map((row, index) => ({
    id: `sig-${index}`,
    documentId: row.documentId,
    season,
    memberId: row.memberId,
    minorMemberId: row.minorMemberId,
    signedAt: row.signedAt,
  }));

  const requirements = deriveHouseholdRequirements({
    season,
    primaryMemberId: household?.primaryMemberId ?? null,
    members: activeMembers.map((row) => ({ id: row.id, name: row.name, birthdate: row.birthdate })),
    assetKinds,
    publishedDocuments,
    signatures: signatureRecords,
  });

  const birthYearById = new Map<string, number | null>(
    activeMembers.map((row) => [row.id, row.birthdate ? Number(row.birthdate.slice(0, 4)) || null : null]),
  );

  const signerRequirements = requirements.adults.find((adult) => adult.memberId === member.id);

  // Build the moment's items: the signer's own documents, then every household minor's Part Two.
  const items: SigningItem[] = [];

  for (const requirement of signerRequirements?.requirements ?? []) {
    const documentId = requirement.document.frontmatter.document;
    const signature = momentSignatures.find((row) => row.documentId === documentId && row.memberId === member.id && row.minorMemberId === null);
    items.push({
      key: documentId,
      kind: 'personal',
      documentId,
      version: requirement.document.frontmatter.version,
      documentKind: requirement.document.frontmatter.kind,
      title: requirement.document.frontmatter.title,
      bodyHtml: requirement.signed ? '' : await renderMarkdown(requirement.document.body),
      signature: signature ? { personName: signature.personName, signerRelationship: signature.signerRelationship, signedAt: signature.signedAt } : undefined,
    });
  }

  for (const minorRequirement of requirements.minors) {
    const documentId = minorRequirement.document.frontmatter.document;
    const signature = momentSignatures.find((row) => row.documentId === documentId && row.minorMemberId === minorRequirement.minorMemberId);
    items.push({
      key: `${documentId}:${minorRequirement.minorMemberId}`,
      kind: 'minor',
      documentId,
      version: minorRequirement.document.frontmatter.version,
      documentKind: minorRequirement.document.frontmatter.kind,
      title: minorRequirement.document.frontmatter.title,
      bodyHtml: minorRequirement.signed ? '' : await renderMarkdown(minorRequirement.document.body),
      minor: {
        memberId: minorRequirement.minorMemberId,
        name: minorRequirement.minorName,
        birthYear: birthYearById.get(minorRequirement.minorMemberId) ?? null,
      },
      signature: signature ? { personName: signature.personName, signerRelationship: signature.signerRelationship, signedAt: signature.signedAt } : undefined,
    });
  }

  const moment = buildSigningMoment(items, { season });

  // The contact-confirm step: the responsible adult of a mooring/storage-holding household, once
  // per season, after the last signature. Prefilled from the member's own contact row and the
  // household address.
  const isResponsibleAdult = member.id === (household?.primaryMemberId ?? null);
  const assetConfirmApplies = isResponsibleAdult && assetKinds.some((kind) => CONTACT_CONFIRM_KINDS.has(kind));
  const contactConfirmed = assetConfirmApplies ? await hasContactConfirmation(db, member.id, season) : false;
  const signerRow = activeMembers.find((row) => row.id === member.id);
  const contactPrefill = {
    email: signerRow?.email ?? '',
    phone: signerRow?.phone ?? '',
    addressLine1: address?.addressLine1 ?? '',
    addressLine2: address?.addressLine2 ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    postalCode: address?.postalCode ?? '',
  };

  // The join/renewal household-complete loop (member-waivers T5b, spec rule 7's amendment): once
  // the signer's own moment is done, a household still waiting on another adult sees the waiting
  // state instead of the plain completion coda. `active` only for a household that is actually a
  // family in the relevant sense (another adult, or a minor) -- an individual-tier household of
  // one adult with no minors has nothing to wait on and never renders this block at all.
  const isLoopContext = context === 'join' || context === 'renewal';
  const minorNames = [...new Set(requirements.minors.map((minor) => minor.minorName))];
  const householdActive = isLoopContext && (requirements.adults.length > 1 || minorNames.length > 0);
  const gate = householdSignatureGate(requirements);
  const remainingOtherAdultNames = gate.remaining.filter((r) => r.role === 'adult' && r.memberId !== member.id).map((r) => r.name);

  // A completed join's own completion coda continues to the payment-resume door rather than back
  // to the portal (member-waivers T5c): the magic link deep-links here with no `?next=`, so this
  // is where a fresh join's payment step is named. Any other context (or an incomplete join, which
  // renders the waiting state instead of the coda) keeps the ordinary `?next=` return.
  const next = context === 'join' && gate.complete ? paymentPathFor('join') : resolveNext(event.url);

  return {
    csrf,
    degraded: false as const,
    context,
    next,
    season,
    moment,
    household: {
      active: householdActive,
      complete: gate.complete,
      introLine: householdActive && remainingOtherAdultNames.length > 0 ? waitingIntroLine(remainingOtherAdultNames) : null,
      rows: householdActive
        ? buildHouseholdSignatureRows({ signerMemberId: member.id, signerSignedCount: moment.signedCount, signerTotal: moment.total, minorNames, requirements })
        : [],
    },
    contact: {
      applies: assetConfirmApplies,
      confirmed: contactConfirmed,
      prefill: contactPrefill,
    },
  };
};

/** Resolve the published document the sign form names, guarding the version against the client's
 *  claim (a stale tab could post an old version; the server signs the current published one). */
function resolvePublishedDocument(season: number, documentId: string) {
  const published = loadPublishedDocuments(documents, season);
  return published.get(documentId) ?? null;
}

/**
 * The household-complete loop's own closing half (member-waivers T5b): after a fresh signature
 * lands in a join/renewal context, re-check the household from a fresh read (never the `load`
 * that rendered this page, which is now stale) and, if that signature was the last one the
 * household owed, send the managing adult the resumption email -- unless the signer IS the
 * managing adult (`ctx.isPrimary`), whose own moment continues straight to payment, exactly the
 * spec's own "unless the signer IS the managing adult". Best-effort throughout (a notify failure
 * never fails the signature that already committed), and a `join` context sends nothing yet (see
 * {@link paymentPathFor}'s own header).
 */
async function maybeSendResumptionEmail(ctx: PortalActionContext, event: PortalActionEvent, context: SigningContext, season: number): Promise<void> {
  if (ctx.isPrimary) return;
  const paymentPath = paymentPathFor(context);
  if (!paymentPath) return;

  try {
    const publishedDocuments = loadPublishedDocuments(documents, season);
    const requirements = await loadHouseholdRequirements(ctx.db, publishedDocuments, ctx.member.householdId, season);
    if (!requirements || !householdSignatureGate(requirements).complete) return;
    if (await resumptionAlreadySent(ctx.db, ctx.member.householdId, season)) return;

    const household = await getHouseholdInfo(ctx.db, ctx.member.householdId);
    const primaryId = household?.primaryMemberId;
    if (!primaryId) return;
    const primaryRow = await ctx.db.prepare('SELECT name, email FROM members WHERE id = ?1').bind(primaryId).first<{ name: string; email: string | null }>();
    if (!primaryRow) return;

    const env = event.platform?.env as EmailBindingEnv | undefined;
    if (!env) return;
    await sendWaiverResumptionEmail(ctx.db, env, {
      manager: { memberId: primaryId, name: primaryRow.name, email: primaryRow.email },
      signerName: ctx.member.name,
      householdId: ctx.member.householdId,
      season,
      paymentPath,
      origin: event.url.origin,
    });
  } catch (err) {
    console.error('member-portal: waiver resumption email failed after a committed signature', err);
  }
}

export const actions: Actions = {
  sign: portalAction(async ({ form, ctx, event }) => {
    const documentId = String(form.get('documentId') ?? '');
    const typedName = String(form.get('name') ?? '');
    const minorMemberId = String(form.get('minorMemberId') ?? '').trim();
    const relationshipRaw = String(form.get('relationship') ?? '').trim();
    const context = resolveContext(event.url as URL);

    const season = await getCurrentSeason(ctx.db);
    const document = resolvePublishedDocument(season, documentId);
    if (!document) return fail(400, { error: 'That document is no longer available to sign.' });

    let minor: { memberId: string; relationship: SignerRelationship } | undefined;
    if (minorMemberId) {
      if (!isSignerRelationship(relationshipRaw)) {
        return fail(400, { error: 'Choose how you are related to this child before you sign.' });
      }
      // The minor must be a real, minor member of the signer's own household (never free-typed).
      const child = await ctx.db
        .prepare('SELECT birthdate FROM members WHERE id = ?1 AND household_id = ?2 AND archived_at IS NULL')
        .bind(minorMemberId, ctx.member.householdId)
        .first<{ birthdate: string | null }>();
      if (!child) return fail(400, { error: 'That is not a member of your household.' });
      if (child.birthdate && computeAge(child.birthdate) >= ADULT_MIN_AGE) {
        return fail(400, { error: 'That member signs for themselves.' });
      }
      minor = { memberId: minorMemberId, relationship: relationshipRaw };
    }

    const authEvent = await resolveSessionAuthEvent(ctx.db, ctx.sessionId);
    const result = await recordSignature(ctx.db, {
      member: { id: ctx.member.id, email: ctx.member.email },
      document,
      season,
      context,
      typedName,
      ipAddress: event.getClientAddress?.() ?? null,
      buildHash: version,
      authEvent,
      minor,
    });
    if (!result.ok) return fail(400, { error: result.error });
    if (!result.noop && (context === 'join' || context === 'renewal')) {
      await maybeSendResumptionEmail(ctx, event, context, season);
    }
    return { saved: true as const };
  }),

  sendNudge: portalAction(async ({ form, ctx, event }) => {
    const context = resolveContext(event.url as URL);
    if (context !== 'join' && context !== 'renewal') {
      return fail(400, { error: 'Not available for this signing context.' });
    }
    const targetMemberId = String(form.get('targetMemberId') ?? '');
    if (!targetMemberId) return fail(400, { error: 'Missing member id.' });

    const season = await getCurrentSeason(ctx.db);
    const publishedDocuments = loadPublishedDocuments(documents, season);
    const requirements = await loadHouseholdRequirements(ctx.db, publishedDocuments, ctx.member.householdId, season);
    if (!requirements) return fail(400, { error: 'Household not found.' });

    // The nudge target must be an OTHER adult of this SAME household with a real outstanding
    // signature (server-side denial, member-waivers T5b rule 1's own "one adult never signs for
    // another" -- this is the send-side mirror: a member never nudges someone outside their own
    // household, and never spams an adult who has nothing left to sign).
    const target = householdSignatureGate(requirements).remaining.find((r) => r.role === 'adult' && r.memberId === targetMemberId);
    if (!target || targetMemberId === ctx.member.id) {
      return fail(400, { error: 'That member has nothing of their own outstanding to sign.' });
    }

    if (await nudgeRecentlySent(ctx.db, targetMemberId, season)) {
      return { nudgeSent: true as const };
    }

    const targetRow = await ctx.db
      .prepare('SELECT email FROM members WHERE id = ?1 AND household_id = ?2 AND archived_at IS NULL')
      .bind(targetMemberId, ctx.member.householdId)
      .first<{ email: string | null }>();

    const env = event.platform?.env as EmailBindingEnv | undefined;
    if (env && targetRow) {
      await sendWaiverNudgeEmail(ctx.db, env, {
        managerName: ctx.member.name,
        target: { memberId: targetMemberId, name: target.name, email: targetRow.email },
        season,
        context,
        outstandingCount: target.outstandingCount,
        origin: event.url.origin,
      });
    }
    return { nudgeSent: true as const };
  }),

  confirmContact: portalAction(async ({ ctx, event }) => {
    const season = await getCurrentSeason(ctx.db);
    const context = resolveContext(event.url as URL);
    // "This is current": record the confirmation snapshotting the values already on file, no edit.
    const [signerRow, address] = await Promise.all([
      ctx.db.prepare('SELECT email, phone FROM members WHERE id = ?1').bind(ctx.member.id).first<{ email: string | null; phone: string | null }>(),
      getHouseholdAddress(ctx.db, ctx.member.householdId),
    ]);
    await recordContactConfirmation(ctx.db, {
      memberId: ctx.member.id,
      householdId: ctx.member.householdId,
      season,
      context,
      values: {
        email: signerRow?.email ?? null,
        phone: signerRow?.phone ?? null,
        addressLine1: address?.addressLine1 ?? null,
        addressLine2: address?.addressLine2 ?? null,
        city: address?.city ?? null,
        state: address?.state ?? null,
        postalCode: address?.postalCode ?? null,
      },
    });
    return { saved: true as const };
  }),

  updateContact: portalAction(async ({ form, ctx, event }) => {
    const season = await getCurrentSeason(ctx.db);
    const context = resolveContext(event.url as URL);
    // "Update it": write the new values to the live records (so the club can reach the member),
    // then record the confirmation snapshotting exactly what was written.
    const values = await applyContactUpdate(ctx.db, ctx.member.id, ctx.member.householdId, {
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      addressLine1: String(form.get('addressLine1') ?? ''),
      addressLine2: String(form.get('addressLine2') ?? ''),
      city: String(form.get('city') ?? ''),
      state: String(form.get('state') ?? ''),
      postalCode: String(form.get('postalCode') ?? ''),
    });
    await recordContactConfirmation(ctx.db, {
      memberId: ctx.member.id,
      householdId: ctx.member.householdId,
      season,
      context,
      values,
    });
    return { saved: true as const };
  }),
};
