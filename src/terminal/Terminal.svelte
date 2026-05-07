<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import FeedPane     from './FeedPane.svelte';
  import CommandLine  from './CommandLine.svelte';
  import WorldMap     from './WorldMap.svelte';
  import {
    clock, coherence, currentShift, terminalState, terminalMode,
    bandwidth, awareness, nature, feeds, anomalies,
  } from '../core/store.js';
  import { resolveTerminalState } from '../endgame/terminalStates.js';
  import {
    initSoundscape, playFeedEvent, playDoctrinal, corruptSoundLayer, stopSoundscape,
    setVoiceMode, speakTacticalEvent, updateVoiceCoherence, speakTerminalStateResolution,
    startConnectionSequence,
  } from '../audio/soundscape.js';
  import { startShift } from '../scenarios/campaign.js';

  // ── Per-mode corruption config ─────────────────────────────────
  const CORRUPTION_CONFIG = {
    VT220: {
      chars:     ['Ω', '∆', 'ℵ', 'ψ', '∇', '⊗', '∅'],
      threshold: 50,
      swapMs:    3000,
    },
    ANYK7: {
      chars:     ['#', '%', '$', '@', '!', '^', '~'],
      threshold: 40,
      swapMs:    3000,
      sepMs:     4000, // separator flicker
    },
    NMCC: {
      chars:     ['█', '▓', '▒', '░'],
      threshold: 31,
      swapMs:    3000,
      shiftMs:   5000,       // line shift interval
      shiftDuration: 2000,   // ms before shift resets
    },
  };

  // Coherence threshold for the header corrupt-color class — reactive per mode
  $: corruptThreshold = CORRUPTION_CONFIG[$terminalMode]?.threshold ?? 50;

  // ── Coherence display ──────────────────────────────────────────
  // Plain let — Svelte 5 tracks let assignments in closures correctly.
  // writable.set() inside setInterval does NOT trigger re-renders in Svelte 5.
  let coherenceDisplay = `COHERENCE: ${get(coherence)}%`;

  // ── Feed separator strings — reactive so ANYK7 can flicker them ─
  const CLEAN_SEPS = {
    diplomat: '──── DIPLOMAT',
    tactical: '──── TACTICAL',
    sigint:   '──── SIGINT',
    // DOCTRINAL removed — fragments inject inline into other feeds
  };
  let seps = { ...CLEAN_SEPS };

  // ── Timer handles ──────────────────────────────────────────────
  let swapTimer;
  let sepTimer;
  let shiftTimer;
  let unsubCoherence;
  let unsubMode;

  function clearTimers() {
    clearInterval(swapTimer);
    clearInterval(sepTimer);
    clearInterval(shiftTimer);
    swapTimer = sepTimer = shiftTimer = null;
    // Reset NMCC jitter
    document.documentElement.style.setProperty('--nmcc-jitter', '0px');
  }

  function startTimers(mode) {
    clearTimers();
    const cfg = CORRUPTION_CONFIG[mode];
    if (!cfg) return;

    // Reset display and separators to clean on every mode switch
    coherenceDisplay = `COHERENCE: ${get(coherence)}%`;
    seps = { ...CLEAN_SEPS };

    // ── Coherence display character swap (all modes) ──────────
    // Each tick reads BOTH current mode AND current coherence fresh —
    // this is the fix: the condition checks both simultaneously.
    swapTimer = setInterval(() => {
      const currentMode = get(terminalMode);
      const currentCoh  = get(coherence);
      const currentCfg  = CORRUPTION_CONFIG[currentMode];

      if (currentCfg && currentCoh < currentCfg.threshold) {
        const chars = coherenceDisplay.split('');
        const idx   = Math.floor(Math.random() * chars.length);
        chars[idx]  = currentCfg.chars[Math.floor(Math.random() * currentCfg.chars.length)];
        coherenceDisplay = chars.join('');
      }
    }, cfg.swapMs);

    // ── ANYK7: separator flicker ──────────────────────────────
    if (cfg.sepMs) {
      sepTimer = setInterval(() => {
        const currentMode = get(terminalMode);
        const currentCoh  = get(coherence);
        const currentCfg  = CORRUPTION_CONFIG[currentMode];

        if (currentCfg && currentCoh < currentCfg.threshold) {
          const fresh  = { ...CLEAN_SEPS };
          const keys   = Object.keys(fresh);
          const key    = keys[Math.floor(Math.random() * keys.length)];
          const str    = [...fresh[key]];
          const dashes = str.map((c, i) => c === '─' ? i : -1).filter(i => i !== -1);
          if (dashes.length > 0) {
            str[dashes[Math.floor(Math.random() * dashes.length)]] = ' ';
          }
          fresh[key] = str.join('');
          seps = fresh;
        } else {
          seps = { ...CLEAN_SEPS };
        }
      }, cfg.sepMs);
    }

    // ── NMCC: feed line shift via CSS custom property ─────────
    if (cfg.shiftMs) {
      shiftTimer = setInterval(() => {
        const currentMode = get(terminalMode);
        const currentCoh  = get(coherence);
        const currentCfg  = CORRUPTION_CONFIG[currentMode];

        if (currentCfg && currentCoh < currentCfg.threshold) {
          const dir = Math.random() < 0.5 ? '-2px' : '2px';
          document.documentElement.style.setProperty('--nmcc-jitter', dir);
          setTimeout(() => {
            document.documentElement.style.setProperty('--nmcc-jitter', '0px');
          }, currentCfg.shiftDuration ?? 2000);
        }
      }, cfg.shiftMs);
    }
  }

  // ── Pause menu ────────────────────────────────────────────────
  let menuOpen = false;
  let pauseEl;

  function newRun() {
    feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
    awareness.set(0);
    nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
    anomalies.set({ aspects: [], manifestations: [] });
    terminalState.set(null);
    coherence.set(100);
    _prevDiplomat = _prevTactical = _prevSigint = _prevManifestations = 0;
    _doctrinalFired = false;
    _terminalStateSpeaking = false;
    menuOpen = false;
    startShift(1);
  }

  function handleMenuKeydown(e) {
    e.stopPropagation(); // keep menu keys out of the global handler
    if (e.key === 'Escape' || e.key === 'r' || e.key === 'R') { menuOpen = false; }
    else if (e.key === 'n' || e.key === 'N') { newRun(); }
    else if (e.key === 'q' || e.key === 'Q') { window.close(); }
  }

  function handleGlobalKeydown(e) {
    if (e.key === 'Escape' && !menuOpen) {
      menuOpen = true;
      tick().then(() => pauseEl?.focus());
    }
  }

  // ── Soundscape: anomaly corruption tracking ────────────────────
  let _prevManifestations = 0;
  let unsubAnomalies;

  onMount(() => {
    startShift(1);

    // Reset coherence display whenever the real value changes
    unsubCoherence = coherence.subscribe(val => {
      coherenceDisplay = `COHERENCE: ${val}%`;
      updateVoiceCoherence(val);
    });

    // Subscribe to mode — fires immediately (initializes timers)
    // and on every mode change (restarts timers with new config)
    unsubMode = terminalMode.subscribe(mode => {
      startTimers(mode);
      setVoiceMode(mode);
    });

    // Corrupt the sound layer whenever a new anomaly manifests
    unsubAnomalies = anomalies.subscribe(a => {
      if (a.manifestations.length > _prevManifestations) {
        corruptSoundLayer();
        _prevManifestations = a.manifestations.length;
      }
    });

    const enterFullscreen = async () => {
      await initSoundscape();
      startConnectionSequence();
      document.documentElement.requestFullscreen().catch(() => {});
      document.removeEventListener('click', enterFullscreen);
    };
    document.addEventListener('click', enterFullscreen);
  });

  onDestroy(() => {
    clearTimers();
    unsubCoherence?.();
    unsubMode?.();
    unsubAnomalies?.();
    stopSoundscape();
  });

  // ── Mode transition ────────────────────────────────────────────
  $: if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('mode-vt220', 'mode-anyk7', 'mode-nmcc');
    document.documentElement.classList.add(`mode-${$terminalMode.toLowerCase()}`);
  }

  // ── Endgame screen ─────────────────────────────────────────────
  $: endgame = resolveTerminalState($terminalState, $nature);

  // ── Terminal state voice — fires once when state is first set ──
  let _terminalStateSpeaking = false;
  $: if ($terminalState && !_terminalStateSpeaking) {
    _terminalStateSpeaking = true;
    speakTerminalStateResolution($terminalState);
  }

  // ── Soundscape: feed event audio ───────────────────────────────
  // Fire sounds reactively when new events arrive in each feed.
  let _prevDiplomat = 0;
  let _prevTactical = 0;
  let _prevSigint   = 0;
  let _doctrinalFired = false;

  $: {
    if ($feeds.diplomat.length > _prevDiplomat) {
      playFeedEvent('DIPLOMAT');
      _prevDiplomat = $feeds.diplomat.length;
    }
  }
  $: {
    if ($feeds.tactical.length > _prevTactical) {
      const newTactical = $feeds.tactical.slice(_prevTactical);
      playFeedEvent('TACTICAL');
      newTactical.forEach(e => speakTacticalEvent(e));
      _prevTactical = $feeds.tactical.length;
    }
  }
  $: {
    if ($feeds.sigint.length > _prevSigint) {
      const newEvents = $feeds.sigint.slice(_prevSigint);
      const hasDoctrinal = newEvents.some(e => e.isDoctrinal);
      playFeedEvent('SIGINT');
      if (hasDoctrinal && !_doctrinalFired) {
        _doctrinalFired = true;
        playDoctrinal();
      }
      _prevSigint = $feeds.sigint.length;
    }
  }
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

