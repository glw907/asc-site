// A structural placeholder (docs/superpowers/specs/2026-07-06-asc-phase-2-design-suite.md, Part
// A/B): the member model doesn't exist yet; Pass 2.2 designs it fresh (households/members/
// memberships-by-season), replacing MembershipWorks. This scaffold pass wires only the layout.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';

export const load: PageServerLoad = (event) => {
  requireSession(event);
  return {};
};
