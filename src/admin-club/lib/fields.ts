// LOCAL STAND-IN for Part C's future engine seam (admin field-renderer reuse, item 1 of
// docs/superpowers/specs/2026-07-06-asc-phase-2-design-suite.md's Part C): "Sites building admin
// screens need the engine's field components (text/date/select/image-picker/markdown) as a
// supported export... Contract: an `/admin-fields` subpath exporting the field primitives." Part
// C replaces this whole file with `import { SelectField, ... } from '@glw907/cairn-cms/admin-fields'`
// once that subpath ships; every Club screen that imports from `$admin-club/lib/fields.js` picks
// up the change with no further edit.
//
// This scaffold pass has exactly one real consumer (the events screen's type filter), so this
// barrel exports exactly one field kind for now rather than five unused ones. Passes 2.2-2.4 grow
// it (a text field for the members search, a date field for a season boundary, an image-picker
// for an asset photo) as their real forms land, the same way the engine's own field vocabulary
// would.
export { default as SelectField } from './fields/SelectField.svelte';
