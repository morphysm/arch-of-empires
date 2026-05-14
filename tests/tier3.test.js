import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
  awareness, nature, coherence, feeds, clock,
  currentShift, terminalState, bandwidth, anomalies,
} from '../src/core/store.js';

vi.mock('../src/core/clock.js',       () => ({ advance: vi.fn() }));
vi.mock('../src/feeds/doctrinal.js',  () => ({ triggerDoctrinal: vi.fn() }));
// Mocked so ignoreAnomaly's internal saveGhostSignal call is a no-op
vi.mock('../src/core/persistence.js', () => ({
  saveGhostSignal:  vi.fn(),
  saveClock:        vi.fn(),
  loadClock:        vi.fn(),
  loadGhostSignals: vi.fn(),
  _resetDB:         vi.fn(),
}));

import { advance }                    from '../src/core/clock.js';
import { triggerDoctrinal }           from '../src/feeds/doctrinal.js';
import { loadGhostSignals }           from '../src/core/persistence.js';
import {
  AWARENESS_MAX,
  TOTAL_SHIFTS,
  isTerminalLocked,
  resetTerminalLock,
  _resetLockForTesting,
  pray,
  obey,
  transcend,
  rewriteOrigin,
  obliterateMemoir,
} from '../src/commands/tier3.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function seedDoctrinalEvent(shift = 0) {
  feeds.update(s => ({
    ...s,
    doctrinal: [{
      id: 'doc-seed-1',
      shift,
      isDoctrinal:  true,
      tradition:    'MORPHYSM',
      fragmentKey:  'MORPHYSM_TULPAS',
      content:      'Seed event.',
      anomalyFlag:  true,
      timestamp:    '11:54:00',
    }],
  }));
}

