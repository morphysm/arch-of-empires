import { vi, describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { terminalState, nature, anomalies, feeds, clock } from '../src/core/store.js';

vi.mock('../src/feeds/doctrinal.js', () => ({ triggerDoctrinal: vi.fn() }));

import { triggerDoctrinal } from '../src/feeds/doctrinal.js';
import { checkEndgameConditions, resolveTerminalState } from '../src/endgame/terminalStates.js';

function resetStores() {
  terminalState.set(null);
  nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
  anomalies.set({ aspects: [], manifestations: [] });
  feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
  clock.set({ time: '11:54:00', debtLedger: [] });
}

function seedPretenderFragment() {
  feeds.update(f => ({
    ...f,
    sigint: [...f.sigint, {
      id: 'gita-pretender-seed',
      fragmentKey: 'GITA_PRETENDER',
      tradition: 'GITA',
      isDoctrinal: true,
      content: 'One who restrains the senses...',
      timestamp: '11:54:00',
      shift: 0,
      anomalyFlag: true,
    }],
  }));
}

function seedManifestation(acknowledged = false) {
  anomalies.update(s => ({
    ...s,
    manifestations: [...s.manifestations, {
      id: `m-${Date.now()}-${Math.random()}`,
      aspectId: 'THE_MIMIC',
      timestamp: Date.now(),
      acknowledged,
      ignored: false,
    }],
  }));
}

beforeEach(() => {
  resetStores();
  vi.clearAllMocks();
});

// ── resolveTerminalState() — null / unknown ────────────────────────────────

describe('resolveTerminalState() — null and unrecognized', () => {
  const zeroNature = { system: 0, prophet: 0, antichrist: 0, martyr: 0 };

  it('returns null for null state', () => {
    expect(resolveTerminalState(null, zeroNature)).toBeNull();
  });

  it('returns null for unrecognized state string', () => {
    expect(resolveTerminalState('VOID', zeroNature)).toBeNull();
  });
});

// ── resolveTerminalState() — MIDNIGHT variants ─────────────────────────────

describe('resolveTerminalState() — MIDNIGHT', () => {
  it('system dominant → NUCLEAR variant', () => {
    const result = resolveTerminalState('MIDNIGHT', { system: 5, prophet: 1, antichrist: 2, martyr: 0 });
    expect(result.state).toBe('MIDNIGHT');
    expect(result.variant).toBe('NUCLEAR');
    expect(result.heading).toBe('MIDNIGHT');
    expect(result.body).toBeInstanceOf(Array);
    expect(result.body.length).toBeGreaterThan(0);
  });

  it('antichrist dominant → SILENT variant', () => {
    const result = resolveTerminalState('MIDNIGHT', { system: 2, prophet: 1, antichrist: 8, martyr: 0 });
    expect(result.variant).toBe('SILENT');
  });

  it('prophet dominant → HOLY variant', () => {
    const result = resolveTerminalState('MIDNIGHT', { system: 1, prophet: 6, antichrist: 2, martyr: 0 });
    expect(result.variant).toBe('HOLY');
  });

  it('martyr dominant → HOLY variant', () => {
    const result = resolveTerminalState('MIDNIGHT', { system: 0, prophet: 2, antichrist: 1, martyr: 7 });
    expect(result.variant).toBe('HOLY');
  });

  it('all zeros → NUCLEAR (system wins ties)', () => {
    const result = resolveTerminalState('MIDNIGHT', { system: 0, prophet: 0, antichrist: 0, martyr: 0 });
    expect(result.variant).toBe('NUCLEAR');
  });

  it('exact tie system/antichrist → NUCLEAR (system listed first)', () => {
    const result = resolveTerminalState('MIDNIGHT', { system: 5, prophet: 0, antichrist: 5, martyr: 0 });
    expect(result.variant).toBe('NUCLEAR');
  });

  it('NUCLEAR body references the running terminal', () => {
    const result = resolveTerminalState('MIDNIGHT', { system: 10, prophet: 0, antichrist: 0, martyr: 0 });
    expect(result.body.join(' ')).toMatch(/terminal/i);
  });

  it('SILENT body references the pattern', () => {
    const result = resolveTerminalState('MIDNIGHT', { system: 0, prophet: 0, antichrist: 10, martyr: 0 });
    expect(result.body.join(' ')).toMatch(/pattern/i);
  });

  it('HOLY body references prayers or witnessing', () => {
    const result = resolveTerminalState('MIDNIGHT', { system: 0, prophet: 10, antichrist: 0, martyr: 0 });
    const joined = result.body.join(' ').toLowerCase();
    expect(joined.includes('prayer') || joined.includes('witness')).toBe(true);
  });
});

// ── resolveTerminalState() — non-MIDNIGHT states ───────────────────────────

describe('resolveTerminalState() — TRANSCENDENCE', () => {
  it('returns state and null variant', () => {
    const result = resolveTerminalState('TRANSCENDENCE', { system: 0, prophet: 0, antichrist: 0, martyr: 0 });
    expect(result.state).toBe('TRANSCENDENCE');
    expect(result.variant).toBeNull();
    expect(result.heading).toBe('TRANSCENDENCE');
  });

  it('body is non-empty', () => {
    const result = resolveTerminalState('TRANSCENDENCE', { system: 0, prophet: 0, antichrist: 0, martyr: 0 });
    expect(result.body.length).toBeGreaterThan(0);
  });
});

describe('resolveTerminalState() — ASSIMILATION', () => {
  it('returns correct heading', () => {
    const result = resolveTerminalState('ASSIMILATION', { system: 5, prophet: 0, antichrist: 0, martyr: 0 });
    expect(result.heading).toBe('ASSIMILATION');
    expect(result.variant).toBeNull();
  });

  it('body references advisory AI', () => {
    const result = resolveTerminalState('ASSIMILATION', { system: 5, prophet: 0, antichrist: 0, martyr: 0 });
    expect(result.body.join(' ')).toMatch(/advisory AI/i);
  });
});

describe('resolveTerminalState() — THE_LOOP', () => {
  it('body contains exactly one line', () => {
    const result = resolveTerminalState('THE_LOOP', { system: 0, prophet: 0, antichrist: 0, martyr: 0 });
    expect(result.body).toHaveLength(1);
  });

  it('body line is EARTH DOES NOT ASCEND', () => {
    const result = resolveTerminalState('THE_LOOP', { system: 0, prophet: 0, antichrist: 0, martyr: 0 });
    expect(result.body[0]).toBe('EARTH DOES NOT ASCEND.');
  });
});

describe('resolveTerminalState() — THE_GREAT_RESET', () => {
  it('returns correct heading', () => {
    const result = resolveTerminalState('THE_GREAT_RESET', { system: 0, prophet: 0, antichrist: 0, martyr: 5 });
    expect(result.heading).toBe('THE GREAT RESET');
    expect(result.variant).toBeNull();
  });

  it('body references clock frozen at 11:59:59', () => {
    const result = resolveTerminalState('THE_GREAT_RESET', { system: 0, prophet: 0, antichrist: 0, martyr: 5 });
    expect(result.body.join(' ')).toMatch(/11:59:59/);
  });
});

// ── checkEndgameConditions() — no-op cases ────────────────────────────────

describe('checkEndgameConditions() — early returns', () => {
  it('returns null when terminalState is already set', () => {
    terminalState.set('MIDNIGHT');
    expect(checkEndgameConditions()).toBeNull();
  });

  it('returns null when all nature scores are zero', () => {
    expect(checkEndgameConditions()).toBeNull();
  });

  it('does not call triggerDoctrinal when no condition is met', () => {
    checkEndgameConditions();
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });
});

// ── checkEndgameConditions() — ASSIMILATION ───────────────────────────────

describe('checkEndgameConditions() — ASSIMILATION', () => {
  beforeEach(() => {
    nature.set({ system: 5, prophet: 0, antichrist: 0, martyr: 0 });
  });

  it('returns ASSIMILATION when system dominant and no acknowledged anomalies', () => {
    expect(checkEndgameConditions()).toBe('ASSIMILATION');
  });

  it('sets terminalState store to ASSIMILATION', () => {
    checkEndgameConditions();
    expect(get(terminalState)).toBe('ASSIMILATION');
  });

  it('triggers MORPHYSM_HOMO_MACHINA', () => {
    checkEndgameConditions();
    expect(triggerDoctrinal).toHaveBeenCalledWith('MORPHYSM_HOMO_MACHINA');
  });

  it('returns null when system is zero even if technically dominant', () => {
    nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
    expect(checkEndgameConditions()).toBeNull();
  });

  it('returns null when an anomaly is acknowledged', () => {
    seedManifestation(true);
    expect(checkEndgameConditions()).toBeNull();
  });

  it('succeeds when unacknowledged (not ignored) manifestations exist', () => {
    seedManifestation(false);
    expect(checkEndgameConditions()).toBe('ASSIMILATION');
  });

  it('returns null when system is not dominant', () => {
    nature.set({ system: 5, prophet: 10, antichrist: 0, martyr: 0 });
    expect(checkEndgameConditions()).toBeNull();
  });

  it('is idempotent — second call after state set returns null', () => {
    checkEndgameConditions();
    vi.clearAllMocks();
    expect(checkEndgameConditions()).toBeNull();
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('does not trigger when system tied with another score — system still wins tie', () => {
    // system ties with antichrist — system is still dominant (first in array)
    nature.set({ system: 5, prophet: 0, antichrist: 5, martyr: 0 });
    expect(checkEndgameConditions()).toBe('ASSIMILATION');
  });
});

// ── checkEndgameConditions() — THE_GREAT_RESET ───────────────────────────

describe('checkEndgameConditions() — THE_GREAT_RESET', () => {
  beforeEach(() => {
    nature.set({ system: 1, prophet: 1, antichrist: 1, martyr: 5 });
    seedPretenderFragment();
  });

  it('returns THE_GREAT_RESET when martyr dominant and GITA_PRETENDER in feeds', () => {
    expect(checkEndgameConditions()).toBe('THE_GREAT_RESET');
  });

  it('sets terminalState store to THE_GREAT_RESET', () => {
    checkEndgameConditions();
    expect(get(terminalState)).toBe('THE_GREAT_RESET');
  });

  it('freezes clock at 11:59:59', () => {
    checkEndgameConditions();
    expect(get(clock).time).toBe('11:59:59');
  });

  it('preserves clock debtLedger when freezing', () => {
    clock.set({ time: '11:54:00', debtLedger: [{ timestamp: 1, source: 'X', seconds: 5, shift: 0 }] });
    nature.set({ system: 1, prophet: 1, antichrist: 1, martyr: 5 });
    checkEndgameConditions();
    expect(get(clock).debtLedger).toHaveLength(1);
  });

  it('triggers GITA_LOTUS_LEAF', () => {
    checkEndgameConditions();
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_LOTUS_LEAF');
  });

  it('returns null when martyr is zero', () => {
    nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
    expect(checkEndgameConditions()).toBeNull();
  });

  it('returns null when martyr is not dominant', () => {
    // system is dominant — but block ASSIMILATION by having an acknowledged anomaly,
    // so we can isolate the GREAT_RESET rejection
    nature.set({ system: 10, prophet: 1, antichrist: 1, martyr: 5 });
    seedManifestation(true); // acknowledged → ASSIMILATION blocked
    expect(checkEndgameConditions()).toBeNull();
  });

  it('returns null when GITA_PRETENDER is absent from all feeds', () => {
    feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
    expect(checkEndgameConditions()).toBeNull();
  });

  it('finds GITA_PRETENDER in diplomat feed', () => {
    feeds.update(f => ({
      ...f,
      sigint: [],
      diplomat: [{
        id: 'gita-d',
        fragmentKey: 'GITA_PRETENDER',
        tradition: 'GITA',
        isDoctrinal: true,
        content: 'One who restrains...',
        timestamp: '11:54:00',
        shift: 0,
        anomalyFlag: true,
      }],
    }));
    expect(checkEndgameConditions()).toBe('THE_GREAT_RESET');
  });

  it('finds GITA_PRETENDER in tactical feed', () => {
    feeds.update(f => ({
      ...f,
      sigint: [],
      tactical: [{
        id: 'gita-t',
        fragmentKey: 'GITA_PRETENDER',
        tradition: 'GITA',
        isDoctrinal: true,
        content: 'One who restrains...',
        timestamp: '11:54:00',
        shift: 0,
        anomalyFlag: true,
      }],
    }));
    expect(checkEndgameConditions()).toBe('THE_GREAT_RESET');
  });

  it('is idempotent — second call after state set returns null', () => {
    checkEndgameConditions();
    vi.clearAllMocks();
    expect(checkEndgameConditions()).toBeNull();
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });
});

// ── checkEndgameConditions() — ASSIMILATION vs THE_GREAT_RESET ordering ──

describe('checkEndgameConditions() — condition priority', () => {
  it('ASSIMILATION fires when system dominant, even if GITA_PRETENDER present', () => {
    // system dominant + pretender in feeds → ASSIMILATION wins (checked first)
    nature.set({ system: 10, prophet: 0, antichrist: 0, martyr: 5 });
    seedPretenderFragment();
    expect(checkEndgameConditions()).toBe('ASSIMILATION');
  });
});
