<script lang="ts">
  /**
   * A copy with an emphasis.
   *
   * The dictionary holds the copy with the markers of the emphasis —
   * `**bold**` and `` `code` `` — and this component renders them. The copy
   * therefore stays whole in the dictionary (one string, one translation)
   * instead of being cut into pieces around the markup.
   *
   * The markers are a **contract of the dictionaries**, not a general
   * markup language: nothing that comes from the API or from a user ever
   * goes through here.
   */
  import { richSegments } from '$lib/i18n';

  interface Props {
    /** The copy, with its markers. */
    text: string;
  }

  let { text }: Props = $props();

  /** The pieces of the copy, with the kind of each one. */
  const segments = $derived(richSegments(text));
</script>

{#each segments as segment, index (index)}
  {#if segment.strong}
    <strong>{segment.text}</strong>
  {:else if segment.code}
    <code class="font-mono break-all">{segment.text}</code>
  {:else}
    {segment.text}
  {/if}
{/each}
