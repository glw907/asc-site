<!--
@component
A structural placeholder for the Club section's Classes screen: real layout scaffolding (the
office header, the office-list-shaped table shell with the columns Pass 2.1's classes CRUD will
fill), no data yet. Classes live in the same EVENTS_DB the Events screen already reads for real
(asc-ops's `classes` table), but stay unwired here on purpose: this scaffold pass proves the seam
on one screen (Events) and leaves the rest for the real Pass 2.1 build. See docs/club-admin-
scaffold.md.
-->
<script lang="ts">
  import OfficeList from '$admin-club/lib/OfficeList.svelte';

  const headerCell = 'text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted';
</script>

<OfficeList title="Classes" subtitle="Structural placeholder; not wired to data yet.">
  <table class="table">
    <thead>
      <tr>
        <th class="{headerCell} w-28">Date</th>
        <th class={headerCell}>Class</th>
        <th class="{headerCell} w-32">Registration</th>
        <th class="{headerCell} w-28">Visibility</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td colspan="4" class="px-6 py-10 text-center text-sm text-muted">
          Classes move into this screen when Pass 2.1 completes, alongside Events above.
        </td>
      </tr>
    </tbody>
  </table>
</OfficeList>
