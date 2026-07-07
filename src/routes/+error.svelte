<!-- @component The site's ROOT error page, a sibling of the `(site)` route group rather than a
     file inside it. Every route under `(site)` prerenders, so SvelteKit strips the group's own
     `[...path]` catch-all from the runtime-routable manifest entirely: a request for an
     unmatched path matches no route at all, the `(site)` group's layout never runs, and its own
     `(site)/+error.svelte` (if it had one) never mounts for that case. Only a root-level
     `+error.svelte` renders for it, through the Worker's built-in default-404 SSR (see
     `wrangler.toml`'s `not_found_handling` comment). The root has no shared layout of its own, so
     this page rebuilds the `(site)` chrome directly. See `src/chassis/README.md`'s "The
     themed-404 pattern" reference (in cairn-cms's showcase) for the full mechanism and why.

     This page also catches every other status that reaches the Worker with no matched route's
     own error boundary to absorb it, `/admin/club/**`'s role-gate 403 included (that layout
     throws `error(403, ...)` with its own human message, which the final branch below shows
     as-is). A 500-and-up gets a distinct, deliberately generic line rather than
     `page.error?.message`: SvelteKit's default `handleError` already redacts an unexpected
     server error to a bare "Internal Error" in production, and this site defines no custom
     `handleError`, so showing that placeholder verbatim would read as broken rather than honest. -->
<script lang="ts">
  import { page } from '$app/state';
  import { siteConfig } from '$theme/cairn.config';
  import themeCss from '$theme/theme.css?url';
  import siteCss from '$theme/site.css?url';
  import SiteHeader from '$theme/components/SiteHeader.svelte';
  import SiteFooter from '$theme/components/SiteFooter.svelte';
</script>

<svelte:head>
  <link rel="stylesheet" href={themeCss} />
  <link rel="stylesheet" href={siteCss} />
  <title>{page.status} — {siteConfig.siteName}</title>
</svelte:head>

<div class="flex min-h-dvh flex-col bg-base-100 font-body text-base-content">
  <SiteHeader />

  <main id="main" class="site-main flex-1">
    <div class="mx-auto max-w-measure px-m py-2xl text-center">
      <h1 class="m-0 font-display text-step-5 font-semibold leading-tight tracking-tight">{page.status}</h1>
      <p class="mt-s text-step-1 leading-snug text-muted">
        {#if page.status === 404}
          You've wandered off the trail. This page doesn't exist.
        {:else if page.status >= 500}
          Something went wrong on our end. We're looking into it. Try again in a moment.
        {:else}
          {page.error?.message ?? 'Something went wrong.'}
        {/if}
      </p>
      <div class="mt-m flex flex-wrap items-center justify-center gap-s">
        <a
          href="/"
          class="inline-flex h-11 items-center justify-center rounded-field bg-primary px-5 text-step--1 font-semibold text-primary-content no-underline hover:opacity-90"
        >
          Back to {siteConfig.siteName}
        </a>
        <a href="/events/" class="text-step--1 font-semibold text-primary no-underline hover:underline">
          See what's on
        </a>
        <a href="/contact/" class="text-step--1 font-semibold text-primary no-underline hover:underline">
          Contact us
        </a>
      </div>
    </div>
  </main>

  <SiteFooter />
</div>
