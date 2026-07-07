// The Assets screen's shared form validation (Part 2): one parser per posted form shape, the
// same one-parser-per-concept idiom `class-form-input.ts` already established for Classes.
import { PAYMENT_METHODS, type PaymentMethod } from '$admin-club/lib/assets-store';

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Parse an "assign" form post: an asset type and a household membership are required, a
 *  description is optional. */
export function parseAssignForm(form: FormData): { assetType: string; membershipId: string; description: string | null } | { error: string } {
  const assetType = form.get('assetType');
  if (typeof assetType !== 'string' || !assetType.trim()) {
    return { error: 'An asset type is required.' };
  }
  const membershipId = form.get('membershipId');
  if (typeof membershipId !== 'string' || !membershipId.trim()) {
    return { error: 'A household is required.' };
  }
  return { assetType: assetType.trim(), membershipId: membershipId.trim(), description: emptyToNull(form.get('description')) };
}

/** Parse a "record payment" form post: a whole-dollar amount and a valid method are required, a
 *  reference note is optional. */
export function parsePaymentForm(form: FormData): { amount: number; method: PaymentMethod; reference: string | null } | { error: string } {
  const amountRaw = form.get('amount');
  const amount = typeof amountRaw === 'string' ? Number(amountRaw) : NaN;
  if (!Number.isInteger(amount) || amount <= 0) {
    return { error: 'Amount must be a whole number greater than zero.' };
  }
  const method = form.get('method');
  if (typeof method !== 'string' || !PAYMENT_METHODS.includes(method as PaymentMethod)) {
    return { error: 'A valid payment method is required.' };
  }
  return { amount, method: method as PaymentMethod, reference: emptyToNull(form.get('reference')) };
}

/** Parse an "add to waitlist" form post: an asset type and a member are required, notes are
 *  optional. */
export function parseWaitlistAddForm(form: FormData): { assetType: string; memberId: string; notes: string | null } | { error: string } {
  const assetType = form.get('assetType');
  if (typeof assetType !== 'string' || !assetType.trim()) {
    return { error: 'An asset type is required.' };
  }
  const memberId = form.get('memberId');
  if (typeof memberId !== 'string' || !memberId.trim()) {
    return { error: 'A member is required.' };
  }
  return { assetType: assetType.trim(), memberId: memberId.trim(), notes: emptyToNull(form.get('notes')) };
}
