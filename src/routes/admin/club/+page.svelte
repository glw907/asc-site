<!-- @component
/admin/club: the section's own landing — the needs-attention strip (design doc: "pending asset
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

<div class="stats stats-vertical lg:stats-horizontal mt-6 w-full rounded-box border border-[var(--cairn-card-border)] bg-base-100 shadow-[var(--cairn-shadow)]">
  <a href="/admin/club/asset-requests" class="stat">
    <div class={HEADER_CELL}>Asset requests</div>
    <div class="stat-value text-xl" class:text-warning={data.pendingAssetRequests > 0}>{data.pendingAssetRequests}</div>
    <div class="stat-desc">Awaiting a decision</div>
  </a>
  <a href="/admin/club/committees" class="stat">
    <div class={HEADER_CELL}>Committees</div>
    <div class="stat-value text-xl" class:text-warning={data.pendingCommitteeRequests > 0}>{data.pendingCommitteeRequests}</div>
    <div class="stat-desc">Pending join requests</div>
  </a>
  <a href="/admin/club/classes/waitlist" class="stat">
    <div class={HEADER_CELL}>Class waitlist</div>
    <div class="stat-value text-xl" class:text-warning={data.classWaitlistAttention > 0}>{data.classWaitlistAttention}</div>
    <div class="stat-desc">Offers expiring soon, or seats to fill</div>
  </a>
</div>
