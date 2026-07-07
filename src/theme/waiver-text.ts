// The liability-release wording every class signup and waitlist join asks a signer to accept
// (Task 8, the gap analysis's item 1). Kept as a plain constant, not a `settings` row or a
// content-managed page: `asc-club`'s `settings.waiver_text_version` (migration 0001) tracks WHICH
// version a signer accepted, but the wording itself is not editor-managed this pass, the same
// judgment call the club-settings.ts header documents. Editing the text below is a deliberate,
// manual act, and must be paired with bumping WAIVER_TEXT_VERSION here and the matching
// `waiver_text_version` row in asc-club's `settings` table, or a signer's acceptance would be
// stamped with a version number that no longer matches what they actually read.
export const WAIVER_TEXT_VERSION = '2026-01';

export const WAIVER_RELEASE_TEXT = `Sailing, boat handling, and time on the water and grounds at the Alaska Sailing Club carry real risk: cold water, capsizing, collision, and weather among them. By signing up, I accept those risks for myself, or for the minor I am registering, and I release the Alaska Sailing Club, its officers, and its volunteers from liability for injury, loss, or damage arising from this class, except where caused by their gross negligence or willful misconduct. I agree to follow the club's safety rules, including its life jacket policy, for the duration of the class.`;
