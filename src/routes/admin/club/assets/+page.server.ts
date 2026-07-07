// A structural placeholder (docs/superpowers/specs/2026-07-06-asc-phase-2-design-suite.md, Part
// A/B): assignments and the waitlist re-architect onto this screen in Pass 2.4, after the member
// model (2.2) and member email (2.3) land and MembershipWorks retires. This scaffold pass wires
// only the layout.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';

export const load: PageServerLoad = (event) => {
  requireSession(event);
  return {};
};
