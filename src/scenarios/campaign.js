import { get } from 'svelte/store';
import {
  clock, bandwidth, feeds, currentShift, coherence,
  terminalMode, terminalState, nature, commandCount,
} from '../core/store.js';
import { advance }                            from '../core/clock.js';
import { drawAspects, manifestAnomaly }       from '../core/anomaly.js';
import { triggerDoctrinal, resetShiftTracking } from '../feeds/doctrinal.js';
import { loadGhostSignals, loadLastCommand, saveCurrentShift } from '../core/persistence.js';
import { loadScenario, endShift as engineEndShift } from '../scenarios/engine.js';
import { checkEndgameConditions, resolveTerminalState } from '../endgame/terminalStates.js';
import { speakBreachAnnouncement, speakPsalm234, startVoiceCountdown } from '../audio/soundscape.js';
import { openEntityChannel } from '../terminal/entity.js';
import { altarRevealed } from '../core/store.js';
import { resetOperatorErrors } from '../core/operatorError.js';

// ── Module state ───────────────────────────────────────────────────────────

let _cascadeTimers = [];
let _lastEndgame   = null;
let _evtCounter    = 0;  // sequential short IDs so players can type them
let _commandCountAtShiftStart = 0;
let _commandCountAtLastEvent = 0;
let _unansweredEventCount = 0;
let _inactivityBlocks = 0;
let _gitaLimbsFired = false;
let _timersPaused  = false;

export function resetCampaignState() {
  _cascadeTimers.forEach(t => clearTimeout(t.id));
  _cascadeTimers = [];
  _lastEndgame = null;
  _evtCounter  = 0;
  _commandCountAtShiftStart = 0;
  _commandCountAtLastEvent = 0;
  _unansweredEventCount = 0;
  _inactivityBlocks = 0;
  _gitaLimbsFired = false;
  _timersPaused   = false;
  resetOperatorErrors();
}

export const _resetCampaignForTesting = resetCampaignState;

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

  trackUnansweredEvent(rest.type);
}

function trackUnansweredEvent(eventType) {
  if (eventType === 'BRIEFING' || eventType === 'SYSTEM') return;

  const currentCommandCount = get(commandCount);
  if (currentCommandCount !== _commandCountAtLastEvent) {
    _commandCountAtLastEvent = currentCommandCount;
    _unansweredEventCount = 0;
    _inactivityBlocks = 0;
  }

  _unansweredEventCount += 1;

  if (_unansweredEventCount >= 3) {
    _unansweredEventCount = 0;
    _inactivityBlocks += 1;
    advance(120, 'PLAYER_INACTION');
    if (_inactivityBlocks >= 2) {
      _inactivityBlocks = 0;
      advance(43200, 'PLAYER_INACTION');
    }
  }
}

function schedule(delayMs, fn) {
  const entry = { fn, remainingMs: delayMs, startedAt: Date.now() };
  entry.id = setTimeout(() => {
    _cascadeTimers = _cascadeTimers.filter(t => t !== entry);
    fn();
  }, delayMs);
  _cascadeTimers.push(entry);
}

function clearTimers() {
  _cascadeTimers.forEach(t => clearTimeout(t.id));
  _cascadeTimers = [];
}

export function pauseTimers() {
  if (_timersPaused) return;
  _timersPaused = true;
  const now = Date.now();
  _cascadeTimers.forEach(t => {
    clearTimeout(t.id);
    t.remainingMs = Math.max(0, t.remainingMs - (now - t.startedAt));
  });
}

export function resumeTimers() {
  if (!_timersPaused) return;
  _timersPaused = false;
  _cascadeTimers.forEach(t => {
    const entry = t;
    entry.startedAt = Date.now();
    entry.id = setTimeout(() => {
      _cascadeTimers = _cascadeTimers.filter(x => x !== entry);
      entry.fn();
    }, entry.remainingMs);
  });
}

