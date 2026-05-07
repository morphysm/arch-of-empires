import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { feeds, clock, currentShift, awareness, coherence, anomalies } from '../src/core/store.js';

vi.mock('../src/feeds/doctrinal.js',  () => ({ triggerDoctrinal: vi.fn() }));
vi.mock('../src/core/persistence.js', () => ({
  saveGhostSignal:  vi.fn(),
  saveClock:        vi.fn(),
  loadClock:        vi.fn(),
  loadGhostSignals: vi.fn(),
  _resetDB:         vi.fn(),
}));

import { triggerDoctrinal } from '../src/feeds/doctrinal.js';
import { saveGhostSignal }  from '../src/core/persistence.js';
import {
  loadScenario,
  checkUnlocks,
  resolveLayer,
  endShift,
  _resetEngineForTesting,
} from '../src/scenarios/engine.js';
import oracleArray from '../src/scenarios/library/oracle-array.js';

function makeState(overrides = {}) {
  return {
    clock:     get(clock),
    awareness: get(awareness),
    coherence: get(coherence),
    feeds:     get(feeds),
    anomalies: get(anomalies),
    ...overrides,
  };
}

beforeEach(() => {
  feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
  clock.set({ time: '11:54:00', debtLedger: [] });
  currentShift.set(0);
  awareness.set(0);
  coherence.set(100);
  anomalies.set({ aspects: [], manifestations: [] });
  _resetEngineForTesting();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Scenario file structure ───────────────────────────────────────────────────

describe('Oracle Array — scenario file structure', () => {
  it('has id oracle-array', () => {
    expect(oracleArray.id).toBe('oracle-array');
  });

  it('surface layer uses SIGINT feed', () => {
    expect(oracleArray.layers.surface.feed).toBe('SIGINT');
  });

  it('hidden layer uses SIGINT feed', () => {
    expect(oracleArray.layers.hidden.feed).toBe('SIGINT');
  });

  it('forbidden layer uses DOCTRINAL feed', () => {
    expect(oracleArray.layers.forbidden.feed).toBe('DOCTRINAL');
  });

  it('forbidden layer fragmentKey is MORPHYSM_TULPAS', () => {
    expect(oracleArray.layers.forbidden.event.fragmentKey).toBe('MORPHYSM_TULPAS');
  });

  it('forbidden layer has remembers: true', () => {
    expect(oracleArray.layers.forbidden.remembers).toBe(true);
  });

  it('surface event is not anomaly-flagged', () => {
    expect(oracleArray.layers.surface.event.anomalyFlag).toBe(false);
  });

  it('hidden event is anomaly-flagged', () => {
    expect(oracleArray.layers.hidden.event.anomalyFlag).toBe(true);
  });
});

// ── Unlock conditions ─────────────────────────────────────────────────────────

describe('Oracle Array — unlock conditions', () => {
  it('hidden layer unlocks when a LAUNCH_DETECTED event is in tactical', () => {
    const state = {
      feeds: { tactical: [{ id: 'x', type: 'LAUNCH_DETECTED' }], sigint: [], diplomat: [], doctrinal: [] },
      coherence: 100,
      awareness: 0,
    };
    expect(oracleArray.layers.hidden.unlockCondition(state)).toBe(true);
  });

  it('hidden layer does not unlock when no LAUNCH_DETECTED event exists', () => {
    const state = {
      feeds: { tactical: [{ id: 'x', type: 'TROOP_MOVEMENT' }], sigint: [], diplomat: [], doctrinal: [] },
      coherence: 100,
      awareness: 0,
    };
    expect(oracleArray.layers.hidden.unlockCondition(state)).toBe(false);
  });

  it('hidden layer does not unlock when tactical feed is empty', () => {
    const state = {
      feeds: { tactical: [], sigint: [], diplomat: [], doctrinal: [] },
      coherence: 100,
      awareness: 0,
    };
    expect(oracleArray.layers.hidden.unlockCondition(state)).toBe(false);
  });

  it('forbidden layer unlocks when coherence < 85', () => {
    expect(oracleArray.layers.forbidden.unlockCondition({ coherence: 84 })).toBe(true);
  });

  it('forbidden layer does not unlock when coherence >= 85', () => {
    expect(oracleArray.layers.forbidden.unlockCondition({ coherence: 85 })).toBe(false);
  });
});

// ── Surface layer resolutions ─────────────────────────────────────────────────

describe('Oracle Array — surface resolutions', () => {
  it('VERIFY returns VERIFIED with anomalyDetected and passive-receiver revelation', () => {
    const r = oracleArray.layers.surface.resolution('VERIFY', null);
    expect(r.outcome).toBe('VERIFIED');
    expect(r.anomalyDetected).toBe(true);
    expect(r.revelation).toMatch(/passive/i);
  });

  it('DECODE returns DECODED with pre-session timestamp revelation', () => {
    const r = oracleArray.layers.surface.resolution('DECODE', null);
    expect(r.outcome).toBe('DECODED');
    expect(r.revelation).toMatch(/06:14/);
  });

  it('INTERCEPT returns INTERCEPTED with same-node revelation', () => {
    const r = oracleArray.layers.surface.resolution('INTERCEPT', null);
    expect(r.outcome).toBe('INTERCEPTED');
    expect(r.revelation).toMatch(/same node/i);
  });

  it('unknown command returns PENDING', () => {
    expect(oracleArray.layers.surface.resolution('AUTH', null).outcome).toBe('PENDING');
  });
});

// ── Hidden layer resolutions ──────────────────────────────────────────────────

describe('Oracle Array — hidden resolutions', () => {
  it('DECODE returns DECODED with 19-year revelation', () => {
    const r = oracleArray.layers.hidden.resolution('DECODE', null);
    expect(r.outcome).toBe('DECODED');
    expect(r.revelation).toMatch(/19 years/i);
  });

  it('VERIFY returns VERIFIED with coherenceCost', () => {
    const r = oracleArray.layers.hidden.resolution('VERIFY', null);
    expect(r.outcome).toBe('VERIFIED');
    expect(r.coherenceCost).toBeGreaterThan(0);
  });

  it('INTERCEPT returns INTERCEPTED with future-event revelation', () => {
    const r = oracleArray.layers.hidden.resolution('INTERCEPT', null);
    expect(r.outcome).toBe('INTERCEPTED');
    expect(r.revelation).toMatch(/14:22/);
  });

  it('unknown command returns PENDING', () => {
    expect(oracleArray.layers.hidden.resolution('AUTH', null).outcome).toBe('PENDING');
  });
});

// ── Forbidden layer resolution ────────────────────────────────────────────────

describe('Oracle Array — forbidden resolution', () => {
  it('returns ACKNOWLEDGED with THE_LOOP_CANDIDATE consequence', () => {
    const r = oracleArray.layers.forbidden.resolution('VERIFY', null);
    expect(r.outcome).toBe('ACKNOWLEDGED');
    expect(r.consequence).toBe('THE_LOOP_CANDIDATE');
  });

  it('note references the next run intercept', () => {
    const r = oracleArray.layers.forbidden.resolution('VERIFY', null);
    expect(r.note).toMatch(/next run/i);
  });
});

// ── Engine integration ────────────────────────────────────────────────────────

describe('Oracle Array — loaded via engine', () => {
  it('pushes surface event to feeds.sigint on load', async () => {
    await loadScenario('oracle-array', oracleArray);
    expect(get(feeds).sigint).toHaveLength(1);
    expect(get(feeds).sigint[0].id).toBe('oracle-surface');
  });

  it('hidden event unlocks when LAUNCH_DETECTED appears in tactical', async () => {
    await loadScenario('oracle-array', oracleArray);
    feeds.update(s => ({
      ...s,
      tactical: [...s.tactical, { id: 'launch', type: 'LAUNCH_DETECTED' }],
    }));
    checkUnlocks(makeState());
    expect(get(feeds).sigint.some(e => e.id === 'oracle-hidden')).toBe(true);
  });

  it('hidden event does not unlock without LAUNCH_DETECTED in tactical', async () => {
    await loadScenario('oracle-array', oracleArray);
    checkUnlocks(makeState());
    expect(get(feeds).sigint.some(e => e.id === 'oracle-hidden')).toBe(false);
  });

  it('forbidden layer triggers MORPHYSM_TULPAS when coherence < 85', async () => {
    await loadScenario('oracle-array', oracleArray);
    coherence.set(80);
    checkUnlocks(makeState());
    expect(triggerDoctrinal).toHaveBeenCalledWith('MORPHYSM_TULPAS');
  });

  it('unresolved forbidden layer saves ghost signal at shift end', async () => {
    await loadScenario('oracle-array', oracleArray);
    coherence.set(80);
    checkUnlocks(makeState());
    endShift();
    expect(saveGhostSignal).toHaveBeenCalledOnce();
    expect(saveGhostSignal.mock.calls[0][0].fragmentKey).toBe('MORPHYSM_TULPAS');
  });

  it('resolved forbidden layer does not save ghost signal', async () => {
    await loadScenario('oracle-array', oracleArray);
    coherence.set(80);
    checkUnlocks(makeState());
    resolveLayer('oracle-array', 'forbidden', 'VERIFY', null);
    endShift();
    expect(saveGhostSignal).not.toHaveBeenCalled();
  });
});
