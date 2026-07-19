// The fresh-join household-complete gate at submit (member-waivers T5c): when a signable document
// applies to the joining household, the application's rows are persisted UNPAID, NO Stripe checkout
// is created (nothing money-derived is stored), and the purchaser is emailed their own sign-in link
// deep-linking straight to the signing moment. These tests mock the published-documents loader (the
// real documents are all `status: draft`, so the live loader returns an empty map -- the shipped
// pass-through covered in `join-apply-form.test.ts`) to exercise the gate's OTHER branch.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentFrontmatter, SignableDocument } from '$theme/documents';
import { handleJoinApply, type JoinApplySubmission } from '$theme/join-apply-form';
import { requestMemberLink } from '$member-auth/lib/auth';
import { fakeD1 } from './_fake-d1';

// A published all-members general release: applies to every adult, so no fresh join is ever
// signature-complete while it is published (the purchaser has not signed at submit). Returned by
// the mocked loader below regardless of season.
function publishedRelease(): Map<string, SignableDocument> {
  const frontmatter: DocumentFrontmatter = {
    title: 'Release of Liability and Assumption of Risk',
    document: 'general-release',
    version: 1,
    kind: 'release',
    audience: 'all-members',
    season: 2026,
    status: 'published',
  };
  const doc: SignableDocument = {
    concept: 'documents',
    id: 'general-release-2026-v1',
    slug: 'general-release-2026-v1',
    permalink: '',
    title: frontmatter.title,
    tags: [],
    excerpt: '',
    wordCount: 0,
    draft: false,
    fields: {},
    frontmatter,
    body: 'The release text.',
  };
  return new Map([[frontmatter.document, doc]]);
}

vi.mock('../theme/documents', () => ({
  loadPublishedDocuments: vi.fn(() => publishedRelease()),
}));

vi.mock('../member-auth/lib/auth', () => ({
  requestMemberLink: vi.fn().mockResolvedValue({ status: 'sent' }),
}));

const ORIGIN = 'https://dev.aksailingclub.org';
const JOIN_SIGN_NEXT = '/my-account/sign?context=join';

const TIER_PRICE_ROWS = [
  { key: 'tier_price_individual', value: '250' },
  { key: 'tier_price_family', value: '500' },
  { key: 'tier_price_young_adult', value: '100' },
];

function submission(overrides: Partial<JoinApplySubmission> = {}): JoinApplySubmission {
  return {
    tier: 'individual',
    purchaserName: 'Ada Lovelace',
    purchaserEmail: 'ada@example.com',
    purchaserPhone: '',
    purchaserBirthdate: '',
    members: [],
    picks: [],
    'cf-turnstile-response': '',
    ...overrides,
  };
}

describe('handleJoinApply with published documents (the household-complete gate)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(requestMemberLink).mockClear();
  });

  it('a solo join persists the unpaid rows, takes NO payment, and emails the purchaser a deep-linked sign-in link', async () => {
    const { db, calls } = fakeD1({
      allResults: { tier_price_individual: TIER_PRICE_ROWS },
      firstResults: { "'current_season'": { value: '2026' } },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await handleJoinApply(submission(), { CLUB_DB: db, STRIPE_SECRET_KEY: 'sk_test_1', EMAIL: { send } }, '203.0.113.5', ORIGIN);

    // The application is persisted (household + members + the unpaid membership row)...
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO households'))).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO memberships'))).toBe(true);
    // ...but NOTHING money-derived: no Stripe Checkout Session was ever created.
    expect(fetchSpy).not.toHaveBeenCalled();

    expect(result).toEqual({ pivot: 'sign-required' });
    expect(requestMemberLink).toHaveBeenCalledTimes(1);
    expect(requestMemberLink).toHaveBeenCalledWith(
      db,
      'ada@example.com',
      expect.any(Function),
      expect.objectContaining({ origin: ORIGIN, from: 'noreply@aksailingclub.org', next: JOIN_SIGN_NEXT }),
    );
  });

  it('a family join with a child also gates at submit (no payment, the sign-required pivot)', async () => {
    const { db, calls } = fakeD1({
      allResults: { tier_price_family: TIER_PRICE_ROWS },
      firstResults: { "'current_season'": { value: '2026' } },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await handleJoinApply(
      submission({ tier: 'family', members: [{ name: 'Bram Lovelace', birthdate: '2014-01-01', email: '' }] }),
      { CLUB_DB: db, STRIPE_SECRET_KEY: 'sk_test_1', EMAIL: { send } },
      '203.0.113.5',
      ORIGIN,
    );

    expect(result).toEqual({ pivot: 'sign-required' });
    expect(fetchSpy).not.toHaveBeenCalled();
    // Both members are persisted (the purchaser and the child), so the whole household is saved
    // unpaid and ready to sign.
    expect(calls.filter((c) => c.sql.startsWith('INSERT INTO members ('))).toHaveLength(2);
    expect(requestMemberLink).toHaveBeenCalledTimes(1);
  });

  it('degrades silently (still the pivot) when EMAIL is not bound', async () => {
    const { db } = fakeD1({
      allResults: { tier_price_individual: TIER_PRICE_ROWS },
      firstResults: { "'current_season'": { value: '2026' } },
    });
    vi.stubGlobal('fetch', vi.fn());

    const result = await handleJoinApply(submission(), { CLUB_DB: db, STRIPE_SECRET_KEY: 'sk_test_1' }, '203.0.113.5', ORIGIN);

    expect(result).toEqual({ pivot: 'sign-required' });
    expect(requestMemberLink).not.toHaveBeenCalled();
  });
});
