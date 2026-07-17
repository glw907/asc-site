<!-- @component
/my-account: the sign-in form when signed out, or the signed-in landing when signed in (the portal
redesign pass, docs/2026-07-16-portal-redesign-design.md: mock D, "C's function in A's body"). The
signed-in state renders TWO compositions at once, `.portal-desktop` and `.portal-mobile`, CSS
toggling which one is visible per viewport (T3: "the mobile design is its own composition, not a
collapse," never a JS media-query branch). `.portal-desktop` is T2's full-bleed member masthead
(the standing surface, and the renewal-window state's own fireweed CTA), the value mirror, a
two-column working area (weighted "Needs your attention" rows / recent receipts against a
subordinate reference rail), and the doors row. `.portal-mobile` is T3's own compact masthead, the
same weighted actions in stacked anatomy, then full-width reference sections in recognition order
(no value mirror, no Classes tile -- see that block's own comment).

The masthead, action row, and rail are portal-scoped, licensed one-time components
(`$member-portal/components/`), not sitewide markdown vocabulary. The gear & moorings rail tile
(desktop) and section (mobile) are reference-only: their own verbs (release, request, cancel a
request) live on `/my-account/gear` instead (docs/design-benchmark/decisions.md's "the gear door"
ruling) and are not rendered here; this route's own server actions for those verbs moved there with
them (T2b). -->
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { TURNSTILE_SITE_KEY } from '$theme/turnstile';
  import { formatMemberDate, formatMemberCents } from '$member-auth/lib/format';
  import MemberMasthead from '$member-portal/components/MemberMasthead.svelte';
  import ActionRowCard from '$member-portal/components/ActionRow.svelte';
  import PortalRail from '$member-portal/components/PortalRail.svelte';
  import AllClearMoment from '$member-portal/components/AllClearMoment.svelte';
  import { deriveAssetRows } from '$member-portal/lib/rail-rows';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // `load`'s full branch (a real session AND a resolved CLUB_DB binding) sets every field below
  // together, in one `Promise.all` (+page.server.ts's own load); the two early-return branches
  // set none of them. SvelteKit's generated `PageData` flattens the `load` return union into
  // independently-optional fields, losing that correlation, so a plain `data.actionRows !==
  // undefined` check narrows only `actionRows` itself, not its siblings. This type predicate
  // re-asserts the real correlation once, so the template's full-composition branch can read
  // every field directly with no further guards, matching the original template's per-field
  // guard discipline scaled up to a single check.
  type FullPortalData = PageData & {
    householdInfo: NonNullable<PageData['householdInfo']>;
    householdMembers: NonNullable<PageData['householdMembers']>;
    currentSeason: NonNullable<PageData['currentSeason']>;
    renewalSeason: NonNullable<PageData['renewalSeason']>;
    assignments: NonNullable<PageData['assignments']>;
    waitlistEntries: NonNullable<PageData['waitlistEntries']>;
    receipts: NonNullable<PageData['receipts']>;
    myClasses: NonNullable<PageData['myClasses']>;
    actionRows: NonNullable<PageData['actionRows']>;
    state: NonNullable<PageData['state']>;
    mirrorSegments: NonNullable<PageData['mirrorSegments']>;
  };
  function isFullPortalData(d: PageData): d is FullPortalData {
    return d.actionRows !== undefined;
  }

  // The masthead's own "Welcome back, {firstName}." (design doc: never the full name).
  const firstName = $derived(data.member?.name.split(' ')[0] ?? '');
  const standingSentence = $derived(data.standing?.statusLine ?? 'No membership on file yet.');
</script>

<svelte:head>
  <title>My Account — {siteConfig.siteName}</title>
</svelte:head>

{#snippet renewCta()}
  <!-- T2c (decisions.md's "the renewal door"): a plain link to the renewal door, not a form
       posting a hidden tier field -- that hidden field silently bought the household's LAST tier
       even when it no longer matched the household size. The renewal door itself states the
       current tier and price plainly before the member commits. -->
  <a href="/my-account/renew" class="asc-cta-btn">Renew for {data.renewalSeason} season</a>
{/snippet}

{#if !data.member}
  <h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
    Member sign-in
  </h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">
    Enter the email address the club has on file and we'll send you a sign-in link. No password to
    remember.
  </p>

  {#if form && 'sent' in form && form.sent}
    <div class="mt-l max-w-measure-wide rounded-box border border-success bg-success/10 p-m">
      <p class="m-0 font-semibold text-base-content">Check your inbox.</p>
      <p class="mt-xs mb-0 text-step--1 text-base-content">
        If that address is on file with the club, a sign-in link is on its way. It expires in 15
        minutes.
      </p>
    </div>
  {:else}
    {#if form && 'error' in form && form.error}
      <p class="mt-s max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
        {form.error}
      </p>
    {/if}
    <form method="POST" action="?/requestLink" class="signin-form mt-l flex flex-col gap-m">
      <input type="hidden" name="csrf" value={data.csrf} />
      <fieldset class="fieldset">
        <legend class="fieldset-legend portal-field-label">Email address</legend>
        <input class="input w-full" type="email" name="email" autocomplete="email" required />
      </fieldset>
      <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY}></div>
      <button type="submit" class="btn btn-primary">Email me a sign-in link</button>
    </form>

    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

    <p class="mt-l max-w-measure-wide text-step--1 text-muted">
      Wrong or old email on file? <a href="/contact" class="text-primary">Contact us</a> and we'll fix
      it.
    </p>
  {/if}
{:else if !isFullPortalData(data)}
  <h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
    Hi, {data.member.name}
  </h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">
    We're having trouble loading your account right now. Please try again shortly.
  </p>
  <form method="POST" action="?/signOut" class="mt-l">
    <button type="submit" class="btn btn-sm portal-quiet-action">Sign out</button>
  </form>
{:else}
  {@const anticipationOpensOn = data.state.kind === 'off-season' ? data.state.classRegistrationOpens : null}
  {@const assetRows = deriveAssetRows(data.assignments, data.waitlistEntries)}
  {@const householdMemberCount = data.householdMembers.filter((m) => m.archivedAt === null).length}
  <!-- The all-clear warmth moment ("Nothing needs you. See you at the lake.") is licensed to the
       two states whose own header comment names it (`AllClearMoment`'s own @component contract:
       "Shared by both all-clear states"): `in-season-clear` and `off-season`. A renewal-window
       household can independently carry zero real action rows (`buildActionRows` deliberately
       excludes expiring standing, since the masthead's fireweed CTA is that signal's own home),
       and rendering the warmth line there directly contradicts the masthead's own renew CTA on
       the same screen. Nothing else stands in for it in that state -- the masthead already
       carries the renewal-window's own message in full. -->
  {@const showAllClear = data.actionRows.length === 0 && (data.state.kind === 'in-season-clear' || data.state.kind === 'off-season')}
  {@const showNeedsAttention = data.actionRows.length > 0 || showAllClear}

  {#snippet doorsRow()}
    <footer class="portal-doors">
      <a href="/my-account/profile">Profile</a>
      <a href="/my-account/household">Household</a>
      <a href="/my-account/gear">Gear</a>
      <a href="/my-account/classes">Classes</a>
      <a href="/my-account/directory">Directory</a>
      <a href="/discord-server">Discord</a>
      <a href="/events">Events</a>
    </footer>
  {/snippet}

  {#snippet receiptRow(receipt: (typeof data.receipts)[number])}
    <div class="portal-receipt-row">
      <span class="portal-receipt-desc">{receipt.what}</span>
      <span class="portal-receipt-date">{formatMemberDate(receipt.date)}</span>
      <span class="portal-receipt-amount">{formatMemberCents(receipt.amountCents)}</span>
    </div>
  {/snippet}

  <!-- `?/payAssetFee`/`?/payRequest` (this route's own actions) and the gear page's own
       cross-route submits to them all re-render THIS template with `form` set on every
       failure path (a checkout-unavailable degrade, an expired CSRF token, a rate limit, a
       stale re-submit, or the no-Stripe-key stub) -- rendered once here so both a same-route
       submit and a gear-page hand-off surface the same message, never a byte-identical
       repaint with no explanation. -->
  {#snippet paymentFormMessage()}
    {#if form && 'error' in form && form.error}
      <p class="mt-s max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
        {form.error}
      </p>
    {/if}
    {#if form && 'assetPayStubbed' in form && form.assetPayStubbed}
      <p class="mt-s max-w-measure-wide text-step--1 text-base-content">
        Online payment isn't available yet; the club will follow up by email with how to pay.
      </p>
    {/if}
  {/snippet}

  <div class="portal-shell">
    <!-- T2's desktop composition (docs/2026-07-16-portal-redesign-design.md): the full-bleed
         masthead, the value mirror, the two-column working area, and the doors row, at desktop
         width (`.portal-frame`'s own 1280px). Shown at 40rem (640px) and wider (`.portal-mobile`
         below is T3's own, separately composed narrower screen -- see that block's own comment
         for the breakpoint's reasoning); both are mounted together and CSS toggles which one
         renders, so neither branch runs page `load` twice or reflows on resize. -->
    <div class="portal-desktop">
      <MemberMasthead
        {firstName}
        {standingSentence}
        seasonLabel={`${data.currentSeason} Season`}
        cta={data.state.kind === 'renewal-window' ? renewCta : undefined}
      />

      <div class="portal-body">
        <div class="portal-frame">
          {#if data.mirrorSegments.length > 0}
            <p class="portal-mirror">This season: {data.mirrorSegments.join(' · ')}</p>
          {/if}

          <div class="portal-work">
            <!-- A plain wrapper, not a second `<main>`: the layout above (`(site)/+layout.svelte`)
                 already supplies the page's one `<main>` landmark, and an HTML `main` element may
                 not itself sit inside another `main`. -->
            <div>
              {@render paymentFormMessage()}
              {#if showNeedsAttention}
                <h2 class="portal-h2">Needs your attention</h2>
                {#if data.actionRows.length > 0}
                  <div class="portal-action-rows">
                    {#each data.actionRows as row (row.id)}
                      <ActionRowCard {row} csrf={data.csrf} />
                    {/each}
                  </div>
                {:else}
                  <AllClearMoment {anticipationOpensOn} />
                {/if}
              {/if}

              {#if data.receipts.length > 0}
                <h2 class="portal-h2" class:portal-h2-spaced={showNeedsAttention}>Recent receipts</h2>
                {#each data.receipts as receipt (receipt.id)}
                  {@render receiptRow(receipt)}
                {/each}
              {/if}
            </div>

            <aside>
              <PortalRail
                householdName={data.householdInfo?.name ?? ''}
                {householdMemberCount}
                assignments={data.assignments}
                waitlistEntries={data.waitlistEntries}
                myClasses={data.myClasses}
              />
            </aside>
          </div>

          {@render doorsRow()}
        </div>
      </div>
    </div>

    <!-- T3's mobile composition (docs/2026-07-16-portal-redesign-design.md, "the mobile design
         is its own composition, not a collapse"): a compact masthead, the "Needs your attention"
         section immediately beneath it with T3's stacked action-row anatomy
         (`ActionRow.svelte`'s own `stacked` prop -- the named fix for mock D's own mid-phrase
         wrap), then full-width reference sections in recognition order (gear & moorings,
         household, receipts) and the doors row. No value mirror (mock D's own 390px composition
         omits it, portal-directions.html L1143-1209) and no Classes tile (ruled acceptable on
         the probe: an occasional phone check does not need its empty-state line; Classes stays
         reachable via the doors row). -->
    <div class="portal-mobile">
      <MemberMasthead
        {firstName}
        {standingSentence}
        seasonLabel={`${data.currentSeason} Season`}
        cta={data.state.kind === 'renewal-window' ? renewCta : undefined}
        compact
        anchor={false}
      />

      <!-- The mobile breakpoint (see the style block's own comment) covers a wide range, phone
           through small-laptop width; this measure cap keeps the full-width sections from
           stretching into unreadably long lines once the composition renders at the wide end of
           that range, without reintroducing a second collapse point of its own. -->
      <div class="portal-mobile-body">
        {@render paymentFormMessage()}
        {#if showNeedsAttention}
          <div class="portal-mobile-section portal-mobile-section-action">
            <p class="portal-mobile-label">Needs your attention</p>
            {#if data.actionRows.length > 0}
              <div class="portal-action-rows">
                {#each data.actionRows as row (row.id)}
                  <ActionRowCard {row} csrf={data.csrf} stacked />
                {/each}
              </div>
            {:else}
              <AllClearMoment {anticipationOpensOn} />
            {/if}
          </div>
        {/if}

        <div class="portal-mobile-section">
          <p class="portal-mobile-label">Your gear &amp; moorings</p>
          {#if assetRows.length > 0}
            <ul class="portal-mobile-asset-list">
              {#each assetRows as row (row.id)}
                <li class="portal-mobile-asset-item">
                  <span class="portal-mobile-asset-name">{row.name}</span>
                  <span class="portal-mobile-asset-meta">
                    {#if row.chip}<span class="portal-mobile-asset-chip">{row.chip}</span>{/if}
                    {#if row.detail}<span>{row.detail}</span>{/if}
                  </span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="portal-mobile-empty">You hold no gear or moorings yet.</p>
          {/if}
          <p class="portal-mobile-foot">
            <a href="/my-account/gear" class="text-primary underline-offset-2 hover:underline">Manage gear &amp; moorings</a>
          </p>
        </div>

        <div class="portal-mobile-section">
          <p class="portal-mobile-label">Household</p>
          <p class="portal-mobile-value">{data.householdInfo?.name ?? ''} · {householdMemberCount} {householdMemberCount === 1 ? 'member' : 'members'}</p>
        </div>

        {#if data.receipts.length > 0}
          <div class="portal-mobile-section">
            <p class="portal-mobile-label">Recent receipts</p>
            {#each data.receipts as receipt (receipt.id)}
              {@render receiptRow(receipt)}
            {/each}
          </div>
        {/if}

        {@render doorsRow()}
      </div>
    </div>
  </div>

  <!-- Sign out rides the portal's OWN frame, not the site's centred prose measure. It previously
       carried `mx-auto max-w-measure-wide`, which centres a ~640px box inside the full-bleed
       shell: measured at 1440 it landed at left=283 while every other element on the page
       (the doors row, the section headings, the masthead's inner content) starts at left=80, so
       it read as stranded, aligned to nothing. Matching `.portal-body`/`.portal-frame` puts its
       left edge on the same line as the doors row it sits under. -->
  <div class="portal-signout">
    <div class="portal-frame">
      <form method="POST" action="?/signOut">
        <button type="submit" class="btn btn-sm portal-quiet-action portal-touch-btn">Sign out</button>
      </form>
    </div>
  </div>
{/if}

<style>
  /* The sign-in form used the page's own wide reading measure (`max-w-measure-wide`, ~640px+),
     so the fixed-width Turnstile widget (~300px) and the content-sized button sat well short of
     the full-width email input's own right edge, a ragged
     column. A narrower shared measure, matching the Turnstile widget's own natural width, plus
     dropping the button's `self-start` (so it stretches like every other child in this `flex-col`
     stack) brings all three controls' right edges into line. */
  .signin-form {
    max-width: 300px;
  }

  /* T3's own breakpoint, MEASURED rather than assumed against the design doc's own "~40rem"
     suggestion (this pass's own responsive acceptance criterion: "use your measurement, not the
     suggestion, if they disagree" -- they do). A Playwright probe forcing the desktop composition
     visible at a range of widths found `.portal-work`'s two-column grid (a 22rem/352px fixed rail
     plus this block's own padding) leaves the main column too narrow for the unstacked action
     row's real content (the stress fixture's own "Trailered Boat Parking fee outstanding" title
     plus its $150 amount and "Pay now" button) until roughly 1000px viewport width -- below that,
     the row wraps into two, three, even five lines, the exact named defect T3 exists to fix, and
     it reproduces AT 768px, one of this pass's own three required-designed widths. The suggested
     40rem would have put 768 on the desktop side of the switch, still broken. 64rem (1024px, one
     of Tailwind's own well-known breakpoints) clears that measured floor with real margin (1000px
     confirmed clean, re-verified at 1023/1024/1025 either side of the switch): everything at or
     below it, phone through small-laptop width, gets T3's own deliberately composed mobile layout
     (which already handles the stacked anatomy correctly at every width down to 320px); only wide
     desktop gets the rich two-column rail. Both compositions render in the DOM at once; only
     `display` toggles, so a resize across the breakpoint never remounts either one or drops
     focus/scroll state. */
  .portal-mobile {
    display: none;
  }
  @media (max-width: 64rem) {
    .portal-desktop {
      display: none;
    }
    .portal-mobile {
      display: block;
    }
  }

  /* The working area's own vertical rhythm and 1280px desktop-width boxing (mock D's own
     `.mockD-body`/`.frame-wide`, portal-directions.html L572-593): deliberately WIDER than the
     masthead's own `--container-measure-wide` inner content (MemberMasthead.svelte's own comment
     explains why) -- Geoff's own steer that the desktop mock uses real desktop width, not the
     shared prose measure. `.portal-shell` itself is the `site.css` `:has()` rule's own full-bleed
     marker (a direct child of `.site-main`), so this block's own horizontal padding is the ONLY
     gutter between its content and the viewport edge, replacing the padding `.site-main` no
     longer supplies once the marker cancels it.

     No narrow-width collapse of its own: T2 originally shrank this padding, and `.portal-work`
     below shrank to one column, under 700px, as its own compromise for a single shared
     composition. T3's own breakpoint above (1024px) now keeps `.portal-desktop` from ever
     rendering below that width at all, so a second, lower collapse point inside it would be dead
     code -- the properly-composed mobile layout is already what renders down there. */
  .portal-body {
    padding: var(--spacing-l) var(--spacing-l) 0;
  }
  .portal-frame {
    width: min(1280px, 100%);
    margin-inline: auto;
  }

  /* The sign-out foot: `.portal-body`'s own horizontal padding, so its `.portal-frame` child lands
     on the same left edge as the doors row above it (measured left=80 at 1440, matching). The
     block padding is asymmetric on purpose: `.portal-body` opens the composition with
     `--spacing-l` and closes it at 0, and this foot supplies that closing gutter instead. */
  .portal-signout {
    padding: 0 var(--spacing-l) var(--spacing-l);
  }

  .portal-mirror {
    margin: 0 0 var(--spacing-l);
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }

  .portal-work {
    display: grid;
    grid-template-columns: 1fr 22rem;
    gap: var(--spacing-l);
    padding-bottom: var(--spacing-l);
    align-items: start;
  }

  /* The gap between stacked action rows lives here, not as a `+` adjacent-sibling rule inside
     ActionRow.svelte itself: each row is its own component instance, and svelte-check's scoped-CSS
     analysis flags a same-component adjacent-sibling selector as unused when the only sibling
     comes from a parent-level `{#each}`, even though it would match correctly at runtime. */
  .portal-action-rows {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .portal-h2 {
    margin: 0 0 var(--spacing-s);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--text-step-2);
    line-height: var(--leading-snug);
    color: var(--color-base-content);
  }
  .portal-h2-spaced {
    margin-top: var(--spacing-l);
  }

  /* Flat, quiet receipt rows (mock D's own `.receipt-row`, portal-directions.html L317-339):
     tabular amounts, a fixed-width right column so every dollar figure lines up. */
  .portal-receipt-row {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-s);
    padding: var(--spacing-2xs) 0;
    border-top: 1px solid var(--color-card-border);
    font-size: var(--text-step--1);
  }
  .portal-receipt-row:first-of-type {
    border-top: none;
  }
  .portal-receipt-desc {
    flex: 1 1 auto;
    color: var(--color-base-content);
  }
  .portal-receipt-date {
    flex-shrink: 0;
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
  .portal-receipt-amount {
    flex-shrink: 0;
    width: 4ch;
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--color-base-content);
  }

  /* The mobile breakpoint (1024px) covers phone through small-laptop width; this measure cap
     keeps the full-width sections below from stretching into unreadably long lines at the wide
     end of that range, centered rather than pinned to the left edge. */
  .portal-mobile-body {
    max-width: var(--container-measure-wide);
    margin-inline: auto;
  }

  /* T3's mobile full-width sections (mock D's own `.mockD-mobile-section`, portal-directions.html
     L669-673): a tight hairline separator between sections, no tile chrome (no border, no
     background, no radius -- the design doc's own "no tile chrome, no shrunken cards"). The action
     section carries no top rule of its own (it sits directly under the masthead, mock D's own
     `.mockD-mobile-section-action` modifier). */
  .portal-mobile-section {
    padding: var(--spacing-m);
    border-top: 1px solid var(--color-card-border);
  }
  .portal-mobile-section-action {
    border-top: none;
  }

  /* One type step down from the section's own content (matching the desktop rail's own
     subordination recipe, `.portal-rail-label` in PortalRail.svelte -- reproduced here rather than
     reached for, since Svelte's per-component scoped CSS never crosses component boundaries). */
  .portal-mobile-label {
    margin: 0 0 var(--spacing-s);
    font-size: var(--text-step--2);
    font-weight: 600;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .portal-mobile-value,
  .portal-mobile-empty {
    margin: 0;
    font-size: var(--text-step--1);
    color: var(--color-base-content);
  }
  .portal-mobile-empty {
    color: var(--color-muted);
  }
  .portal-mobile-foot {
    margin: var(--spacing-xs) 0 0;
    font-size: var(--text-step--2);
  }

  .portal-mobile-asset-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .portal-mobile-asset-item {
    padding: var(--spacing-xs) 0;
    border-top: 1px solid var(--color-card-border);
  }
  .portal-mobile-asset-item:first-child {
    border-top: none;
    padding-top: 0;
  }
  .portal-mobile-asset-name {
    display: block;
    font-size: var(--text-step-0);
    font-weight: 600;
    color: var(--color-base-content);
  }
  .portal-mobile-asset-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--spacing-2xs);
    margin-top: var(--spacing-3xs);
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }
  .portal-mobile-asset-chip {
    display: inline-block;
    flex-shrink: 0;
    padding: 0.1rem 0.5rem;
    border: 1px solid color-mix(in oklab, var(--color-muted) 35%, transparent);
    border-radius: var(--radius-selector);
    font-weight: 600;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* The doors row (mock D's own `.doors-row`, portal-directions.html L363-384): the site's real
     en-dash list marker (site.css L203-217), turned sideways into a wrapping horizontal row. */
  .portal-doors {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2xs) var(--spacing-m);
    padding: var(--spacing-m) 0;
    border-top: 1px solid var(--color-card-border);
    font-size: var(--text-step--1);
  }
  /* The 44px touch-target floor (this pass's own binding mobile constraint): a bare
     `text-step--1` line box lands around 21px, well under it, and this row is the portal's ONLY
     navigation on every phone (`.portal-desktop` is hidden below the 1024px breakpoint). The
     same invisible-padding technique `.portal-back-link` already uses (asc-components.css):
     real vertical padding grows the tap target, an equal negative margin cancels it back out of
     the row's own layout, so the visible text position and the row's wrap gap are unchanged. */
  .portal-doors a {
    position: relative;
    display: inline-block;
    padding-left: 1.1em;
    padding-block: 0.6875rem;
    margin-block: -0.6875rem;
    color: var(--color-primary);
    text-decoration: none;
  }
  .portal-doors a::before {
    content: '\2013';
    position: absolute;
    left: 0;
    color: color-mix(in oklab, var(--color-muted) 67%, var(--color-harbor-ink) 33%);
  }
  .portal-doors a:hover {
    text-decoration: underline;
  }
  .portal-doors a:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  /* The desktop doors row sits inside `.portal-frame`, which already carries `.portal-body`'s own
     horizontal padding; the mobile composition has no such wrapper, so this is its own gutter. */
  .portal-mobile .portal-doors {
    padding-inline: var(--spacing-m);
  }
</style>
