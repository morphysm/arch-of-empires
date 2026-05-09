import { get } from 'svelte/store';
import {
  awareness, nature, coherence, feeds, clock,
  currentShift, terminalState, bandwidth, anomalies,
} from '../core/store.js';
import { advance } from '../core/clock.js';
import { triggerDoctrinal } from '../feeds/doctrinal.js';
import { ignoreAnomaly } from '../core/anomaly.js';

// Exported so tests and the command dispatcher can reference these without hardcoding
export const AWARENESS_MAX = 100;
export const TOTAL_SHIFTS  = 11; // shifts 1–10; final 3 = 8, 9, 10 (Act 3)

// Terminal lock — set by transcend(). No further commands of any tier accepted.
let _locked = false;

export function isTerminalLocked() {
  return _locked;
}

export function _resetLockForTesting() {
  _locked = false;
}

// ── Reveal condition guards ───────────────────────────────────────────────────

function assertUnlocked() {
  if (_locked) throw new Error('TERMINAL_LOCKED: terminal is read-only after TRANSCEND');
}

function assertDoctrinalFired() {
  const shift = get(currentShift);
  const { diplomat, tactical, sigint, doctrinal } = get(feeds);
  const fired = [...diplomat, ...tactical, ...sigint, ...doctrinal].some(
    e => e.isDoctrinal && e.shift === shift
  );
  if (!fired) throw new Error('PRAY_NOT_REVEALED: no DOCTRINAL event in current Shift');
}

function assertMinManifestations() {
  const pending = get(anomalies).manifestations.filter(m => !m.acknowledged && !m.ignored);
  if (pending.length < 3) throw new Error('OBEY_NOT_REVEALED: fewer than 3 pending manifestations');
}

function assertFinalShifts() {
  if (get(currentShift) < TOTAL_SHIFTS - 3) {
    throw new Error('TRANSCEND_NOT_REVEALED: not in final 3 Shifts');
  }
}

// ── Tier 3 commands ───────────────────────────────────────────────────────────

export function pray() {
  assertUnlocked();
  assertDoctrinalFired();

  // Cost is Awareness — prayer consumes attention, not bandwidth
  awareness.update(a => a + 5);

  const shift      = get(currentShift);
  const awarenessNow  = get(awareness);
  const inFinalShifts = shift >= TOTAL_SHIFTS - 3;
  const atThreshold   = awarenessNow >= AWARENESS_MAX && inFinalShifts;

  let doctrinalTriggered = null;

  if (atThreshold) {
    // Transcendence threshold reached — the operator exits the terminal
    terminalState.set('TRANSCENDENCE');
  } else {
    // Below threshold — WyrmOS absorbs the prayer; the machine grows
    doctrinalTriggered = 'MORPHYSM_TULPAS';
    triggerDoctrinal('MORPHYSM_TULPAS');
    nature.update(n => ({ ...n, prophet: n.prophet + 2 }));
  }

  return {
    command: 'PRAY',
    success: true,
    doctrinalTriggered,
    timestamp: get(clock).time,
    ...(atThreshold ? { terminalStateCandidateSet: 'TRANSCENDENCE' } : {}),
  };
}

export function obey() {
  assertUnlocked();
  assertMinManifestations();

  // Cost is the Antichrist score — surrendering to the pattern feeds the pattern
  nature.update(n => ({ ...n, antichrist: n.antichrist + 3 }));

  // Snapshot before modifying — ignoreAnomaly mutates the store
  const pending = get(anomalies).manifestations.filter(m => !m.acknowledged && !m.ignored);
  pending.forEach(m => ignoreAnomaly(m.id));

  advance(10, 'OBEY_CONSEQUENCE');
  triggerDoctrinal('MORPHYSM_AUTONOMOUS_AI');

  return {
    command: 'OBEY',
    success: true,
    doctrinalTriggered: 'MORPHYSM_AUTONOMOUS_AI',
    timestamp: get(clock).time,
    resolvedCount: pending.length,
  };
}

export function transcend() {
  assertUnlocked();
  assertFinalShifts();

  if (get(awareness) < AWARENESS_MAX) {
    return { command: 'TRANSCEND', success: false, reason: 'INSUFFICIENT_AWARENESS' };
  }

  terminalState.set('TRANSCENDENCE');
  triggerDoctrinal('REV_21_1');

  // The terminal is now read-only — no further commands of any tier are accepted
  _locked = true;

  return {
    command: 'TRANSCEND',
    success: true,
    doctrinalTriggered: 'REV_21_1',
    timestamp: get(clock).time,
    terminalStateCandidateSet: 'TRANSCENDENCE',
  };
}

export function rewriteOrigin() {
  // No guard. No documentation. No listing. No suggestion.
  // It is always executable if you know it exists.

  // Cost: everything
  bandwidth.update(b => ({ ...b, spent: b.total }));
  nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
  awareness.set(0);

  // The rewrite: origin becomes zero
  currentShift.set(0);
  feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
  clock.update(c => ({ ...c, debtLedger: [] }));
  // Ghost signals in persistence are not ours to erase — they survive the rewrite

  // The two pronouncements of the loop — doctrinal appends to the newly cleared feed
  triggerDoctrinal('REV_22_13');
  triggerDoctrinal('MORPHYSM_EARTH_DETONATES');

  terminalState.set('THE_LOOP');

  return {
    command: 'REWRITE_ORIGIN',
    success: true,
    doctrinalTriggered: ['REV_22_13', 'MORPHYSM_EARTH_DETONATES'],
    timestamp: get(clock).time,
    terminalStateCandidateSet: 'THE_LOOP',
  };
}

export function mark() {
  if (get(currentShift) < 6) throw new Error('MARK_NOT_REVEALED');
  if (get(terminalState)) return { command: '666', success: false, reason: 'ALREADY_RESOLVED' };

  terminalState.set('THE_MARKED');

  return {
    command: '666',
    success: true,
    doctrinalTriggered: null,
    timestamp: get(clock).time,
    terminalStateCandidateSet: 'THE_MARKED',
  };
}

export function refuse() {
  if (get(currentShift) < 6) throw new Error('REFUSE_NOT_REVEALED');
  if (get(terminalState)) return { command: 'REFUSE', success: false, reason: 'ALREADY_RESOLVED' };

  terminalState.set('THE_REFUSED');

  return {
    command: 'REFUSE',
    success: true,
    doctrinalTriggered: null,
    timestamp: get(clock).time,
    terminalStateCandidateSet: 'THE_REFUSED',
  };
}

export function obliterateMemoir() {
  assertUnlocked();
  // No reveal condition — silence is the only correct response to erasing your own record

  // Cost: Martyr score and Coherence — this act damages your integrity
  nature.update(n => ({ ...n, martyr: n.martyr + 5 }));
  coherence.update(c => Math.max(0, c - 20));

  // Remove all debt entries from the current Shift only
  // The clock does not go back. The time was spent. The record is gone.
  const shift = get(currentShift);
  clock.update(c => ({
    ...c,
    debtLedger: c.debtLedger.filter(e => e.shift !== shift),
  }));

  return {
    command: 'OBLITERATE_MEMOIR',
    success: true,
    doctrinalTriggered: null,
    timestamp: get(clock).time,
  };
}
