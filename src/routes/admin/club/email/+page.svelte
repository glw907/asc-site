<!--
@component
A structural placeholder for the Club section's Email screen (Part B: templates edit in the cairn
editor with a variables palette; the send log is a filterable list). No data yet; see docs/club-
admin-scaffold.md.
-->
<script lang="ts">
  import OfficeList from '$admin-club/lib/OfficeList.svelte';
  import { HEADER_CELL } from '$admin-club/lib/ui';
</script>

<OfficeList title="Email" subtitle="Structural placeholder; not wired to data yet.">
  <table class="table">
    <thead>
      <tr>
        <th class={HEADER_CELL}>Template</th>
        <th class="{HEADER_CELL} w-40">Last sent</th>
        <th class="{HEADER_CELL} w-32">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td colspan="3" class="px-6 py-10 text-center text-sm text-muted">
          Templates and the send log move here in Pass 2.3, when transactional email consolidates
          onto Cloudflare.
        </td>
      </tr>
    </tbody>
  </table>
</OfficeList>
