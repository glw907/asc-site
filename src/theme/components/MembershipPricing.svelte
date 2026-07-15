<!-- @component
Settings-driven membership pricing (Task 3, the unified-signup design's own "a settings change
can never strand the prose again" rule): reads the live tier price through `getTierPriceText`
(membership-pricing.remote.ts) and renders it as plain text, so a line like:

    :::membership-pricing{tier="individual"}
    :::

never carries a hand-typed dollar figure. The directive must sit on its own line (components.ts's
own comment explains why it can never embed mid-sentence). Mounted as a `membership-pricing`
island (markdown/components.ts): with no JavaScript, the static build() fallback (a link to the
join page) shows instead. -->
<script lang="ts">
  import { getTierPriceText } from '$theme/membership-pricing.remote';

  // An index signature (not a `tier`-typed Props interface) keeps this island component
  // assignable to IslandRegistry's Component<Record<string, unknown>> signature, the same
  // constraint ClassSchedule.svelte's own header documents; the directive's `tier` attribute
  // (validated to one of the three tiers by the registry's own `fields.select` options) is read
  // and narrowed here instead.
  let { tier: rawTier }: Record<string, unknown> = $props();
  const tier = $derived(
    (rawTier === 'family' || rawTier === 'young-adult' ? rawTier : 'individual') as 'individual' | 'family' | 'young-adult',
  );
</script>

{#await getTierPriceText(tier)}
  <span aria-hidden="true">…</span>
{:then text}
  {text ?? 'our current price'}
{:catch}
  our current price
{/await}
