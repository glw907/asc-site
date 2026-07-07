// The portal landing's own task list (design doc's "The task list": "rendered ONLY when a task
// exists... No tasks = the list is absent, not an empty state"). Composes signals this pass
// already derives elsewhere (`standing.ts`'s `MemberStanding`, `credits.ts`'s balance,
// `assets.ts`'s household requests) into one flat, priority-ordered list, never a second copy of
// any of their own logic.
//
// One design-doc task type is deliberately NOT built here: "Confirm your household's directory
// listings," a "one-time, dismissible" nudge. Dismissal needs its own per-member state (a column
// this pass's migration does not add) to avoid re-nagging every visit, which the episodic-use
// governing constraint (design doc's own opening section) treats as a real cost, not a nicety;
// rather than ship a nudge that cannot honor its own "dismissible" promise, this task type is cut
// and named here so the omission is a finding, not an oversight.
import type { MemberStanding } from '$member-auth/lib/standing';
import type { HouseholdRequestRow } from './assets';

export interface TaskItem {
  id: string;
  label: string;
  href: string;
}

/** How close to the standing's own boundary counts as "in the renewal window": a plain
 *  30-day proxy (this pass's own simplification — a settings-driven window, per the renewal-
 *  reminder cadence design, is the job of the cron-driven reminder system the adversarial review
 *  files forward as its own future pass, not this landing's task-list read). */
const RENEWAL_WINDOW_DAYS = 30;

function withinRenewalWindow(expiresOn: string): boolean {
  const expiry = new Date(expiresOn.length <= 10 ? `${expiresOn}T00:00:00Z` : `${expiresOn.replace(' ', 'T')}Z`);
  const daysUntil = (expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  return daysUntil <= RENEWAL_WINDOW_DAYS;
}

/**
 * The landing's task list, in priority order (renewal first — the most consequential task —
 * then credit, then any pending asset payments). Every task links straight to the screen that
 * completes it (the design doc's own "the email IS the front door" principle applied inside the
 * portal too: no task ever just says "go look at something").
 */
export function buildTaskList(args: { standing: MemberStanding | null; creditBalance: number; assetRequests: HouseholdRequestRow[] }): TaskItem[] {
  const tasks: TaskItem[] = [];

  if (args.standing) {
    const needsRenewal =
      args.standing.status === 'grace' || args.standing.status === 'lapsed' || (args.standing.status === 'current' && !!args.standing.expiresOn && withinRenewalWindow(args.standing.expiresOn));
    if (needsRenewal) {
      tasks.push({ id: 'renew', label: args.standing.status === 'current' ? 'Renew before your membership lapses' : 'Renew your membership', href: '/my-account#renew' });
    }
  }

  if (args.creditBalance > 0) {
    tasks.push({
      id: 'use-credit',
      label: `Use your ${args.creditBalance === 1 ? 'class credit' : `${args.creditBalance} class credits`}`,
      href: '/my-account/classes',
    });
  }

  for (const request of args.assetRequests) {
    if (request.status === 'approved_awaiting_payment') {
      tasks.push({ id: `pay-${request.id}`, label: `Pay for your ${request.assetTypeName.toLowerCase()} — $${request.fee}`, href: '/my-account#assets' });
    }
  }

  return tasks;
}