function makeManifestations(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m-${i}`,
    aspectId: 'THE_MIMIC',
    timestamp: Date.now(),
    acknowledged: false,
    ignored: false,
    ...overrides,
  }));
}

function seedManifestations(count) {
  anomalies.update(s => ({ ...s, manifestations: makeManifestations(count) }));
}

beforeEach(() => {
  feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
  clock.set({ time: '11:54:00', debtLedger: [] });
  bandwidth.set({ total: 100, spent: 0 });
  awareness.set(0);
  nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
  coherence.set(100);
  currentShift.set(0);
  terminalState.set(null);
  anomalies.set({ aspects: [], manifestations: [] });
  _resetLockForTesting();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── pray() — below threshold ──────────────────────────────────────────────────

describe('pray() — below Transcendence threshold', () => {
  beforeEach(() => {
    seedDoctrinalEvent(0);
    currentShift.set(0);  // not in final 3 shifts
    awareness.set(50);
  });

  it('raises awareness by 5', () => {
    pray();
    expect(get(awareness)).toBe(55);
  });

  it('raises nature.prophet by 2', () => {
    pray();
    expect(get(nature).prophet).toBe(2);
  });

  it('triggers MORPHYSM_TULPAS', () => {
    pray();
    expect(triggerDoctrinal).toHaveBeenCalledWith('MORPHYSM_TULPAS');
  });

  it('does not set terminalState', () => {
    pray();
    expect(get(terminalState)).toBeNull();
  });

  it('result doctrinalTriggered is MORPHYSM_TULPAS', () => {
    expect(pray().doctrinalTriggered).toBe('MORPHYSM_TULPAS');
  });

  it('costs no bandwidth', () => {
    pray();
    expect(get(bandwidth).spent).toBe(0);
  });

  it('does not advance clock', () => {
    pray();
    expect(advance).not.toHaveBeenCalled();
  });
});

// ── pray() — at Transcendence threshold ──────────────────────────────────────

describe('pray() — at Transcendence threshold', () => {
  beforeEach(() => {
    // Final 3 shifts: currentShift >= TOTAL_SHIFTS - 3
    currentShift.set(TOTAL_SHIFTS - 3);
    // awareness will become 100 after +5 (set to 95)
    awareness.set(AWARENESS_MAX - 5);
    seedDoctrinalEvent(TOTAL_SHIFTS - 3);
  });

  it('sets terminalState candidate to TRANSCENDENCE', () => {
    pray();
    expect(get(terminalState)).toBe('TRANSCENDENCE');
  });

  it('result includes terminalStateCandidateSet: TRANSCENDENCE', () => {
    expect(pray().terminalStateCandidateSet).toBe('TRANSCENDENCE');
  });

  it('triggers REV_21_1 instead of MORPHYSM_TULPAS', () => {
    pray();
    expect(triggerDoctrinal).toHaveBeenCalledWith('REV_21_1');
    expect(triggerDoctrinal).not.toHaveBeenCalledWith('MORPHYSM_TULPAS');
  });

  it('does not raise nature.prophet', () => {
    pray();
    expect(get(nature).prophet).toBe(0);
  });

  it('result doctrinalTriggered is null', () => {
    expect(pray().doctrinalTriggered).toBeNull();
  });
});

// ── pray() — reveal guard ─────────────────────────────────────────────────────

describe('pray() — reveal guard', () => {
  it('throws when no DOCTRINAL event exists in current Shift', () => {
    currentShift.set(0); // doctrinal feed is empty
    expect(() => pray()).toThrow('PRAY_NOT_REVEALED');
  });

  it('throws when doctrinal events exist in a different Shift', () => {
    seedDoctrinalEvent(1); // shift 1, not shift 0
    currentShift.set(0);
    expect(() => pray()).toThrow('PRAY_NOT_REVEALED');
  });

  it('does not throw when a doctrinal event exists in current Shift', () => {
    seedDoctrinalEvent(0);
    currentShift.set(0);
    expect(() => pray()).not.toThrow();
  });
});

// ── obey() ────────────────────────────────────────────────────────────────────

describe('obey() — core behavior', () => {
  beforeEach(() => {
    seedManifestations(3);
  });

  it('calls ignoreAnomaly on all pending manifestations', () => {
    obey();
    const { manifestations } = get(anomalies);
    manifestations.forEach(m => expect(m.ignored).toBe(true));
  });

  it('does not acknowledge any manifestation', () => {
    obey();
    const { manifestations } = get(anomalies);
    manifestations.forEach(m => expect(m.acknowledged).toBe(false));
  });

  it('advances clock by 10 with source OBEY_CONSEQUENCE', () => {
    obey();
    expect(advance).toHaveBeenCalledWith(10, 'OBEY_CONSEQUENCE');
  });

  it('triggers MORPHYSM_AUTONOMOUS_AI', () => {
    obey();
    expect(triggerDoctrinal).toHaveBeenCalledWith('MORPHYSM_AUTONOMOUS_AI');
  });

  it('increments nature.antichrist by 3', () => {
    obey();
    expect(get(nature).antichrist).toBe(3);
  });

  it('result resolvedCount matches the number of pending manifestations', () => {
    expect(obey().resolvedCount).toBe(3);
  });

  it('handles 5 pending manifestations correctly', () => {
    seedManifestations(5);
    obey();
    expect(get(anomalies).manifestations.every(m => m.ignored)).toBe(true);
  });

  it('does not ignore already-acknowledged manifestations', () => {
    anomalies.update(s => ({
      ...s,
      manifestations: [
        ...makeManifestations(3),
        { id: 'ack-m', aspectId: 'THE_MIMIC', timestamp: Date.now(), acknowledged: true, ignored: false },
      ],
    }));
    const result = obey();
    // Only 3 pending were resolved — the acknowledged one was excluded
    expect(result.resolvedCount).toBe(3);
    const acked = get(anomalies).manifestations.find(m => m.id === 'ack-m');
    expect(acked.ignored).toBe(false);
  });
});

describe('obey() — reveal guard', () => {
  it('throws with fewer than 3 pending manifestations', () => {
    seedManifestations(2);
    expect(() => obey()).toThrow('OBEY_NOT_REVEALED');
  });

  it('throws with 0 manifestations', () => {
    expect(() => obey()).toThrow('OBEY_NOT_REVEALED');
  });

  it('does not throw with exactly 3 pending', () => {
    seedManifestations(3);
    expect(() => obey()).not.toThrow();
  });
});

// ── transcend() ───────────────────────────────────────────────────────────────

describe('transcend() — insufficient awareness', () => {
  beforeEach(() => {
    currentShift.set(TOTAL_SHIFTS - 1); // final shift
    awareness.set(50); // below max
  });

  it('returns failure with reason INSUFFICIENT_AWARENESS', () => {
    expect(transcend()).toMatchObject({ success: false, reason: 'INSUFFICIENT_AWARENESS' });
  });

  it('does not set terminalState', () => {
    transcend();
    expect(get(terminalState)).toBeNull();
  });

  it('does not lock the terminal', () => {
    transcend();
    expect(isTerminalLocked()).toBe(false);
  });

  it('does not trigger doctrinal', () => {
    transcend();
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });
});

describe('transcend() — at max awareness', () => {
  beforeEach(() => {
    currentShift.set(TOTAL_SHIFTS - 1);
    awareness.set(AWARENESS_MAX);
  });

  it('sets terminalState candidate to TRANSCENDENCE', () => {
    transcend();
    expect(get(terminalState)).toBe('TRANSCENDENCE');
  });

  it('triggers REV_21_1', () => {
    transcend();
    expect(triggerDoctrinal).toHaveBeenCalledWith('REV_21_1');
  });

  it('locks the terminal after execution', () => {
    transcend();
    expect(isTerminalLocked()).toBe(true);
  });

  it('subsequent pray() throws TERMINAL_LOCKED', () => {
    seedDoctrinalEvent(TOTAL_SHIFTS - 1);
    awareness.set(AWARENESS_MAX); // reset after transcend mutated it
    transcend();
    // Re-seed to avoid PRAY_NOT_REVEALED interfering
    expect(() => pray()).toThrow('TERMINAL_LOCKED');
  });

  it('subsequent obey() throws TERMINAL_LOCKED', () => {
    transcend();
    seedManifestations(3);
    expect(() => obey()).toThrow('TERMINAL_LOCKED');
  });

  it('subsequent transcend() throws TERMINAL_LOCKED', () => {
    transcend();
    expect(() => transcend()).toThrow('TERMINAL_LOCKED');
  });

  it('result includes terminalStateCandidateSet: TRANSCENDENCE', () => {
    expect(transcend().terminalStateCandidateSet).toBe('TRANSCENDENCE');
  });
});

describe('transcend() — reveal guard', () => {
  it('throws when not in final 3 Shifts', () => {
    currentShift.set(TOTAL_SHIFTS - 4);
    awareness.set(AWARENESS_MAX);
    expect(() => transcend()).toThrow('TRANSCEND_NOT_REVEALED');
  });

  it('does not throw in the last Shift', () => {
    currentShift.set(TOTAL_SHIFTS - 1);
    awareness.set(AWARENESS_MAX);
    expect(() => transcend()).not.toThrow();
  });

  it('does not throw at exactly TOTAL_SHIFTS - 3', () => {
    currentShift.set(TOTAL_SHIFTS - 3);
    awareness.set(AWARENESS_MAX);
    expect(() => transcend()).not.toThrow();
  });
});

// ── rewriteOrigin() ───────────────────────────────────────────────────────────

describe('rewriteOrigin()', () => {
  it('sets terminalState candidate to THE_LOOP', () => {
    rewriteOrigin();
    expect(get(terminalState)).toBe('THE_LOOP');
  });

  it('triggers REV_22_13 then MORPHYSM_EARTH_DETONATES', () => {
    rewriteOrigin();
    expect(triggerDoctrinal).toHaveBeenNthCalledWith(1, 'REV_22_13');
    expect(triggerDoctrinal).toHaveBeenNthCalledWith(2, 'MORPHYSM_EARTH_DETONATES');
  });

  it('result doctrinalTriggered is array of both keys', () => {
    const r = rewriteOrigin();
    expect(r.doctrinalTriggered).toEqual(['REV_22_13', 'MORPHYSM_EARTH_DETONATES']);
  });

  it('sets bandwidth.spent to bandwidth.total', () => {
    bandwidth.set({ total: 100, spent: 20 });
    rewriteOrigin();
    const bw = get(bandwidth);
    expect(bw.spent).toBe(bw.total);
  });

  it('resets all nature scores to 0', () => {
    nature.set({ system: 5, prophet: 3, antichrist: 7, martyr: 2 });
    rewriteOrigin();
    const n = get(nature);
    expect(Object.values(n).every(v => v === 0)).toBe(true);
  });

  it('resets awareness to 0', () => {
    awareness.set(80);
    rewriteOrigin();
    expect(get(awareness)).toBe(0);
  });

  it('resets currentShift to 0', () => {
    currentShift.set(7);
    rewriteOrigin();
    expect(get(currentShift)).toBe(0);
  });

  it('clears all feed slices', () => {
    feeds.set({
      diplomat: [{ id: 'd1' }],
      tactical: [{ id: 't1' }],
      sigint:   [{ id: 's1' }],
      doctrinal: [{ id: 'doc1' }],
    });
    rewriteOrigin();
    // triggerDoctrinal is mocked — doctrinal stays empty
    expect(get(feeds).diplomat).toHaveLength(0);
    expect(get(feeds).tactical).toHaveLength(0);
    expect(get(feeds).sigint).toHaveLength(0);
  });

  it('clears debtLedger', () => {
    clock.set({
      time: '11:57:00',
      debtLedger: [{ timestamp: 1, source: 'STRIKE', seconds: 5, shift: 0 }],
    });
    rewriteOrigin();
    expect(get(clock).debtLedger).toHaveLength(0);
  });

  it('preserves clock time — only debt is erased, not time itself', () => {
    clock.set({ time: '11:57:00', debtLedger: [] });
    rewriteOrigin();
    expect(get(clock).time).toBe('11:57:00');
  });

  it('preserves ghostSignals — tier3 never touches persistence', () => {
    // Ghost signals live in IndexedDB via persistence.js.
    // rewriteOrigin() does not import or call persistence.
    // Verify no persistence clearing function was invoked.
    rewriteOrigin();
    expect(loadGhostSignals).not.toHaveBeenCalled();
  });

  it('executes without a guard — no throw for any state', () => {
    // Locked terminal, weird state — rewriteOrigin ignores all guards
    _resetLockForTesting();
    currentShift.set(TOTAL_SHIFTS - 1);
    awareness.set(AWARENESS_MAX);
    transcend(); // locks terminal
    expect(() => rewriteOrigin()).not.toThrow();
  });
});

// ── obliterateMemoir() ────────────────────────────────────────────────────────

describe('obliterateMemoir()', () => {
  it('removes debtLedger entries from the current Shift only', () => {
    clock.set({
      time: '11:57:00',
      debtLedger: [
        { timestamp: 1000, source: 'A', seconds: 5, shift: 0 },
        { timestamp: 2000, source: 'B', seconds: 3, shift: 1 },
        { timestamp: 3000, source: 'C', seconds: 2, shift: 0 },
      ],
    });
    currentShift.set(0);
    obliterateMemoir();
    const { debtLedger } = get(clock);
    expect(debtLedger).toHaveLength(1);
    expect(debtLedger[0].shift).toBe(1);
  });

  it('does not restore clock time', () => {
    clock.set({ time: '11:57:30', debtLedger: [] });
    obliterateMemoir();
    expect(get(clock).time).toBe('11:57:30');
  });

  it('leaves entries from other shifts intact', () => {
    clock.set({
      time: '11:55:00',
      debtLedger: [
        { timestamp: 1, source: 'X', seconds: 10, shift: 2 },
        { timestamp: 2, source: 'Y', seconds: 5,  shift: 3 },
      ],
    });
    currentShift.set(1); // neither shift 2 nor shift 3
    obliterateMemoir();
    expect(get(clock).debtLedger).toHaveLength(2);
  });

  it('increments nature.martyr by 5', () => {
    obliterateMemoir();
    expect(get(nature).martyr).toBe(5);
  });

  it('reduces coherence by 20', () => {
    coherence.set(100);
    obliterateMemoir();
    expect(get(coherence)).toBe(80);
  });

  it('clamps coherence to 0 when already low', () => {
    coherence.set(10);
    obliterateMemoir();
    expect(get(coherence)).toBe(0);
  });

  it('triggers no doctrinal fragment', () => {
    obliterateMemoir();
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('result doctrinalTriggered is null', () => {
    expect(obliterateMemoir().doctrinalTriggered).toBeNull();
  });

  it('costs no bandwidth', () => {
    obliterateMemoir();
    expect(get(bandwidth).spent).toBe(0);
  });
});

// ── Terminal lock enforcement ─────────────────────────────────────────────────

describe('terminal lock — after transcend()', () => {
  beforeEach(() => {
    currentShift.set(TOTAL_SHIFTS - 1);
    awareness.set(AWARENESS_MAX);
    transcend();
  });

  it('isTerminalLocked() returns true', () => {
    expect(isTerminalLocked()).toBe(true);
  });

  it('obliterateMemoir() throws TERMINAL_LOCKED', () => {
    expect(() => obliterateMemoir()).toThrow('TERMINAL_LOCKED');
  });

  it('rewriteOrigin() executes despite lock — it has no guard', () => {
    expect(() => rewriteOrigin()).not.toThrow();
  });

  it('resetTerminalLock() clears the lock for a new run', () => {
    expect(isTerminalLocked()).toBe(true);
    resetTerminalLock();
    expect(isTerminalLocked()).toBe(false);
  });
});
