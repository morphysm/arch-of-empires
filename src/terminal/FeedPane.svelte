<script>
  import { afterUpdate } from 'svelte';

  export let feedName = '';
  export let events   = [];

  let container;
  let prevLength = 0;

  // Auto-scroll to bottom only when new events are added
  afterUpdate(() => {
    if (container && events.length > prevLength) {
      container.scrollTop = container.scrollHeight;
    }
    prevLength = events.length;
  });
</script>

{#if events.length > 0}
  <div class="feed-pane" bind:this={container}>

      <!-- ── Per-event rendering ──────────────────────────────────── -->
      {#each events as event (event.id)}

        {#if event.isDoctrinal}
          <!-- Doctrinal fragments: inline, centered, no attribution.
               The player should not immediately understand what they are reading. -->
          <div class="doctrinal-entry">
            <div class="doctrinal-spacer"></div>
            <div class="doctrinal-content">{event.content}</div>
            <div class="doctrinal-spacer"></div>
          </div>

        {:else}
          <!-- Standard event line -->
          <div class="event-line" class:ghost={event.isGhost}>
            <span class="evt-ts">{event.timestamp}</span>
            <span
              class="evt-type"
              style="color: {event.anomalyFlag ? 'var(--color-alert)' : 'var(--color-text)'};"
            >{event.type}</span>
            <span class="evt-verified">{event.verified ? '✓' : ''}</span>
            <span class="evt-content">{event.content}</span>
          </div>
        {/if}

      {/each}

  </div>
{/if}

<style>
  /* ── Pane container ─────────────────────────────────────── */

  .feed-pane {
    max-height: 20vh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* ── Standard event line ────────────────────────────────── */

  .event-line {
    display: flex;
    align-items: baseline;
    gap: 0.75ch;
    padding: 0 8px;
    line-height: var(--line-height);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    animation: fp-fadein 300ms ease-in;
  }

  .event-line.ghost {
    opacity: 0.6;
  }

  .evt-ts {
    flex-shrink: 0;
    color: var(--color-text-dim);
  }

  .evt-type {
    flex-shrink: 0;
    min-width: 12ch;
    font-weight: bold;
    color: var(--color-text);
  }

  .evt-verified {
    flex-shrink: 0;
    width: 2ch;
    color: var(--color-text-dim);
    text-align: center;
  }

  .evt-content {
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Doctrinal feed ─────────────────────────────────────── */
  /* Sparse, weighted — each entry breathes on its own line.  */

  .doctrinal-entry {
    animation: fp-fadein 300ms ease-in;
  }

  .doctrinal-spacer {
    height: 1em;
  }

  .doctrinal-content {
    text-align: center;
    color: var(--color-text);
    padding: 0 2ch;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* ── Fade-in — CSS only, fires on element creation ─────── */

  @keyframes fp-fadein {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
</style>
