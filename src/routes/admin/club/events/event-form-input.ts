// The create/edit form's shared validation (Task 5): both `events/new` and `events/[id]`'s
// actions post the same field set, so this one parser is the single place their acceptance
// rules can agree, rather than drifting apart across two `+page.server.ts` files.
import { EVENT_CATEGORIES, type EventCategory, type EventWrite } from '$admin-club/lib/events-store';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Parse and validate a posted event form into the store's write shape, or a single user-facing
 *  error string. A title, a slug (lowercase, hyphen-separated), and a valid category are
 *  required; every other field is optional and blank posts as `null`. */
export function parseEventForm(form: FormData): { write: EventWrite } | { error: string } {
  const title = form.get('title');
  if (typeof title !== 'string' || !title.trim()) {
    return { error: 'A title is required.' };
  }
  const slug = form.get('slug');
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug.trim())) {
    return { error: 'A slug is required: lowercase letters, numbers, and hyphens only.' };
  }
  const category = form.get('category');
  if (typeof category !== 'string' || !EVENT_CATEGORIES.includes(category as EventCategory)) {
    return { error: 'A valid category is required.' };
  }

  return {
    write: {
      title: title.trim(),
      slug: slug.trim(),
      category: category as EventCategory,
      shortDescription: emptyToNull(form.get('shortDescription')),
      longDescription: emptyToNull(form.get('longDescription')),
      startDate: emptyToNull(form.get('startDate')),
      startTime: emptyToNull(form.get('startTime')),
      endDate: emptyToNull(form.get('endDate')),
      endTime: emptyToNull(form.get('endTime')),
      location: emptyToNull(form.get('location')),
      visible: form.get('visible') === 'on',
    },
  };
}
