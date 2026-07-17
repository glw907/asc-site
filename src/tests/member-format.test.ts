import { describe, expect, it } from 'vitest';
import { formatMemberCents } from '$member-auth/lib/format';

// The member-facing money formatter (portal redesign pass). Distinct from `$admin-club/lib/ui`'s
// own always-two-decimals `formatCents`: a member reading their short receipts list gets "$250",
// the admin's ledger column keeps its fixed decimal place. The review gate's own finding on the
// first cut was that amounts DROPPED the cents digit outright, so the pair of cases below (whole
// dollars bare, real cents always shown) is the actual contract, not just the pretty half.
describe('formatMemberCents', () => {
  it('renders a whole-dollar amount with no decimal noise, matching mock D receipts', () => {
    expect(formatMemberCents(25000)).toBe('$250');
    expect(formatMemberCents(15000)).toBe('$150');
  });

  it('renders real cents whenever they exist, never silently rounding them away', () => {
    expect(formatMemberCents(24750)).toBe('$247.50');
    expect(formatMemberCents(1)).toBe('$0.01');
    expect(formatMemberCents(99)).toBe('$0.99');
  });

  it('pads a single-digit cents value rather than reading as tens', () => {
    expect(formatMemberCents(25005)).toBe('$250.05');
  });

  it('groups thousands', () => {
    expect(formatMemberCents(123456)).toBe('$1,234.56');
    expect(formatMemberCents(500000)).toBe('$5,000');
  });

  it('renders zero as a bare dollar amount', () => {
    expect(formatMemberCents(0)).toBe('$0');
  });

  // The ledger stores refunds as signed rows (0021_money_ledger). The receipts list is scoped to
  // charges today, so this is contract insurance for the pass that adds them, not a live path.
  it('keeps a negative amount signed', () => {
    expect(formatMemberCents(-15000)).toBe('-$150');
    expect(formatMemberCents(-24750)).toBe('-$247.50');
  });
});
