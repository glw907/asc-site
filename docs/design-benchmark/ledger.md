# Audit ledger — home page (felt-refinement audit, 2026-07-08)

The skill's persistent ledger: verdicts survive rounds; re-open an entry only when the
code it graded changes or the owner overrules it. All five recommendations below were
APPLIED 2026-07-08 (commit 02fc6c1) and are now already-right.

- **Selection color (::selection)** — APPLIED. There is no ::selection rule anywhere in theme.css, site.css, or the chassis (grep for 'selection' returns only a code comment). The interaction-text-selected crop confirms text highlights render in the OS default blue (
- **Near-black ink vs pure black** — RIGHT. base-content is oklch(24.7% 0.029 249) in light and oklch(92% 0.008 249) in dark, both carrying a slight navy chroma rather than pure #000/#fff. Body copy in every crop reads as warm-navy near-black, never a harsh pure b
- **Near-white grounds vs pure white** — RIGHT. base-100 is pure white (oklch(100% 0 0)) as the page paper, with warmth carried by the sage band tint (base-200 = oklch(96.7% 0.006 137.8)) rather than by warming the paper itself. The north-star names white as the paper
- **Palette constraint and tonal variation** — RIGHT. The palette is strictly governed: navy for structure/links, star-gold for marks only, fireweed capped at <=2x/page for CTAs, sage tints for bands, muted navy-ink for captions, plus a deliberately-engineered 4-color Seaso
- **Borders via transparency vs flat gray** — RIGHT. Light-mode hairlines use --color-card-border = oklch(90.9% 0.011 141.3), a green-tinted hairline (not flat gray), fixed to land on the north-star border color. Dark mode switches to a transparency formula: color-mix(base
- **Shadow layering and opacity** — RIGHT. --cairn-shadow is a proper two-layer shadow (0 1px 2px close + 0 6px 20px -8px ambient) with opacity tuned via color-mix against base-content (navy-tinted, not pure black); dark mode swaps to black 40%/55% layers. DaisyU
- **Border-radius consistency across framed elements** — RIGHT. A coherent two-tier radius system: --radius-box (0.5rem) on every photo/panel (hero, triptych group, fleet, facilities, News card images, notification strip) and --radius-field (0.4rem) on controls (hero fireweed CTA, cl
- **Image treatment consistency (radius/borders/aspect intent)** — RIGHT. Every photo uses border-radius:box, object-fit:cover, and no border or shadow of its own, so hero, fleet (near-square), facilities (portrait), and News thumbnails all read as one family. Per-photo object-position (learn
- **Scrim quality on the triptych** — RIGHT. The Learn/Race/Relax scrim is a bottom-anchored gradient in the brand navy (color-mix of --color-flag-navy-deep at 92%/65%/0% across 0%/30%/62%), computed in oklab, not a flat black tint. Tuned so the photo reads clear t
- **Notification strip surface** — RIGHT. NotificationStrip uses background var(--color-base-200) (the warm sage tint) with radius-box and a left-edge gold accent role, not a cold neutral gray. In crop-hero-notification it reads as a soft warm bar consistent wit
- **Dark-mode parity of color/surface/depth** — RIGHT. Dark grounds are navy-tinted near-blacks (base-100 22%, base-200 18%) not pure black, preserving the same warm-ink story; borders move to transparency (base-content 16%), shadows deepen to black 40%/55%, and the image-ba
- **text-wrap: balance on headings** — APPLIED. No text-wrap/balance/pretty declaration exists in the theme or chassis (grep confirms). Every section h2 on the home page (+page.svelte lines 200/273/338/373/440/465) and the prose h1/h2/h3 (prose.css) wrap without balan
- **text-wrap: pretty on body prose** — APPLIED. Body paragraphs (.prose base in prose.css, and the hero paragraph) use no text-wrap: pretty, so a single-word last line (a runt) can occur on any paragraph. None is visible in the current captures — the hero paragraph en
- **Type scale modularity — step-1 / step-2 collapse** — RIGHT. theme.css lines 155-156 declare --text-step-1 and --text-step-2 as byte-identical clamps (both `clamp(1.27rem, 1.25rem + 0.1vw, 1.33rem)`), collapsing what the chassis default keeps as two distinct rungs (1.125 vs 1.25re
- **Line-height per text role** — RIGHT. Role assignment is textbook: --leading-body 1.6 on paragraphs (research-backed, GOV.UK-cited in the token comment), --leading-snug 1.4 on the lead and h3, --leading-tight 1.12 on h1/h2 and the hero title. Larger display
- **Heading margins (tight-below / loose-above)** — RIGHT. prose.css avoids the classic miss deliberately: h2 gets --flow-space: var(--spacing-xl) above and margin-bottom:0 with only --spacing-xs to the next element (lines 105-116); h3 mirrors it (--spacing-l above, --spacing-xs
- **Tabular figures where digits column** — RIGHT. font-variant-numeric: tabular-nums is applied exactly where digits stack: the Season date column (SeasonList.svelte line 142) and the SpineRow event date block (line 146). Verified visually in crop-season-band — 'May 16
- **Proper typographic characters in rendered copy** — RIGHT. The copy uses real glyphs throughout: real ellipsis in '…and welcome' (hero), curly apostrophes ('we're', 'we'd', 'It's'), spaced em dash in 'family-friendly events — fun' and the notification 'starts May 18 — come', en-
- **Measure control (45–75ch)** — RIGHT. Hero text column measures to ~54ch (documented target at +page.svelte line 141), verified in crop-hero. Content bands box to --container-measure-wide (58rem) and, critically, do NOT stretch at 2560 — full-2560.png shows
- **Letter-spacing on headings and all-caps labels** — RIGHT. --tracking-tight (-0.011em) is applied to every display heading (h1/h2/h3, hero), and the closing-CTA heading tightens further to calc(tracking-tight * 1.5) per its comment. All-caps Season month labels ('MAY', 'JUNE', '
- **Baseline rhythm between sections** — RIGHT. Vertical rhythm flows from a single --flow-space owl selector (.prose > * + *) with per-element overrides, and the home bands use the fluid --spacing-* clamp scale (3xs through 2xl). Section-to-section spacing reads even
- **Widows/orphans on headings and short paragraphs** — RIGHT. At desktop (1440/2560) every home-page heading sits on one line, so no orphans are present in the captures. The only exposure is narrow-viewport heading wrap (e.g. 'Interested in learning more?' at 390), which the text-w
- **Hanging punctuation** — N/A. hanging-punctuation is unused (grep confirms). Its natural targets are pull-quotes and blockquotes with leading quotation marks; the home page has none (the prose pull-quote/blockquote treatments live in prose.css behind
- **Font loading strategy** — RIGHT. Three variable faces load via @fontsource-variable @imports (Figtree display, Source Sans 3 body, Source Code Pro mono), each backed by a full system-ui/-apple-system fallback stack in the --font-* tokens, so a FOUT fall
- **Focus-visible outline consistency (branded ring vs browser default)** — APPLIED. Every chrome and prose element carries an explicit `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }` (nav links, footer links, cards, CTA/ghost buttons, search trigger, theme toggle, mobi
- **Cursor affordance on icon-only header buttons vs. adjacent icon links** — APPLIED. In the header's icon trio (Donate, Search, Theme toggle) plus the Members caret and hamburger, Donate is an `<a href>` (browser default: pointer cursor) while Search trigger, Theme toggle, nav-caret, and hamburger are ba
- **Hover transition timing and easing consistency** — RIGHT. Every hand-written hover/focus transition in the codebase uses the same `0.15s ease` (nav links, logo, footer links, theme toggle, donate link, search trigger, search results, card lift, CTA button, ghost button, news ca
- **Focus ring visual recipe (thickness, offset, color, shape)** — RIGHT. Every explicit focus-visible rule uses the identical 2px solid `var(--color-primary)` outline with a 2px offset (footer swaps in `--color-footer-ink-strong` deliberately, for contrast on the dark band, and mobile links c
- **Reduced-motion coverage** — RIGHT. Every component with a hand-written transition (SiteHeader, SiteFooter, SearchModal, asc-components card, home page CTA/ghost/news-card) carries its own scoped `prefers-reduced-motion` gate, and site.css layers a blanket
- **View-transition cross-fade duration and feel** — RIGHT. The page-to-page cross-fade is set to 180ms via `::view-transition-old(root)/::view-transition-new(root) { animation-duration: 180ms }`, the documented intent being "deliberately quick and quiet ... so it reads as a feel
- **Font-loading strategy vs. layout shift** — RIGHT. Type is self-hosted via `@fontsource-variable` (Figtree, Source Sans 3, Source Code Pro), which ships `font-display: swap` by default (confirmed in the installed package CSS). The `--font-display`/`--font-body` stacks ea
- **Custom list markers (fleet dash list, facilities checklist)** — RIGHT. Both lists replace the native disc marker with deliberate `::before { content: '\2013' }` (en dash) for the fleet inventory and a checkmark glyph for the facilities amenity list, matching the intended "inventory" vs. "in
- **Text selection color (::selection)** — N/A. No `::selection` rule exists anywhere in the codebase; the capture shows the browser/OS default blue highlight. Given the calibration ("don't overdo this"), a themed selection color is a nice-to-have polish item on brand
- **Active/pressed states (:active)** — N/A. No `:active` pseudo-class exists anywhere on the site; every interactive element relies on hover + focus-visible alone. Given the CTA button already carries a hover lift (`translateY(-1px)` plus a brightness bump) and ca
- **Members dropdown hover-intent timing (open/close delay asymmetry)** — RIGHT. The Members flyout opens after a 120ms hover delay (avoids flicker for a passing pointer) and closes after a longer 250ms delay (gives a pointer travelling diagonally into the panel time to arrive). This asymmetry is the
- **Search input focus treatment inside the search modal** — RIGHT. The search field uses Tailwind's `outline-hidden` utility, which suppresses the ring cosmetically while keeping it available for forced-colors mode, the accessible variant of `outline-none`. This is appropriate here: the
- **Hover feedback on the What-we-do triptych tiles and news cards** — RIGHT. Both the triptych panel links and the news cards use the same lift/shadow (or background-shift) pattern at the same 150ms timing as the card grid elsewhere on the site, reinforcing one hover language across every card-sh

---

# Audit ledger — invisible-polish pass (mechanical + optical audits, 2026-07-15)

Four fresh-context audits ran 2026-07-15 against the shared-components vocabulary and the
portal/forms surfaces: `mechanical-audit.md` (static grep/read), `optical-typography.md`,
`optical-color.md`, `optical-micro.md` (pixel-measured, PIL/numpy on the render set). The
authoring session crashed before folding these into this ledger; full verbatim text was
recovered from the crashed session's subagent transcripts and lives at
`docs/design-benchmark/audits-2026-07-15/` — that directory is now the durable source for any
finding's exact wording and evidence, not this summary. Verdicts below stand unless the graded
code changes again. RIGHT/N-A verdicts from these audits are not repeated here in full; consult
the source files for anything not listed as APPLIED or OPEN.

Fixed by the invisible-polish batches (`e07fc45..d3e73e7`) or the 2026-07-16 basic-polish arc
(`c78b77d`, `0225f6c`, `4c79cdb`, `fa46a15`, `9a21ba3`) unless noted OPEN.

**mechanical-audit.md**
- Interaction-state gaps (`:active` absent sitewide; six hover-only link families — search
  results, spine-row title, events-toc link, ics/event-nav links, calendar-subscribe link,
  back-link — with no `:focus-visible`; `.nav-caret` a 24px hit area with no expansion) —
  APPLIED, `cbdbaee` (items 1–3) + `4b757af` (rider, mobile links + header icon trio).
- `join/apply` purchaser name/email/phone fields placeholder-only, no visible label — APPLIED,
  `4b757af` (item 1).
- Portal receipts dollar column missing `tabular-nums` — APPLIED, `4b757af` (item 3).
- Standing-gate candidates (hover/focus-visible selector parity, `:active` existence,
  touch-target hit-area incl. pseudo-element expansion) — APPLIED as `design-probe.mjs` checks,
  `d3e73e7`.
- **OPEN**: spacing literals off the token scale (§1, severity graded low at audit time — the
  `0.6rem 1.25rem` CTA padding tripled across three files was flagged as a shared-mixin
  candidate, not fixed); literal-white color bypassing the token system (§7, severity low,
  deliberate/commented); `:disabled` state styling absent; `-webkit-tap-highlight-color`
  absent; `.prose h4` lacks `text-wrap: balance` (h1–h3 have it).

**optical-typography.md**
- `:::related` eyebrow (0.06em) and availability-chip label (0.03em) letter-spacing diverging
  from `var(--tracking-eyebrow)` — APPLIED, `cbdbaee` (item 6).
- All other checks (leading-by-role, measure/measure-drift, hierarchy-from-weight, tabular
  numerals, rag control/widows-orphans, faux-bold, vertical rhythm, proximity grouping, optical
  centering, padding asymmetry) — RIGHT, no change. Coherence question: no AI-default tells.

**optical-color.md**
- All in-lens color/depth/surface checks (facts-label ink, chip-dot role discipline, table
  header rule, requirement-callout tone, related eyebrow, steps-rail ink, portal status accents,
  flatness-by-design, hairlines, radius consistency, elevation logic, dark-mode photo/scrim/band
  survival) — RIGHT, no change.
- Two observations flagged outside the lens, to interaction/forms: portal secondary/destructive
  buttons (`Sign out`, `Leave the club`, `Update listing`) rendering as chromeless bold text —
  APPLIED, `4b757af` (item 2, moved to plain `.btn` + muted ink). Donate dark-mode preset-amount
  buttons low-contrast unselected state — APPLIED, `cbdbaee` (item 5).
- **OPEN** (coverage gap, not a defect): portal pages (`my-account*`) have no dark-mode captures
  in the render set — dark-mode status card, danger card, and form inputs remain unaudited.

**optical-micro.md**
- `:::facts`/`:::steps` collapsed top margin (`margin: 0` co-declared with `--flow-space`,
  out-specifying the chassis flow-space owl selector, verified live via `getComputedStyle`) —
  APPLIED, `cbdbaee` (item 4).
- Dead `icon="anchor"` attribute on moorings.md's requirement callout (component never read
  `ctx.attributes.icon`) — APPLIED, `cbdbaee` (item 7, attribute dropped) + `0225f6c` (icon-slot
  support added to the callout component, closing the raised-not-applied follow-up).
- `/my-account/classes/` no designed empty state for zero classes/zero waitlist — APPLIED,
  `4b757af` (item 4).
- All measured ALREADY-RIGHT/NOT-APPLICABLE checks (steps counter optical centering, category
  dot/star vs. small-caps baseline, availability-chip padding, table left-edge alignment,
  requirement-callout padding, facts-row descender room, passage-icon baseline, chip truncation
  at 390, results-table numeral alignment, dark-mode callout parity; fees-table margin; posts/
  tags empty states untestable against current fixtures) — RIGHT or N/A, no change.

## Member-directory pass close (2026-07-18, fresh-context coherence read)

Read over the CI-minted baselines (directory + committees, 390/1440, both themes), verifier
fresh to the code:

- **/my-account/directory: DESIGNED at all four renders** — weight-built hierarchy, honest
  carets (no-content rows carry no affordance), even row rhythm, contrast pass in both
  themes. Caveat logged: fixtures exercise no title chips, secondary datum, or expanded
  panel; those surfaces are graded by the ratified T0 probes and Geoff's dev review, not by
  these baselines.
- **/my-account/committees: initially FAILED STRUCTURAL** — no designed empty state (blank
  ground to the footer at zero committees, the true pre-seed state). FIXED same session
  (`0e17796`): `.portal-committees-empty` in the directory's own muted register; baselines
  re-minted (`7aae304`) now enshrine the designed state. Cosmetic catches (straight
  apostrophes in both ledes) fixed in the same commit.
- Pre-existing flags routed to the polish backlog: dark-mode header logo near-invisible in
  site chrome; directory mail-icon optical alignment (settle by computed midline, not eye).
