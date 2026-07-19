<!--
@component
The certificate-of-completion view (member-waivers T6): one printable, self-contained artifact
proving a signature -- the document identity, the name as typed, every timestamp, the IP, the
context, the auth event, the build hash, and the SHA-256 of the exact text, so the record
self-authenticates independent of this admin screen. `@media print` hides the admin shell's own
chrome (`CairnAdminShell`'s `.navbar`/`.drawer-side`, rendered by the ancestor `/admin/+layout.
svelte`, not by this component -- the `:global()` selectors below are the only way to reach them)
so printing shows the plain certificate alone, per the task's own "no admin chrome in print".
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { formatCivilDate } from '$admin-club/lib/ui';

  let { data }: { data: PageData } = $props();

  const civilDateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  /** A stored SQLite datetime ("2027-06-01 12:00:00") or ISO instant, formatted with the time of
   *  day: the certificate's own evidentiary purpose needs more than {@link formatCivilDate}'s
   *  civil-date-only precision. `null` renders as an em dash, matching the row's own "not
   *  captured" convention (a legacy or degraded auth event can genuinely carry no timestamp). */
  function formatInstant(value: string | null): string {
    if (!value) return '—';
    const iso = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? value : civilDateTimeFmt.format(parsed);
  }
</script>

<svelte:head>
  <!-- The printed page's own title (fix round, review finding): browsers default a print/save-as-PDF
       job's suggested filename and header to `document.title`, which without this fell back to
       whatever generic title the admin shell last set -- never naming the certificate itself. -->
  <title>{data.detail ? `Certificate — ${data.documentTitle} — ${data.detail.personName}` : 'Certificate of completion'}</title>
</svelte:head>

{#if !data.detail}
  <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 py-10 text-center">
    <p class="text-sm text-muted">{data.error}</p>
    <a class="mt-2 inline-block text-sm text-primary hover:underline" href="/admin/club/documents">&larr; Back to the season rollup</a>
  </div>
{:else}
  <div class="certificate mx-auto max-w-3xl">
    <div class="mb-4 flex items-center justify-between print:hidden">
      <a class="text-sm text-muted hover:text-primary hover:underline" href="/admin/club/documents/signature/{data.detail.id}">&larr; Back to the signed text</a>
      <button type="button" class="btn btn-sm" onclick={() => window.print()}>Print</button>
    </div>

    <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-8 print:border-0 print:p-0 print:shadow-none">
      <h1 class="text-lg font-semibold">Certificate of completion</h1>
      <p class="text-sm text-muted">{data.documentTitle} &middot; version {data.detail.version} &middot; {data.detail.season} season</p>

      <dl class="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Signed by</dt>
          <dd class="text-sm">{data.detail.personName} &lt;{data.detail.personEmail}&gt;</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Context</dt>
          <dd class="text-sm capitalize">{data.detail.context.replace('-', ' ')}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Signed at</dt>
          <dd class="text-sm">{formatInstant(data.detail.signedAt)}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">IP address</dt>
          <dd class="text-sm">{data.detail.ipAddress ?? '—'}</dd>
        </div>
        {#if data.detail.minorName}
          <div>
            <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Signed on behalf of</dt>
            <dd class="text-sm">{data.detail.minorName}</dd>
          </div>
          <div>
            <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Attested relationship</dt>
            <dd class="text-sm">{data.relationshipLabel ?? '—'}</dd>
          </div>
        {/if}
        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Auth token</dt>
          <dd class="text-sm">{data.detail.authTokenId ?? '—'}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Auth issued / consumed</dt>
          <dd class="text-sm">{formatInstant(data.detail.authIssuedAt)} &rarr; {formatInstant(data.detail.authConsumedAt)}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Frontend build</dt>
          <dd class="text-sm">{data.detail.buildHash ?? '—'}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">SHA-256 of the signed text</dt>
          <dd class="break-all font-mono text-sm">{data.detail.contentHash ?? '—'}</dd>
        </div>
      </dl>

      <div class="mt-6">
        <p class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">The signed text</p>
        <pre class="mt-2 max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-box border border-[var(--cairn-card-border)] bg-base-200/50 p-4 text-xs print:max-h-none print:overflow-visible print:border-0 print:bg-transparent print:p-0">{data.detail.contentSnapshot ?? 'No text was snapshotted with this record.'}</pre>
      </div>
    </div>
  </div>
{/if}

<style>
  /* The admin shell (CairnAdminShell, mounted by the ancestor /admin/+layout.svelte) is outside
     this component's own markup, so reaching its chrome to hide it in print needs an unscoped
     selector. :global() here still lives only in this route's compiled sheet -- it never leaks
     into another page's print output, since Vite ships each route's <style> only where it is
     imported. */
  @media print {
    :global(.navbar),
    :global(.drawer-side),
    :global(label[for='cairn-shell-drawer']) {
      display: none !important;
    }
    :global(.drawer-content) {
      margin-left: 0 !important;
    }
    :global(main) {
      padding: 0 !important;
    }
  }
</style>
