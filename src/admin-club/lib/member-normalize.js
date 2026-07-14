/**
 * Shared field normalization for member data: email, phone, and name-case rules the
 * MembershipWorks (MW) import script and the live signup/portal write paths both need to apply
 * identically. Plain JS (not TS) so `scripts/import/*.mjs` can import it directly under Node
 * without a build step, while `checkJs` (see `tsconfig.json`) still type-checks it alongside the
 * rest of the project; TS callers get the same types from the JSDoc annotations below.
 *
 * The import script and the live write paths diverge on one point only: an unparseable phone
 * number. The import refuses the row (a malformed source record is worth a human's look before
 * it lands); a live signup or profile edit must never block someone over a phone format, so it
 * stores the trimmed raw value instead. That fallback decision belongs to each call site, which
 * is why {@link normalizePhoneE164} returns a not-normalizable signal (`null`) rather than
 * throwing.
 */

/**
 * Trims and lowercases an email address. MW's export and every live form both carry stray
 * whitespace and inconsistent casing; email is the one field the schema already treats as
 * case-insensitive (the `members.email` unique constraint), so lowercasing here keeps every
 * write path agreeing with that constraint.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeEmail(raw) {
  return raw.trim().toLowerCase();
}

/**
 * Normalizes a phone number to E.164 with a +1 default: strips every non-digit character, then a
 * bare 10-digit number gets the `+1` prefix and an 11-digit number already starting with `1` gets
 * a bare `+`. Any other shape is not normalizable and returns `null` rather than throwing, so a
 * live write path can fall back to storing the trimmed raw value instead of blocking the caller
 * (the import script, which wants to refuse instead, checks for `null` itself and reports the
 * row).
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizePhoneE164(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Lowercase name particles that stay lowercase in the middle of a name (`John van der Berg`),
 *  but recase normally when they open the name (a stoplist word is never itself the surname it
 *  precedes, so a leading occurrence is treated as an ordinary word). */
const NAME_PARTICLES = new Set([
  'of', 'the', 'and', 'van', 'von', 'de', 'der', 'den', 'di', 'da', 'la', 'le', 'ter', 'y',
]);

/** A token this recase rule is willing to touch: letters, apostrophes, and hyphens only. Digits,
 *  quotation marks, parentheses, or any other punctuation mark a token as already-deliberate
 *  (an initial, a nickname, a suffix) and it passes through untouched. */
const RECASABLE_TOKEN = /^[A-Za-z'-]+$/;

/** A token made entirely of roman-numeral letters (`IV`, `III`, `XIV`): guarded against recasing
 *  even when it is all-uppercase and long enough to otherwise trigger, since a suffix like `IV`
 *  is not a word to lowercase-then-titlecase. */
const ROMAN_NUMERAL = /^[IVX]+$/;

/**
 * Capitalizes a single hyphen/apostrophe-delimited segment: first letter up, the rest down.
 * @param {string} segment
 * @returns {string}
 */
function capitalizeSegment(segment) {
  if (segment.length === 0) return segment;
  return segment[0].toUpperCase() + segment.slice(1).toLowerCase();
}

/**
 * Recases one name token per the conservative rule: capitalize each hyphen/apostrophe segment's
 * first letter and lowercase the rest, e.g. `MCKAY` (already excluded elsewhere by its interior
 * capital, this is the shape recasing itself produces) or `o'brien` -> `O'Brien`.
 * @param {string} token
 * @returns {string}
 */
function recaseToken(token) {
  return token.split(/([-'])/).map((part) => (part === '-' || part === "'" ? part : capitalizeSegment(part))).join('');
}

/**
 * Recases a name conservatively, token by token, never rewording. A token is only touched when it
 * is made entirely of letters/apostrophes/hyphens and is either all-lowercase, or all-uppercase
 * with length 3 or more and not a roman numeral (`IV`, `III`). A token with digits, quotes,
 * parentheses, or an interior capital (`McDonald`, `O'Brien`) already reads as deliberately cased
 * and passes through unchanged. A touched token that is also a name particle (`of`, `van`, `der`,
 * ...) stays lowercase unless it opens the name.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeNameCaps(raw) {
  let sawFirstToken = false;
  return raw
    .split(/(\s+)/)
    .map((part) => {
      if (part === '' || /^\s+$/.test(part)) return part;
      const isFirstToken = !sawFirstToken;
      sawFirstToken = true;
      return recaseTokenIfEligible(part, isFirstToken);
    })
    .join('');
}

/**
 * @param {string} token
 * @param {boolean} isFirstToken
 * @returns {string}
 */
function recaseTokenIfEligible(token, isFirstToken) {
  if (!RECASABLE_TOKEN.test(token)) return token;

  const isAllLower = token === token.toLowerCase();
  const isAllUpper = token === token.toUpperCase();
  const eligible = isAllLower || (isAllUpper && token.length >= 3 && !ROMAN_NUMERAL.test(token));
  if (!eligible) return token;

  const recased = recaseToken(token);
  if (!isFirstToken && NAME_PARTICLES.has(token.toLowerCase())) return token.toLowerCase();
  return recased;
}
