<!-- @component
The "Needs your attention" section's own empty-teachable-moment (mock D lines 1002-1013, 1127-1138):
the burgee mark in muted gold, the warm "nothing needs you" line, and one pointer at what's next.
Shared by both all-clear states (`in-season-clear` and `off-season`); only `off-season` carries the
class-registration anticipation line (`anticipationOpensOn` non-null there, `null` everywhere else),
per the design doc's own binding precedence. Portal-scoped and licensed one-time. -->
<script lang="ts">
  import { parseMemberDate } from '$member-auth/lib/format';

  let { anticipationOpensOn }: { anticipationOpensOn: string | null } = $props();

  /** `'YYYY-MM-DD'` to "mid-March": the day-of-month splits into three plain-words thirds
   *  (early/mid/late), the way a member would say it aloud rather than a bare date. */
  function monthPhrase(dateIso: string): string {
    const date = parseMemberDate(dateIso);
    const day = date.getUTCDate();
    const part = day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late';
    const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(date);
    return `${part}-${month}`;
  }
</script>

<div class="portal-all-clear">
  <span class="portal-burgee" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M5 2v20" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      <path d="M5 3.5 L18 7 L5 10.5 Z" fill="currentColor" />
    </svg>
  </span>
  <div>
    <p class="portal-all-clear-text">Nothing needs you. See you at the lake.</p>
    {#if anticipationOpensOn === null}
      <p class="portal-all-clear-link">
        <a href="/events" class="text-primary underline-offset-2 hover:underline">See what's coming →</a>
      </p>
    {:else if anticipationOpensOn === ''}
      <p class="portal-all-clear-link">
        Class registration isn't scheduled yet.
        <a href="/education" class="text-primary underline-offset-2 hover:underline">See the program →</a>
      </p>
    {:else}
      <p class="portal-all-clear-link">
        Class registration opens in {monthPhrase(anticipationOpensOn)} ·
        <a href="/education" class="text-primary underline-offset-2 hover:underline">see the {anticipationOpensOn.slice(0, 4)} schedule →</a>
      </p>
    {/if}
  </div>
</div>

<style>
  /* Ported from mock D's own `.all-clear`/`.burgee` (portal-directions.html L341-361). */
  .portal-all-clear {
    display: flex;
    align-items: center;
    gap: var(--spacing-s);
  }
  .portal-burgee {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-star-gold-dot);
  }
  .portal-burgee svg {
    width: 1.6rem;
    height: 1.6rem;
  }
  .portal-all-clear-text {
    margin: 0;
    font-size: var(--text-step-0);
    color: var(--color-base-content);
  }
  .portal-all-clear-link {
    margin: var(--spacing-3xs) 0 0;
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }
</style>
