// The profile screen's own "what others see" preview (T5's own outcome): a pure function of the
// selected visibility plus the member's real facts, so the copy is unit-testable with no database
// or Svelte harness (this repo has none for components). Positions, committee memberships, and
// boats are never gated by `directory_visibility` (T3's own directory query shows them for any
// listed member); only the household address, email, and phone are gated, and only at the
// `'visible'` tier (directory spec's "Revisions" block). `'hidden'` drops the member from the
// directory entirely (T3's own `directory_visibility != 'hidden'` rule), so nothing else in that
// tier shows there -- but the roster line below always applies regardless (roles spec decision 5):
// a committee roster shows every active member's name no matter their directory_visibility.
import type { DirectoryVisibility } from './household';

/** The facts {@link profilePreviewLines} needs about the signed-in member, gathered once by the
 *  route's own `load` (positions and committee memberships are counted, not gated; boats and the
 *  household address are the two facts the preview also names). */
export interface ProfilePreviewFacts {
  hasPositions: boolean;
  hasMemberships: boolean;
  boatCount: number;
  hasAddress: boolean;
}

/**
 * Plain-language lines describing what other members see for the given `visibility`, in the
 * order the preview renders them: the headline contact tier, then each of positions, committee
 * memberships, and boats when the member has any (all three show at `'partial'` as well as
 * `'visible'`, since none of them are gated), the household address only at `'visible'`, and
 * always a closing line about committee rosters (roles spec decision 5: a roster shows the
 * member's name regardless of this setting).
 */
export function profilePreviewLines(visibility: DirectoryVisibility, facts: ProfilePreviewFacts): string[] {
  const lines: string[] = [];

  if (visibility === 'hidden') {
    lines.push('Not listed in the member directory.');
  } else {
    lines.push(visibility === 'partial' ? 'Name only, no contact details.' : 'Name, email, and phone visible to other members.');
    if (facts.hasPositions) lines.push('Your positions show in the directory.');
    if (facts.hasMemberships) lines.push('Your committee memberships show in the directory.');
    if (facts.boatCount > 0) lines.push(facts.boatCount === 1 ? 'Your boat shows in the directory.' : 'Your boats show in the directory.');
    if (visibility === 'visible' && facts.hasAddress) lines.push('Your household address shows in the directory.');
  }

  lines.push('Your name always shows on any committee roster you belong to, no matter this setting.');
  return lines;
}
