// The create/edit form's shared validation (Task 6), the same one-parser-per-concept shape
// events/event-form-input.ts already established: both `classes/new` and `classes/[id]`'s
// actions post the same field set.
import { CLASS_TRACKS, type ClassTrack, type ClassWrite } from '$admin-club/lib/classes-store';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Parse and validate a posted class form into the store's write shape, or a single user-facing
 *  error string. A name, a slug (lowercase, hyphen-separated), a valid track, a whole-number
 *  positive capacity, and a whole-number non-negative fee are required; every other field is
 *  optional and blank posts as `null`. */
export function parseClassForm(form: FormData): { write: ClassWrite } | { error: string } {
  const name = form.get('name');
  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'A name is required.' };
  }
  const slug = form.get('slug');
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug.trim())) {
    return { error: 'A slug is required: lowercase letters, numbers, and hyphens only.' };
  }
  const track = form.get('track');
  if (typeof track !== 'string' || !CLASS_TRACKS.includes(track as ClassTrack)) {
    return { error: 'A valid track is required.' };
  }
  const capacityRaw = form.get('capacity');
  const capacity = typeof capacityRaw === 'string' ? Number(capacityRaw) : NaN;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    return { error: 'Capacity must be a whole number greater than zero.' };
  }
  const feeRaw = form.get('fee');
  const fee = typeof feeRaw === 'string' ? Number(feeRaw) : NaN;
  if (!Number.isInteger(fee) || fee < 0) {
    return { error: 'Fee must be a whole number, zero or more.' };
  }

  return {
    write: {
      name: name.trim(),
      slug: slug.trim(),
      track: track as ClassTrack,
      capacity,
      fee,
      startDate: emptyToNull(form.get('startDate')),
      endDate: emptyToNull(form.get('endDate')),
      location: emptyToNull(form.get('location')),
      description: emptyToNull(form.get('description')),
      instructorNotes: emptyToNull(form.get('instructorNotes')),
      visible: form.get('visible') === 'on',
    },
  };
}