<div class="terminal">

  <!-- ── Fixed header bar ───────────────────────────────────────── -->
  <header class="header-bar">
    <span class="header-left">
      ARCH OF EMPIRES // SHIFT {$currentShift} //
      <span class:alert={$clock.time > '11:58:00'}>{$clock.time}</span>
    </span>
    <span class="header-right">
      <span class:corrupt={$coherence < corruptThreshold}>{coherenceDisplay}</span>
    </span>
  </header>

  <!-- ── Scrollable feed stream ─────────────────────────────────── -->
  <main class="feed-stream">

    <section class="feed-section">
      <div class="feed-sep" style="color: var(--color-text); font-weight: bold;">{seps.diplomat}</div>
      <FeedPane feedName="DIPLOMAT" events={$feeds.diplomat} />
    </section>

    <section class="feed-section">
      <div class="feed-sep" style="color: var(--color-text); font-weight: bold;">{seps.tactical}</div>
      <FeedPane feedName="TACTICAL" events={$feeds.tactical} />
    </section>

    <section class="feed-section">
      <div class="feed-sep" style="color: var(--color-text); font-weight: bold;">{seps.sigint}</div>
      <FeedPane feedName="SIGINT" events={$feeds.sigint} />
    </section>

    <!-- DOCTRINAL feed dissolved — fragments appear inline within the
         feed that triggered them, ordered by timestamp, no label -->


  </main>

  <!-- ── Strategic overlay map ─────────────────────────────────── -->
  <WorldMap />

  <!-- ── Fixed status bar + command line ────────────────────────── -->
  <footer class="status-bar">
    <div class="status-line">
      BANDWIDTH: {$bandwidth.spent}/{$bandwidth.total} //
      AWARENESS: {$awareness} //
      NATURE: S:{$nature.system} P:{$nature.prophet} A:{$nature.antichrist} M:{$nature.martyr}
    </div>
    <CommandLine />
  </footer>

  <!-- ── Pause menu — z-index 200, above endgame overlay ──────── -->
  {#if menuOpen}
    <div
      class="pause-menu"
      bind:this={pauseEl}
      tabindex="-1"
      on:keydown={handleMenuKeydown}
    >
      <div class="pause-content">
        <div class="pause-title">ARCH OF EMPIRES</div>
        <div class="pause-rule">───────────────────────────</div>
        <div class="pause-item">[R] RESUME</div>
        <div class="pause-item">[N] NEW RUN</div>
        <div class="pause-item">[Q] QUIT TO DESKTOP</div>
        <div class="pause-rule">───────────────────────────</div>
        <div class="pause-note">The terminal does not save your choices.</div>
        <div class="pause-note">It only saves your debts.</div>
      </div>
    </div>
  {/if}

  <!-- ── Terminal state overlay ─────────────────────────────────── -->
  <!-- When set: full viewport, no animation, no explanation. -->
  {#if endgame}
    <div class="overlay">
      <div class="overlay-screen">
        <div class="overlay-heading">{endgame.heading}</div>
        {#each endgame.body as line}
          <div class="overlay-line">{line}</div>
        {/each}
      </div>
    </div>
  {/if}

</div>

<style>
  /* ── Shell ──────────────────────────────────────────────────── */

  .terminal {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  /* ── Header bar ─────────────────────────────────────────────── */

  .header-bar {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background: var(--color-header-bg, var(--color-highlight-bg));
    color: #000000;
    font-size: 14px;
    font-weight: bold;
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-shadow: none;
  }

  .header-left,
  .header-right {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Clock alert — no animation, just color */
  .alert  { color: var(--color-alert); }
  /* Coherence corrupt — uses header-specific color so it's visible
     against the inverted header background in all three modes */
  .corrupt { color: var(--color-header-corrupt, var(--color-text-corrupt)); }

  /* ── Feed stream ────────────────────────────────────────────── */

  .feed-stream {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  .feed-section {
    margin: 0;
    padding-bottom: 4px;
  }

  .feed-sep {
    padding: 2px 8px;
    margin: 0;
    color: var(--color-text);
    font-weight: bold;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    overflow: hidden;
  }

  /* ── Status bar ─────────────────────────────────────────────── */

  .status-bar {
    flex-shrink: 0;
    background: var(--color-statusbar-bg, var(--color-highlight-bg));
    color: var(--color-statusbar-text, var(--color-highlight-text));
    text-shadow: none;
  }

  .status-line {
    padding: 0.15em 0.5em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Pause menu ─────────────────────────────────────────────── */

  .pause-menu {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    outline: none; /* suppress focus ring on the container */
  }

  .pause-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75em;
    font-family: var(--font-primary);
    font-size: var(--font-size);
    color: var(--color-text);
    text-align: center;
  }

  .pause-title {
    font-size: 18px;
    letter-spacing: 0.2em;
    font-weight: bold;
    margin-bottom: 0.25em;
  }

  .pause-rule {
    color: var(--color-text-dim);
    letter-spacing: 0;
  }

  .pause-item {
    letter-spacing: 0.12em;
  }

  .pause-note {
    color: var(--color-text-dim);
    font-size: 11px;
    letter-spacing: 0.04em;
    line-height: 1.6;
  }

  /* ── Terminal state overlay ─────────────────────────────────── */

  .overlay {
    position: fixed;
    inset: 0;
    background: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .overlay-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.2em;
    max-width: 60ch;
    padding: 2em;
    text-align: center;
  }

  .overlay-heading {
    font-size: 36px;
    letter-spacing: 0.3em;
    color: var(--color-text-corrupt);
    text-transform: uppercase;
    text-shadow: none;
    margin-bottom: 0.4em;
  }

  .overlay-line {
    font-size: 14px;
    letter-spacing: 0.08em;
    color: var(--color-text-dim);
    text-transform: uppercase;
    text-shadow: none;
  }

  /* ── NMCC line shift — global, targets FeedPane event lines ── */
  /* Applies CSS transform via --nmcc-jitter custom property set  */
  /* from JS. Resets to 0px after shiftDuration ms.              */
  :global(.mode-nmcc .event-line) {
    transform: translateX(var(--nmcc-jitter, 0px));
  }
</style>
