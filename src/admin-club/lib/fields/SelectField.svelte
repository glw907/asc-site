<!--
@component
One labeled select in the admin idiom (DaisyUI v5's default-bordered `select`, no `-bordered`
modifier), sized and spaced the way `ConceptList`'s own rows-per-page picker is. Part of the
`fields.ts` stand-in barrel; see that file's header comment for the seam it fills.
-->
<script lang="ts">
  interface Option {
    value: string;
    label: string;
  }

  interface Props {
    /** The visible label, read to the left of the control. */
    label: string;
    /** The native `name`, so the field still works inside an ordinary form post. */
    name: string;
    /** The picked value, bindable. */
    value: string;
    /** The option list, in display order. */
    options: Option[];
  }

  let { label, name, value = $bindable(), options }: Props = $props();
</script>

<label class="flex items-center gap-1.5 text-sm">
  <span class="text-muted">{label}</span>
  <select class="select select-sm" {name} bind:value>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</label>
