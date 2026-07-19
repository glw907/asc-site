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
// member-facing words are verbatim from docs/waivers/signing-framing-copy.md. This route does not
// gate join/renewal/payment (that is T5's household-complete gate); it is the signing surface T5's
// "Needs your attention" row and the gated flows link into, reachable standalone from the portal.
import { redirect, fail } from '@sveltejs/kit';
import { version } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { issueMemberCsrfToken } from '$member-auth/lib/auth';
import { resolveMemberDb } from '$member-auth/lib/db';
import { portalAction } from '$member-portal/lib/portal-action';
import { documents } from '$chassis/content';
import { renderMarkdown } from '$theme/cairn.config';
import { getCurrentSeason } from '$admin-club/lib/club-settings';
import { getHouseholdInfo, getHouseholdAddress, listHouseholdMembers } from '$member-portal/lib/household';
import { listHouseholdAssignments } from '$member-portal/lib/assets';
import { computeAge } from '$member-portal/lib/age-gate';
import { loadPublishedDocuments } from '$theme/documents';
import {
  deriveHouseholdRequirements,
  type AssetKind,
  type SignatureRecord,
} from '$member-portal/lib/waiver-requirements';
import {
  applyContactUpdate,
  hasContactConfirmation,
  isSignerRelationship,
  isSigningContext,
  loadMomentSignatures,
  recordContactConfirmation,
  recordSignature,
  resolveSessionAuthEvent,
  type SigningContext,
} from '$member-portal/lib/signatures';
import { buildSigningMoment, type SigningItem } from './sign-view';

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

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) redirect(303, '/my-account');

  const db = resolveMemberDb(event.platform?.env);
  if (!db) return { csrf, degraded: true as const, context: resolveContext(event.url) };

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

  return {
    csrf,
    degraded: false as const,
    context,
    season,
    moment,
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

    let minor: { memberId: string; relationship: 'parent' | 'legal-guardian' | 'agency-representative' | 'power-of-attorney' | 'qualifying-relative' } | undefined;
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
    return { saved: true as const };
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
