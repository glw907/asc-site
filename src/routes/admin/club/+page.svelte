<!-- @component
/admin/club: the section's own landing -- the needs-attention strip (design doc: "pending asset
requests + offers nearing expiry, each a count drilling through to its inbox"). The signup-review
card retired (pass B T2: joins are automatic and self-serve, `board_join_notice` already notifies
the board of every paid join). Pass B T7 reshapes the strip to the three ruled attention sources
(design decision 7), each also a sidebar badge reading the same counts
(`$theme/admin-attention.ts`). -->
<script lang="ts">
  import type { PageData } from './$types';
  import { HEADER_CELL } from '$admin-club/lib/ui';

  let { data }: { data: PageData } = $props();

  const nothingPending = $derived(
    data.pendingAssetRequests === 0 && data.pendingCommitteeRequests === 0 && data.classWaitlistAttention === 0,
  );
</script>

<h1 class="m-0 text-2xl font-semibold text-base-content">Club</h1>
<p class="mt-1 text-sm text-muted">
  {nothingPending ? 'Nothing needs attention right now.' : 'A few things need a look.'}
</p>

<!-- Scoped styles, not daisyUI stats: admin routes load only cairn's compiled cairn-admin.css,
     which carries no .stats/.stat/.stat-value classes (or responsive variants), so the earlier
     daisy markup rendered as an unstyled stack. Scoped CSS ships with the page regardless. -->
<div class="strip mt-6 rounded-box border border-[var(--cairn-card-border)] bg-base-100 shadow-[var(--cairn-shadow)]">
  <a href="/admin/club/asset-requests" class="cell">
    <div class={HEADER_CELL}>Asset requests</div>
    <div class="value" class:pending={data.pendingAssetRequests > 0}>{data.pendingAssetRequests}</div>
    <div class="desc">Awaiting a decision</div>
  </a>
  <a href="/admin/club/committees" class="cell">
    <div class={HEADER_CELL}>Committees</div>
    <div class="value" class:pending={data.pendingCommitteeRequests > 0}>{data.pendingCommitteeRequests}</div>
    <div class="desc">Pending join requests</div>
  </a>
  <a href="/admin/club/classes/waitlist" class="cell">
    <div class={HEADER_CELL}>Class waitlist</div>
    <div class="value" class:pending={data.classWaitlistAttention > 0}>{data.classWaitlistAttention}</div>
    <div class="desc">Offers expiring soon, or seats to fill</div>
  </a>
</div>

<style>
  .strip {
    display: grid;
    overflow: hidden;
  }
  .cell {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem 1.25rem;
    color: inherit;
    text-decoration: none;
    border-top: 1px solid var(--cairn-card-border);
    transition: background-color 0.15s;
  }
  .cell:first-child {
    border-top: none;
  }
  .cell:hover {
    background: color-mix(in oklab, var(--color-base-content) 4%, transparent);
  }
  .value {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.3;
  }
  .value.pending {
    color: var(--cairn-warning-ink);
  }
  .desc {
    font-size: 0.75rem;
    color: var(--color-muted);
  }
  @media (min-width: 40rem) {
    .strip {
      grid-template-columns: repeat(3, 1fr);
    }
    .cell {
      border-top: none;
    }
    .cell + .cell {
      border-left: 1px solid var(--cairn-card-border);
    }
  }
</style>
