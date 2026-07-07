<!--
@component
A structural placeholder for the Club section's Members screen (Part B's directory-visibility
chip and season-standing column, once Pass 2.2 designs the real member model). No data yet; see
docs/club-admin-scaffold.md.
-->
<script lang="ts">
  import OfficeList from '$admin-club/lib/OfficeList.svelte';

  const headerCell = 'text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted';
</script>

<OfficeList title="Members" subtitle="Structural placeholder; not wired to data yet.">
  <table class="table">
    <thead>
      <tr>
        <th class={headerCell}>Member</th>
        <th class="{headerCell} w-40">Household</th>
        <th class="{headerCell} w-32">Season standing</th>
        <th class="{headerCell} w-40">Directory visibility</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td colspan="4" class="px-6 py-10 text-center text-sm text-muted">
          The member model doesn't exist yet. Pass 2.2 designs it fresh, replacing MembershipWorks.
        </td>
      </tr>
    </tbody>
  </table>
</OfficeList>
