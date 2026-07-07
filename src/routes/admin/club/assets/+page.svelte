<!--
@component
A structural placeholder for the Club section's Assets screen (Part B: the by-asset and by-person
views ops proved, re-expressed as two lenses over one screen family, with the waitlist redesigned
as a single polymorphic queue). No data yet; see docs/club-admin-scaffold.md.
-->
<script lang="ts">
  import OfficeList from '$admin-club/lib/OfficeList.svelte';

  const headerCell = 'text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted';
</script>

<OfficeList title="Assets" subtitle="Structural placeholder; not wired to data yet.">
  <table class="table">
    <thead>
      <tr>
        <th class={headerCell}>Asset</th>
        <th class="{headerCell} w-40">Assigned to</th>
        <th class="{headerCell} w-32">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td colspan="3" class="px-6 py-10 text-center text-sm text-muted">
          Assignments and the waitlist re-architect onto this screen in Pass 2.4, after MW retires.
        </td>
      </tr>
    </tbody>
  </table>
</OfficeList>
