<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import FeedPane     from './FeedPane.svelte';
  import CommandLine  from './CommandLine.svelte';
  import WorldMap     from './WorldMap.svelte';
  import {
    clock, coherence, currentShift, terminalState, terminalMode,
    bandwidth, awareness, nature, feeds, anomalies,
    commandCount, playerLocation, entityMode, entityLines, entityVariant, altarRevealed,
    gamePaused, doctrinalFlash, pendingLetter, pendingYes,
  } from '../core/store.js';
  import { fetchPlayerLocation } from '../core/geolocate.js';
  import { closeEntityChannel } from './entity.js';
  import { resolveTerminalState } from '../endgame/terminalStates.js';
  import {
    initSoundscape, playFeedEvent, playDoctrinal, corruptSoundLayer, stopSoundscape,
    setVoiceMode, speakTacticalEvent, speakDoctrinal, updateVoiceCoherence, speakTerminalStateResolution,
    startConnectionSequence, resetVoiceForNewRun, playMarkMelody,
  } from '../audio/soundscape.js';
  import { startShift, resetCampaignState, pauseTimers, resumeTimers } from '../scenarios/campaign.js';
  import { resetLetterState } from '../core/anomaly.js';
  import { resetEngineState } from '../scenarios/engine.js';
  import { loadClock, loadCurrentShift } from '../core/persistence.js';
  import { resetTerminalLock } from '../commands/tier3.js';
  import BabalonImage from './BabalonImage.svelte';

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
    resetTerminalLock();
    gamePaused.set(false);
    doctrinalFlash.set(false);
    resetCampaignState();
    resetEngineState();
    clock.update(c => ({ ...c, time: '11:54:00', debtLedger: [] }));
    feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
    awareness.set(0);
    nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
    anomalies.set({ aspects: [], manifestations: [] });
    terminalState.set(null);
    coherence.set(100);
    _prevDiplomat = _prevTactical = _prevSigint = _prevManifestations = 0;
    _doctrinalFired = false;
    _terminalStateSpeaking = false;
    _geolocateFired = false;
    commandCount.set(0);
    playerLocation.set(null);
    closeEntityChannel();
    altarRevealed.set(false);
    pendingLetter.set(null);
    pendingYes.set(false);
    resetLetterState();
    menuOpen = false;
    resetVoiceForNewRun();
    startShift(1);
  }

  async function resumeFromLastShift() {
    resetTerminalLock();
    gamePaused.set(false);
    doctrinalFlash.set(false);
    resetCampaignState();
    resetEngineState();
    const savedClock = await loadClock();
    clock.set(savedClock ?? { time: '11:54:00', debtLedger: [] });
    feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
    awareness.set(0);
    nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
    anomalies.set({ aspects: [], manifestations: [] });
    terminalState.set(null);
    coherence.set(100);
    _prevDiplomat = _prevTactical = _prevSigint = _prevManifestations = 0;
    _doctrinalFired = false;
    _terminalStateSpeaking = false;
    _geolocateFired = false;
    commandCount.set(0);
    playerLocation.set(null);
    closeEntityChannel();
    altarRevealed.set(false);
    pendingLetter.set(null);
    pendingYes.set(false);
    resetLetterState();
    menuOpen = false;
    resetVoiceForNewRun();
    const savedShift = await loadCurrentShift();
    startShift(savedShift ?? 1);
  }

  function openMenu() {
    menuOpen = true;
    pauseTimers();
    tick().then(() => pauseEl?.focus());
  }

  function closeMenu() {
    menuOpen = false;
    resumeTimers();
  }

  function handleMenuKeydown(e) {
    e.stopPropagation(); // keep menu keys out of the global handler
    if (e.key === 'Escape' || e.key === 'r' || e.key === 'R') {
      if ((e.key === 'r' || e.key === 'R') && get(terminalState)) {
        resumeFromLastShift();
      } else {
        closeMenu();
      }
    }
    else if (e.key === 'n' || e.key === 'N') { newRun(); }
    else if (e.key === 'q' || e.key === 'Q') {
      document.exitFullscreen?.().catch(() => {});
      window.location.replace('about:blank');
    }
  }

  function handleGlobalKeydown(e) {
    if (e.key === 'Escape' && !menuOpen) {
      openMenu();
    }
  }

  // ── Soundscape: anomaly corruption tracking ────────────────────
  let _prevManifestations = 0;
  let unsubAnomalies;

  function handlePausedKey(e) {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    e.preventDefault();
    gamePaused.set(false);
    resumeTimers();
    tick().then(() => document.querySelector('.cmd-input')?.focus());
  }

  function autoFocus(node) {
    node.focus();
  }

  onMount(async () => {
    resetTerminalLock();
    const savedClock = await loadClock();
    clock.set(savedClock ?? { time: '11:54:00', debtLedger: [] });
    const savedShift = await loadCurrentShift();
    startShift(savedShift ?? 1);

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

  // ── Geolocation — fires once after the 3rd command ───────────
  let _geolocateFired = false;

  $: if ($commandCount >= 3 && !_geolocateFired) {
    _geolocateFired = true;
    triggerGeolocate();
  }

  function mkGeoEvent(content, anomalyFlag = false) {
    return {
      id: crypto.randomUUID(),
      timestamp: get(clock).time,
      type: 'GEOLOCATION',
      content,
      anomalyFlag,
      verified: false,
      isGhost: false,
      shift: get(currentShift),
    };
  }

  async function triggerGeolocate() {
    const loc = await fetchPlayerLocation();
    if (!loc) return;
    playerLocation.set(loc);

    const events = loc.isVPN
      ? [
          mkGeoEvent('GEOLOCATION SCAN COMPLETE'),
          mkGeoEvent('ROUTING ANOMALY — RELAY NODE IDENTIFIED'),
          mkGeoEvent(`NODE LOCATION: ${loc.city}, ${loc.country}`),
          mkGeoEvent('OPERATOR ORIGIN: UNRESOLVED'),
          mkGeoEvent('EVASION PROTOCOL RECOGNIZED — BEHAVIORAL SIGNATURE LOGGED', true),
        ]
      : [
          mkGeoEvent('GEOLOCATION SCAN COMPLETE'),
          mkGeoEvent(`SIGNAL TRIANGULATED — ISP ORIGIN: ${loc.city}, ${loc.country}`),
          mkGeoEvent('CONFIDENCE: INSUFFICIENT FOR STRIKE AUTHORIZATION'),
          mkGeoEvent('TRACKING ACTIVE — REFINEMENT IN PROGRESS', true),
        ];

    feeds.update(s => ({ ...s, sigint: [...s.sigint, ...events] }));
  }

  // ── Terminal state voice — fires once when state is first set ──
  let _terminalStateSpeaking = false;
  $: if ($terminalState && !_terminalStateSpeaking) {
    _terminalStateSpeaking = true;
    speakTerminalStateResolution($terminalState);
    if ($terminalState === 'THE_MARKED') playMarkMelody();
  }

  // ── Soundscape: feed event audio ───────────────────────────────
  // Fire sounds reactively when new events arrive in each feed.
  let _prevDiplomat = 0;
  let _prevTactical = 0;
  let _prevSigint   = 0;
  let _doctrinalFired = false;

  $: {
    if ($feeds.diplomat.length > _prevDiplomat) {
      const newDiplomat = $feeds.diplomat.slice(_prevDiplomat);
      playFeedEvent('DIPLOMAT');
      newDiplomat.filter(e => e.isDoctrinal).forEach(e => speakDoctrinal(e));
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
      newEvents.filter(e => e.isDoctrinal).forEach(e => speakDoctrinal(e));
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
      {#if $gamePaused}<span class="header-paused">// PAUSED</span>{/if}
    </span>
    <span class="header-right">
      <span class:corrupt={$coherence < corruptThreshold}>{coherenceDisplay}</span>
    </span>
  </header>

  <!-- ── Scrollable feed stream ─────────────────────────────────── -->
  <main class="feed-stream">

    {#if $entityMode}

      <!-- Entity channel: DIPLOMAT and TACTICAL go dark and redacted.
           The entity takes the channel where SIGINT was. -->

      <section class="feed-section">
        <div class="feed-sep feed-sep--dark">{seps.diplomat}</div>
        <div class="feed-redacted" aria-hidden="true">
          <div>░░░░░░░░░░░░░░░░░░░ ░░░░░░░░░░░░░░░░░░░░░░░░░</div>
          <div>░░░░░░░░░░░░ ░░░░░░░░░░░░░░</div>
          <div>░░░░░░░░░░░░░░░░░░░░░░░░ ░░░░░░░░░░</div>
        </div>
      </section>

      <section class="feed-section">
        <div class="feed-sep feed-sep--dark">{seps.tactical}</div>
        <div class="feed-redacted" aria-hidden="true">
          <div>░░░░░░░░░ ░░░░░░░░░░░░░░░░░░░░░░</div>
          <div>░░░░░░░░░░░░░░░░░░░░░░░░ ░░░░░░░░░░░░░░</div>
          <div>░░░░░░░░░░░░ ░░░░░░░░░░░</div>
        </div>
      </section>

      <section class="entity-channel" class:entity-babalon={$entityVariant === 'babalon'}>
        <div class="entity-rule"></div>
        {#each $entityLines as line (line + $entityLines.indexOf(line))}
          <div class="entity-line">{line}</div>
        {/each}
        <div class="entity-rule"></div>
      </section>

    {:else}

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

    {/if}

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

  <!-- ── Paused overlay — intercepts all keystrokes to resume ─── -->
  {#if $gamePaused}
    <div
      class="paused-overlay"
      tabindex="0"
      use:autoFocus
      on:keydown={handlePausedKey}
    ></div>
  {/if}

  <!-- ── Doctrinal flash ───────────────────────────────────────── -->
  {#if $doctrinalFlash}
    <div class="doctrinal-flash" aria-live="assertive">
      <span>YOU DECODED THIS.</span>
      <span>SOMETHING DECODED YOU.</span>
    </div>
  {/if}

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
        <div class="pause-note">Type PAUSE to suspend the terminal.</div>
        <div class="pause-note">Press any key to resume.</div>
        <div class="pause-rule">───────────────────────────</div>
        <div class="pause-note">The terminal does not save your choices.</div>
        <div class="pause-note">It only saves your debts.</div>
      </div>
    </div>
  {/if}

  <!-- ── Babalon's letter — terminal freezes until OPEN is typed ── -->
  {#if $pendingLetter}
    <div class="letter-overlay">
      <div class="letter-body">
        <div class="letter-seal">✉</div>
        <div class="letter-label">CONFIDENTIAL</div>
        <div class="letter-hint">TYPE OPEN</div>
        <BabalonImage />
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
    position: relative;
    z-index: 96;
  }

  .header-left,
  .header-right {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Clock alert — no animation, just color */
  .alert  { color: var(--color-alert); }

  .header-paused {
    animation: paused-blink 1s step-end infinite;
    color: var(--color-text-dim);
  }
  @keyframes paused-blink { 50% { opacity: 0; } }

  .paused-overlay {
    position: absolute;
    inset: 0;
    z-index: 150;
    outline: none;
    background: transparent;
  }

  .doctrinal-flash {
    position: absolute;
    inset: 0;
    z-index: 120;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4em;
    pointer-events: none;
    animation: doctrinal-fade 3.5s ease forwards;
  }
  .doctrinal-flash span {
    color: #ff1a1a;
    font-size: 1.5em;
    font-weight: bold;
    letter-spacing: 0.14em;
    text-shadow: 0 0 24px #ff1a1a, 0 0 8px #ff1a1a;
  }
  @keyframes doctrinal-fade {
    0%   { opacity: 0; }
    8%   { opacity: 1; }
    72%  { opacity: 1; }
    100% { opacity: 0; }
  }
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

  /* SIGINT accumulates more events than DIPLOMAT/TACTICAL — cap it to match */
  .feed-section:last-of-type :global(.feed-pane) {
    max-height: 15vh;
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
    position: relative;
    z-index: 115;
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

  /* ── Entity channel ─────────────────────────────────────────── */

  .feed-sep--dark {
    color: var(--color-text-dim) !important;
    font-weight: normal !important;
    opacity: 0.4;
  }

  .feed-redacted {
    padding: 2px 8px;
    color: var(--color-text-dim);
    opacity: 0.25;
    font-size: 0.9em;
    letter-spacing: 0.02em;
    line-height: var(--line-height);
    pointer-events: none;
    user-select: none;
  }

  .entity-channel {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 2em 0;
    min-height: 30vh;
  }

  .entity-rule {
    border-top: 1px solid var(--color-border);
    margin: 1.5em 8px;
    opacity: 0.5;
  }

  .entity-line {
    text-align: center;
    padding: 0.55em 2ch;
    letter-spacing: 0.18em;
    color: var(--color-text);
    font-size: var(--font-size);
    line-height: 1.8;
    animation: entity-reveal 600ms ease-in both;
  }

  .entity-babalon .entity-line {
    color: #cc0000 !important;
    text-shadow: 0 0 10px #990000 !important;
  }

  .entity-babalon .entity-rule {
    border-color: #660000;
  }

  @keyframes entity-reveal {
    from { opacity: 0; letter-spacing: 0.35em; }
    to   { opacity: 1; letter-spacing: 0.18em; }
  }

  /* ── Babalon's letter overlay ──────────────────────────────── */

  .letter-overlay {
    position: fixed;
    inset: 0;
    background: #000000;
    z-index: 110;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace !important;
    color: #cc0000 !important;
    text-shadow: none !important;
  }

  .letter-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.9em;
    animation: letter-arrive 1.8s ease forwards;
  }

  .letter-seal {
    font-size: 72px;
    font-family: serif !important;
    color: #cc0000 !important;
    text-shadow: 0 0 18px #cc0000, 0 0 40px #990000 !important;
    animation: letter-pulse 3.5s ease-in-out infinite;
  }

  .letter-label {
    font-size: 16px;
    letter-spacing: 0.5em;
    color: #cc0000 !important;
    text-shadow: 0 0 10px #cc0000 !important;
  }

  .letter-hint {
    font-size: 12px;
    letter-spacing: 0.25em;
    color: #cc0000 !important;
    text-shadow: none !important;
    margin-top: 1.2em;
    animation: letter-blink 1.4s step-end infinite;
  }

  @keyframes letter-arrive {
    0%   { opacity: 0; transform: translateY(12px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes letter-pulse {
    0%, 100% { text-shadow: 0 0 18px #cc0000, 0 0 40px #990000; }
    50%       { text-shadow: 0 0 28px #ff2200, 0 0 60px #cc0000, 0 0 90px #880000; }
  }

  @keyframes letter-blink { 50% { opacity: 0; } }

  /* ── NMCC line shift — global, targets FeedPane event lines ── */
  /* Applies CSS transform via --nmcc-jitter custom property set  */
  /* from JS. Resets to 0px after shiftDuration ms.              */
  :global(.mode-nmcc .event-line) {
    transform: translateX(var(--nmcc-jitter, 0px));
  }

  /* ── NMCC overlay — projection scale ───────────────────────── */
  /* 18×11 ft floor screen: each character reads from across the  */
  /* room. Heading dominates; body lines stay small beneath it.   */
  :global(.mode-nmcc .overlay-screen) {
    max-width: 88vw;
  }
  :global(.mode-nmcc .overlay-heading) {
    font-size: clamp(52px, 6vw, 92px);
    letter-spacing: 0.5em;
  }
  :global(.mode-nmcc .overlay-line) {
    font-size: 16px;
    letter-spacing: 0.12em;
  }
</style>
