// A structural placeholder (docs/superpowers/specs/2026-07-06-asc-phase-2-design-suite.md, Part
// B): classes' CRUD moves into this screen when Pass 2.1 completes, alongside Events. This
// scaffold pass wires only the layout; requireSession gates the view the same way the built-in
// concept screens do.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';

export const load: PageServerLoad = (event) => {
  requireSession(event);
  return {};
};
