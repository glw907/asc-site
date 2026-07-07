<!--
@component
LOCAL STAND-IN for Part C's future office-list primitive (item 2 of
docs/superpowers/specs/2026-07-06-asc-phase-2-design-suite.md's Part C): "the admin's
triage-table pattern (list + chips + filters + row actions) exports as a composable, or every
Club screen hand-rolls it." Every /admin/club/* screen in this scaffold uses this one wrapper
instead of five copies of the office header-plus-card recipe (`ConceptList.svelte` is the pattern
this borrows from, kept to the header and card shell only; a Club screen supplies its own
`<table>`). Part C replaces this with the engine's real primitive (filters, sort, row actions)
once it ships.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The small uppercase label above the title. Every Club screen reads "Club". */
    eyebrow?: string;
    /** The screen's display-face heading. */
    title: string;
    /** The muted one-line subtitle under the heading: a live count, or a scope note. */
    subtitle?: string;
    /** An optional header-right control (a filter today; a future primary action). */
    action?: Snippet;
    /** The screen's own table, rendered inside the shared card shell. */
    children: Snippet;
  }

  let { eyebrow = 'Club', title, subtitle, action, children }: Props = $props();
</script>

<header class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
  <div class="flex flex-col gap-0.5">
    <span class="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted">{eyebrow}</span>
    <h1 class="text-2xl font-bold tracking-tight font-[family-name:var(--font-display)]">{title}</h1>
    {#if subtitle}<p class="text-sm text-muted">{subtitle}</p>{/if}
  </div>
  {#if action}{@render action()}{/if}
</header>

<div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 overflow-x-auto shadow-[var(--cairn-shadow)]">
  {@render children()}
</div>
