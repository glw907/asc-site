// The contact form's category-to-committee routing (live's own CONTACT_ROUTING /
// CONTACT_CATEGORY_NAMES maps, ported verbatim from the retiring Worker's src/lib/routing.js).
// Pure and dependency-free so the routing and subject-line decisions are unit-testable without a
// request context; contact.remote.ts only wires this to the actual send.

/** One category the contact form offers, in the live site's own order. */
export interface ContactCategory {
  value: string;
  /** The select option's own label. */
  label: string;
  /** The short noun form the live site used in the routed email's subject line. */
  name: string;
  /** The volunteer committee inbox this category routes to. */
  destination: string;
}

export const CONTACT_CATEGORIES: readonly ContactCategory[] = [
  { value: 'membership', label: 'Membership inquiry', name: 'Membership', destination: 'membership-committee@aksailingclub.org' },
  { value: 'class', label: 'Class or clinic question', name: 'Classes', destination: 'program-committee@aksailingclub.org' },
  { value: 'feedback', label: 'Feedback or suggestion', name: 'Feedback', destination: 'board@aksailingclub.org' },
  { value: 'other', label: 'Other', name: 'General', destination: 'membership-committee@aksailingclub.org' },
];

const DEFAULT_CATEGORY = CONTACT_CATEGORIES[CONTACT_CATEGORIES.length - 1];

/** Look a category value up, falling back to the "other" category for an unrecognized value. */
function resolveCategory(value: string): ContactCategory {
  return CONTACT_CATEGORIES.find((c) => c.value === value) ?? DEFAULT_CATEGORY;
}

/** The submitted form fields, once validated. */
export interface ContactMessageInput {
  name: string;
  email: string;
  phone: string;
  category: string;
  message: string;
}

/** The email the routed message becomes, ready for the site's EMAIL binding. */
export interface ContactEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Escape the five HTML-significant characters; cairn's own internal helper is not exported, so
 * this is a small local copy for the one email body this module builds. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the routed committee email from a validated submission. The submitter's name and email
 * ride in the body text, not a `Reply-To` header: cairn's EMAIL binding carries no such field
 * (see src/app.d.ts), so a volunteer replies to the address printed in the message instead.
 */
export function buildContactEmail(input: ContactMessageInput): ContactEmail {
  const category = resolveCategory(input.category);
  const firstLine = input.message.split('\n')[0].slice(0, 60);
  const text = `${input.message}\n\n--\n${input.name}\n${input.email} | ${input.phone}`;
  return {
    to: category.destination,
    subject: `[${category.name}] ${firstLine}`,
    text,
    html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
  };
}
