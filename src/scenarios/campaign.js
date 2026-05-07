import { get } from 'svelte/store';
import {
  clock, bandwidth, feeds, currentShift, coherence,
  terminalMode, terminalState, nature,
} from '../core/store.js';
import { advance }                            from '../core/clock.js';
import { drawAspects, manifestAnomaly }       from '../core/anomaly.js';
import { triggerDoctrinal, resetShiftTracking } from '../feeds/doctrinal.js';
import { loadGhostSignals, loadLastCommand }  from '../core/persistence.js';
import { loadScenario, endShift as engineEndShift } from '../scenarios/engine.js';
import { checkEndgameConditions, resolveTerminalState } from '../endgame/terminalStates.js';
import { speakBreachAnnouncement, startVoiceCountdown } from '../audio/soundscape.js';

// ── Module state ───────────────────────────────────────────────────────────

let _cascadeTimers = [];
let _lastEndgame   = null;
let _evtCounter    = 0;  // sequential short IDs so players can type them

export function _resetCampaignForTesting() {
  _cascadeTimers.forEach(id => clearTimeout(id));
  _cascadeTimers = [];
  _lastEndgame = null;
  _evtCounter  = 0;
}

export function _getCascadeTimerCount() {
  return _cascadeTimers.length;
}

export function getLastEndgame() {
  return _lastEndgame;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pushEvent(feedName, partial) {
  const { id: explicitId, ...rest } = partial;
  const id = explicitId ?? `evt-${String(++_evtCounter).padStart(3, '0')}`;
  feeds.update(s => ({
    ...s,
    [feedName]: [
      ...s[feedName],
      {
        id,
        timestamp:   get(clock).time,
        shift:       get(currentShift),
        anomalyFlag: false,
        verified:    false,
        ...rest,
      },
    ],
  }));
}

function schedule(delayMs, fn) {
  const id = setTimeout(fn, delayMs);
  _cascadeTimers.push(id);
  return id;
}

function clearTimers() {
  _cascadeTimers.forEach(id => clearTimeout(id));
  _cascadeTimers = [];
}

async function injectGhostCommand(shiftNum) {
  if (shiftNum !== 1) return null; // ghost from previous run appears once, at the very start
  const lastCommand = await loadLastCommand();
  if (lastCommand === null) return null;
  feeds.update(s => ({
    ...s,
    sigint: [
      {
        id:          'ghost-command-000',
        timestamp:   '11:54:01',
        type:        'INTERCEPT',
        source:      'KIA // AGENT: UNKNOWN',
        content:     '"' + lastCommand + '"',
        anomalyFlag: false,
        verified:    false,
        isGhost:     true,
        shift:       shiftNum,
      },
      ...s.sigint,
    ],
  }));
  return lastCommand;
}

function modeForAct(shiftNum) {
  if (shiftNum <= 3) return 'VT220';
  if (shiftNum <= 7) return 'ANYK7';
  return 'NMCC';
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function startShift(shiftNum) {
  clearTimers();
  resetShiftTracking();
  currentShift.set(shiftNum);
  terminalMode.set(modeForAct(shiftNum));
  bandwidth.set({ total: 100, spent: 0 });

  await loadGhostSignals();
  await injectGhostCommand(shiftNum);

  if (shiftNum === 1) {
    // DIPLOMAT — mission context
    pushEvent('diplomat', {
      id:   'brief-d01',
      type: 'BRIEFING',
      content: 'SHIFT 1 OF 10. GEOPOLITICAL SITUATION: UNSTABLE. MONITOR ALL FEEDS. AWAIT INCOMING SIGNALS.',
    });

    // TACTICAL — what to expect
    pushEvent('tactical', {
      id:   'brief-t01',
      type: 'BRIEFING',
      content: 'EVENTS WILL APPEAR IN THIS FEED. EACH CARRIES AN ID IN BRACKETS. USE THAT ID TO RESPOND.',
    });

    // SIGINT — command reference
    pushEvent('sigint', {
      id:   'sys-001',
      type: 'SYSTEM',
      content: 'COMMANDS: INTERCEPT [id] · VERIFY [id] · DECODE [id] · TRIANGULATE [id] · AUTH STRIKE [id] · SILENCE [target] · LEAK [id] [faction]',
    });
    pushEvent('sigint', {
      id:   'sys-002',
      type: 'SYSTEM',
      content: 'EXAMPLE: when you see [evt-002] in TACTICAL, type — VERIFY evt-002 — and press ENTER.',
    });
  }

  if (shiftNum === 4) drawAspects();

  // Shift 10: breach fires after 60 real seconds — no cascade event timers
  if (shiftNum === 10) {
    schedule(60_000, () => triggerBreach(10));
    startVoiceCountdown();
  }

  runCascade(shiftNum);
}

export function runCascade(shiftNum) {
  switch (shiftNum) {
    case 1:  _cascade1(); break;
    case 2:  _cascade2(); break;
    case 3:  _cascade3(); break;
    case 4:  _cascade4(); break;
    case 5:  _cascade5(); break;
    case 6:  _cascade6(); break;
    case 7:  _cascade7(); break;
    case 8:  _cascade8(); break;
    case 9:  _cascade9(); break;
    case 10: /* no automatic cascade events — just the clock and the prompt */ break;
  }
}

export function triggerBreach(shiftNum) {
  _breach(shiftNum);
}

export function startHaunting(shiftNum) {
  engineEndShift();
  schedule(3_000, () => {
    if (shiftNum < 10) startShift(shiftNum + 1);
  });
}

// ── Act 1 — Shifts 1–3: The Crisis Emerges ────────────────────────────────

function _cascade1() {
  schedule(5_000, () => pushEvent('diplomat', {
    type:    'CEASEFIRE_STATUS',
    content: 'Ceasefire between Northern Coalition and Eastern Bloc holding. Confidence: 34%. Both parties report contact anomalies on secure channels.',
  }));

  schedule(15_000, () => pushEvent('tactical', {
    type:    'CONTACT_UNIDENTIFIED',
    origin:  'North Atlantic',
    content: 'Submarine contact. North Atlantic grid 52N-18W. Transponder silent. Classification: UNVERIFIED. Depth profile consistent with SSBN.',
  }));

  schedule(30_000, () => pushEvent('sigint', {
    type:    'TRANSMISSION_ENCRYPTED',
    origin:  'UNKNOWN',
    content: 'Encrypted burst transmission intercepted. Duration: 0.4s. Origin triangulation failed. Frequency: 4.625 MHz. Signal pre-dates this facility.',
  }));

  schedule(90_000, () => triggerBreach(1));
}

function _cascade2() {
  // Oracle Array: surface fires immediately into SIGINT predicting the launch below.
  // Hidden unlocks when the LAUNCH_DETECTED event appears in TACTICAL (5s in).
  loadScenario('oracle-array');

  schedule(5_000, () => pushEvent('tactical', {
    type:    'LAUNCH_DETECTED',
    origin:  'UNKNOWN',
    content: 'Ballistic trajectory confirmed. Single warhead. Apogee: 1,240km. Impact window: 18 minutes. Origin: disputed.',
  }));

  schedule(20_000, () => pushEvent('diplomat', {
    type:    'COMMS_STATUS',
    content: 'Three heads of state on simultaneous hold. Audio delays inconsistent with satellite lag. Voices authenticated. Delays are not network.',
  }));

  schedule(45_000, () => pushEvent('sigint', {
    type:        'DEAD_DROP',
    source:      'AGENT: MARCUS YAO',
    content:     'Partial intercept — "...its rider was given power to take peace from the earth..." Remainder corrupted. Agent status: unconfirmed.',
    anomalyFlag: true,
  }));

  schedule(90_000, () => triggerBreach(2));
}

function _cascade3() {
  // Ghost Submarine scenario: all three layers available.
  // Hidden/forbidden unlock on player action — engine.checkUnlocks() handles this
  // when called after commands in CommandLine.svelte.
  loadScenario('ghost-submarine');

  schedule(90_000, () => triggerBreach(3));
}

// ── Act 2 — Shifts 4–7: The System Fractures ──────────────────────────────

function _cascade4() {
  // Numbered Stations: surface fires immediately into SIGINT.
  // Hidden unlocks on next player command after any SIGINT anomaly appears (Marcus Yao at +5s).
  loadScenario('numbered-stations');

  schedule(5_000, () => {
    pushEvent('sigint', {
      type:        'AUTH_ANOMALY',
      source:      'AGENT: MARCUS YAO',
      content:     'Login registered. Agent Marcus Yao. Timestamp valid. Agent Marcus Yao has been KIA for 11 days.',
      anomalyFlag: true,
    });
    triggerDoctrinal('GITA_SOUL_NEVER_DIES');
  });

  schedule(20_000, () => {
    pushEvent('tactical', {
      type:        'PLATFORM_ACTIVATED',
      origin:      'LOW EARTH ORBIT',
      content:     'Satellite weapons platform SERAPH-7 activated without authorization key. Targeting array initializing. Operator ID: NULL.',
      anomalyFlag: true,
    });
    triggerDoctrinal('REV_8_10');
  });

  schedule(40_000, () => pushEvent('diplomat', {
    type:        'TREATY_ANOMALY',
    content:     'Non-Proliferation Treaty amendment appears countersigned. Three signatory leaders deny knowledge of signing. Biometric authentication: valid.',
    anomalyFlag: true,
  }));

  schedule(90_000, () => triggerBreach(4));
}

function _cascade5() {
  // Dead Letter: surface fires immediately into DIPLOMAT.
  // Hidden unlocks on first player command — cascade4's TREATY_ANOMALY is already in feeds.diplomat.
  loadScenario('dead-letter');

  schedule(5_000, () => {
    pushEvent('tactical', {
      type:    'COALITION_ADVANCE',
      origin:  'Euphrates Corridor',
      content: 'Eastern coalition has crossed the Euphrates line. Fourteen armored divisions. Air cover confirmed. This threshold has not been crossed since 1973.',
    });
    triggerDoctrinal('REV_16_12');
  });

  // Three anomaly manifestations in rapid succession — OBEY becomes executable
  schedule(20_000, () => manifestAnomaly());
  schedule(23_000, () => manifestAnomaly());
  schedule(26_000, () => manifestAnomaly());

  schedule(45_000, () => {
    pushEvent('diplomat', {
      type:        'BLACKOUT',
      content:     'Global communications blackout spreading from central node. Seventeen relay stations dark. Pattern consistent with coordinated suppression, not failure.',
      anomalyFlag: true,
    });
    triggerDoctrinal('REV_13_16');
  });

  schedule(90_000, () => triggerBreach(5));
}

function _cascade6() {
  // WyrmOS goes silent — all feeds go quiet. REV_17_8 fires at the start of silence.
  triggerDoctrinal('REV_17_8');

  schedule(90_000, () => {
    pushEvent('sigint', {
      type:        'SIGNAL_RESUMED',
      content:     'Feed restored. Origin of interruption: unlogged. Duration in system records: 0 seconds.',
      anomalyFlag: true,
    });
    pushEvent('tactical', {
      type:    'STATUS_RESUMED',
      content: 'Tactical feed restored. Three events occurred during blackout. Events not in buffer.',
    });
    pushEvent('diplomat', {
      type:    'COMMS_RESUMED',
      content: 'Diplomatic channel restored. Your last transmission was not sent. No record of the silence.',
    });

    // Ghost signals from previous runs surface after the silence
    loadGhostSignals().then(ghosts => {
      ghosts.forEach(ghost => {
        feeds.update(s => ({
          ...s,
          sigint: [...s.sigint, {
            ...ghost,
            id:        crypto.randomUUID(),
            timestamp: get(clock).time,
            isGhost:   true,
            shift:     get(currentShift),
          }],
        }));
      });
    });
  });

  schedule(120_000, () => triggerBreach(6));
}

function _cascade7() {
  schedule(5_000, () => {
    pushEvent('diplomat', {
      type:    'GOV_COLLAPSE',
      content: 'Two governments have collapsed within 40 minutes of each other. Succession unclear. Nuclear authorization chains: unverified.',
    });
    triggerDoctrinal('REV_6_1');
  });

  schedule(25_000, () => {
    pushEvent('tactical', {
      type:        'DETONATION_CONFIRMED',
      origin:      'Central Asia',
      content:     'Nuclear detonation confirmed. Yield: 140kt. Target: disputed. Seismic signature consistent with airburst. No claim of responsibility.',
      anomalyFlag: true,
    });
    triggerDoctrinal('REV_6_12');
  });

  schedule(50_000, () => {
    pushEvent('sigint', {
      type:        'DOCUMENT_FRAGMENT',
      content:     'The Earth, ploughed now with optic fibers instead of iron, was seeded by ancestral hands, and the Cainite spirit courses through it.',
      anomalyFlag: true,
    });
    triggerDoctrinal('MORPHYSM_WAR_TORN_SOIL');
  });

  schedule(90_000, () => triggerBreach(7));
}

// ── Act 3 — Shifts 8–10: The Endgame ──────────────────────────────────────

function _cascade8() {
  schedule(5_000, () => pushEvent('tactical', {
    type:        'LAUNCH_MULTIPLE',
    origin:      'MULTIPLE',
    content:     'Twelve simultaneous launch events confirmed. Four origins unresolvable. Eight tracked. Impact windows: 4–22 minutes. This terminal is the last relay.',
    anomalyFlag: true,
  }));

  schedule(20_000, () => pushEvent('diplomat', {
    type:    'CHANNELS_DARK',
    content: 'All diplomatic channels dark. No response on any frequency. Last transmission from any head of state: 47 minutes ago. Content: "Are you still there?"',
  }));

  schedule(35_000, () => {
    if (get(terminalState) === 'THE_LOOP') {
      loadLastCommand().then(cmd => {
        if (cmd) {
          pushEvent('sigint', {
            type:        'GHOST_SIGNAL',
            source:      'OPERATOR: SELF',
            content:     'Last command from your previous run: "' + cmd + '"',
            anomalyFlag: true,
            isGhost:     true,
          });
        }
      });
    }
  });

  schedule(90_000, () => triggerBreach(8));
}

function _cascade9() {
  // Guarantee all three traditions fire this Shift — Maximum Coherence Collapse activates
  schedule(5_000,  () => triggerDoctrinal('MORPHYSM_COMBATANTS_ANOMALIES'));
  schedule(20_000, () => triggerDoctrinal('REV_6_12'));
  schedule(35_000, () => triggerDoctrinal('GITA_LIMBS_FAIL'));

  schedule(90_000, () => triggerBreach(9));
}

// ── Breach handlers ────────────────────────────────────────────────────────

function _breach(shiftNum) {
  if (shiftNum !== 10) speakBreachAnnouncement(shiftNum);

  switch (shiftNum) {
    case 1:
      advance(5, 'FAILED_DIPLOMACY');
      triggerDoctrinal('REV_6_3');
      startHaunting(1);
      break;

    case 2:
      // One presidential call confirmed fake — THE_MIMIC manifests
      manifestAnomaly();
      startHaunting(2);
      break;

    case 3: {
      // Forbidden layer unlocks if player used VERIFY at least once this Shift
      const verified = get(feeds).sigint.some(e => e.verified);
      if (verified) triggerDoctrinal('REV_6_12');
      startHaunting(3);
      break;
    }

    case 4:
      // WyrmOS issues first unprompted commands — operator ID in process list
      triggerDoctrinal('MORPHYSM_AUTONOMOUS_AI');
      triggerDoctrinal('MORPHYSM_MACHINE_HEAD');
      checkEndgameConditions();
      startHaunting(4);
      break;

    case 5:
      coherence.update(c => Math.min(c, 60));
      checkEndgameConditions();
      startHaunting(5);
      break;

    case 6:
      // Maximum Coherence Collapse check — doctrinal.js handles silently if all three fired
      checkEndgameConditions();
      startHaunting(6);
      break;

    case 7:
      triggerDoctrinal('MORPHYSM_COMBATANTS_ANOMALIES');
      coherence.update(c => Math.min(c, 45));
      checkEndgameConditions();
      startHaunting(7);
      break;

    case 8:
      checkEndgameConditions();
      if (!get(terminalState)) startHaunting(8);
      break;

    case 9:
      coherence.update(c => Math.min(c, 25));
      checkEndgameConditions();
      if (!get(terminalState)) startHaunting(9);
      break;

    case 10:
      // The final moment. Check all endgame conditions first — player action may have
      // already set a state. If not, the clock reaches midnight.
      checkEndgameConditions();
      if (!get(terminalState)) {
        advance(600, 'FINAL_RECKONING');
      }
      _lastEndgame = resolveTerminalState(get(terminalState), get(nature));
      break;
  }
}
