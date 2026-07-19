// The "return to what they were doing" plumbing the member-waivers loop needs in two places
// (member-waivers T5b): the completion coda at `/my-account/sign` names where "back to X" goes,
// and a magic-link nudge/resumption email deep-links straight past the portal landing into the
// signing page or the payment step. Both ends validate a `?next=` value against the SAME closed
// allowlist here, so a redirect target is never open (a query param riding through an emailed
// link is exactly the shape an open-redirect check exists for).
export interface NextTarget {
  path: string;
  /** The completion coda's own return-link label; `null` for a target that is never itself a
   *  completion-coda destination (a deep link straight back into the signing moment). */
  label: string | null;
}

const NEXT_TARGETS: readonly NextTarget[] = [
  { path: '/my-account/renew', label: 'Back to renewal' },
  { path: '/my-account/classes', label: 'Back to class signup' },
  { path: '/my-account/finish-joining', label: 'Continue to payment' },
  { path: '/my-account/sign?context=join', label: null },
  { path: '/my-account/sign?context=renewal', label: null },
  { path: '/my-account/sign?context=class-signup', label: null },
  { path: '/my-account/sign?context=mooring-fee', label: null },
  { path: '/my-account/sign?context=storage-fee', label: null },
];

/** The portal home: always a safe fallback destination, and the completion coda's own default
 *  label when `next` names nothing this allowlist recognizes. */
export const DEFAULT_NEXT_PATH = '/my-account';
export const DEFAULT_NEXT_LABEL = 'Back to your account';

/** Whether `value` is one of this module's own allowlisted return paths -- an exact match, never
 *  a prefix or pattern, so a crafted `next` can never smuggle in an arbitrary path or an
 *  off-origin URL. */
export function isSafeNextPath(value: string | null): value is string {
  return value !== null && NEXT_TARGETS.some((target) => target.path === value);
}

/** The completion coda's own label for `next`: the matching target's label, or the default when
 *  `next` is `null`, unrecognized, or names a target with no completion-coda role of its own
 *  (one of the `/my-account/sign?context=...` deep links above). */
export function nextPathLabel(next: string | null): string {
  return NEXT_TARGETS.find((target) => target.path === next)?.label ?? DEFAULT_NEXT_LABEL;
}