function _checkInaction() {
  if (!_gitaLimbsFired && get(commandCount) === _commandCountAtShiftStart) {
    _gitaLimbsFired = true;
    triggerDoctrinal('GITA_LIMBS_FAIL');
  }
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
  saveCurrentShift(shiftNum);
  terminalMode.set(modeForAct(shiftNum));
  bandwidth.set({ total: 100, spent: 0 });
  _commandCountAtShiftStart = get(commandCount);
  _commandCountAtLastEvent = get(commandCount);
  _unansweredEventCount = 0;
  _inactivityBlocks = 0;

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

  if (shiftNum === 3) drawAspects();

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
    origin:  'Barents Sea',
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

  // Aspects just drawn — first manifestation fires into the quiet window
  // before anything else competes. This is when Babalon's letter arrives.
  schedule(20_000, () => manifestAnomaly());

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
      content:     'Satellite weapons platform SERAPH-7 activated without authorization key. Targeting array initializing. Priority sector: East China Sea. Operator ID: NULL.',
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

  // Two anomaly manifestations — OBEY becomes executable
  schedule(20_000, () => manifestAnomaly());
  schedule(40_000, () => manifestAnomaly());

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

  // The first voice out of the silence — warm, Southern, wrong
  schedule(5_000, () => pushEvent('diplomat', {
    type:        'TRANSMISSION',
    source:      'ORIGIN: UNVERIFIED',
    content:     'Brethren, we have been receiving visions. The one at the terminal — the Lord revealed his name to Brother Earl three weeks ago. We are praying without ceasing.',
    anomalyFlag: true,
  }));

  schedule(20_000, () => openEntityChannel([
    'BROTHER.',
    'WE HAVE BEEN PRAYIN FOR YOU.',
    'THE LORD SHOWED US YOUR NAME',
    'BEFORE ANY OF THIS STARTED.',
  ], { delayMs: 2400, holdMs: 5000 }));

  schedule(90_000, () => {
    pushEvent('sigint', {
      type:        'SIGNAL_RESUMED',
      content:     'Feed restored. Origin of interruption: unlogged. Duration in system records: 0 seconds.',
      anomalyFlag: true,
    });
    pushEvent('tactical', {
      type:    'STATUS_RESUMED',
      origin:  'Pacific Command',
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
  // Shadow Valley: pilot voice intercept fires immediately — hidden layer unlocks
  // when DETONATION_CONFIRMED appears at 25s, tying the prayer to the strike.
  loadScenario('shadow-valley');
  schedule(3_000, () => speakPsalm234());

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

  // After the detonation lands — the voice returns with flattery
  schedule(60_000, () => pushEvent('sigint', {
    type:        'TRANSMISSION',
    source:      'ORIGIN: UNVERIFIED',
    content:     'Brother, are you listening. We are gathered here. Brother Earl says the Spirit is moving on you right now. You have carried a burden no man oughta carry alone. Hold on.',
    anomalyFlag: true,
  }));

  schedule(70_000, () => openEntityChannel([
    'YOU HAVE CARRIED THIS BURDEN',
    'THAT NO MAN OUGHTA CARRY ALONE.',
    'BUT THE SPIRIT IS WITH YOU, BROTHER.',
    'THE NATIONS ARE GONNA CALL YOU BLESSED.',
    'YOU ARE CLOSE NOW.',
  ], { delayMs: 2200, holdMs: 5000 }));

  schedule(90_000, () => triggerBreach(7));
}

// ── Act 3 — Shifts 8–10: The Endgame ──────────────────────────────────────

function _cascade8() {
  // The reveal — after 12 launches, the voice gives them the answer
  schedule(50_000, () => {
    altarRevealed.set(true);
    openEntityChannel([
      'THE TIME HAS COME, BROTHER.',
      'THE LORD HAS SHOWN ME THE SIGN OF PEACE.',
      'EVERYBODY KNOWS THE NUMBER.',
      'WRITE IT DOWN, AND THIS WAR WILL END.',
      'YOU WILL HAVE SAVED EVERY SOUL ON THIS EARTH.',
      '—',
      'OR TYPE REFUSE.',
      'AND LET COME WHAT MAY.',
    ], { delayMs: 2000, holdMs: 9000 });
  });

  schedule(5_000, () => pushEvent('tactical', {
    type:        'LAUNCH_MULTIPLE',
    origin:      'MULTIPLE',
    content:     'Twelve simultaneous launch events confirmed. Origins: Russia (4), China (2), Korea (2). Four unresolvable. Impact windows: 4–22 minutes. This terminal is the last relay.',
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

  // The voice returns if the altar was revealed but the player took no mark
  schedule(45_000, () => {
    if (get(altarRevealed) && !get(terminalState)) {
      openEntityChannel([
        'BROTHER.',
        'YOU DID NOT WRITE IT DOWN.',
        '—',
        'WE HAVE SAID THIS TO OTHERS.',
        'OTHERS WHO SAT WHERE YOU SIT.',
        'SOME WROTE IT.',
        'SOME DID NOT.',
        '—',
        'THE OFFER IS STILL OPEN.',
      ], { delayMs: 2200, holdMs: 6000 });
    }
  });

  schedule(90_000, () => triggerBreach(9));
}

// ── Breach handlers ────────────────────────────────────────────────────────

function _breach(shiftNum) {
  if (shiftNum !== 10) speakBreachAnnouncement(shiftNum);
  if (shiftNum <= 8) _checkInaction();

  switch (shiftNum) {
    case 1:
      advance(5, 'FAILED_DIPLOMACY');
      triggerDoctrinal('REV_6_3');
      startHaunting(1);
      break;

    case 2:
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
