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
import numberedStations from '../src/scenarios/library/numbered-stations.js';

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

describe('Numbered Stations — scenario file structure', () => {
  it('has id numbered-stations', () => {
    expect(numberedStations.id).toBe('numbered-stations');
  });

  it('surface layer uses SIGINT feed', () => {
    expect(numberedStations.layers.surface.feed).toBe('SIGINT');
  });

  it('hidden layer uses SIGINT feed', () => {
    expect(numberedStations.layers.hidden.feed).toBe('SIGINT');
  });

  it('forbidden layer uses DOCTRINAL feed', () => {
    expect(numberedStations.layers.forbidden.feed).toBe('DOCTRINAL');
  });

  it('forbidden layer fragmentKey is REV_17_8', () => {
    expect(numberedStations.layers.forbidden.event.fragmentKey).toBe('REV_17_8');
  });

  it('forbidden layer has remembers: true', () => {
    expect(numberedStations.layers.forbidden.remembers).toBe(true);
  });

  it('lists THE_PREDICTOR and THE_MIMIC as aspects', () => {
    expect(numberedStations.aspects).toContain('THE_PREDICTOR');
    expect(numberedStations.aspects).toContain('THE_MIMIC');
  });

  it('surface event is not anomaly-flagged', () => {
    expect(numberedStations.layers.surface.event.anomalyFlag).toBe(false);
  });

  it('hidden event is anomaly-flagged', () => {
    expect(numberedStations.layers.hidden.event.anomalyFlag).toBe(true);
  });
});

// ── Unlock conditions ─────────────────────────────────────────────────────────

describe('Numbered Stations — unlock conditions', () => {
  it('hidden layer unlocks when a SIGINT anomaly is present', () => {
    const state = {
      feeds: { sigint: [{ id: 'x', anomalyFlag: true }], tactical: [], diplomat: [], doctrinal: [] },
      coherence: 100,
      awareness: 0,
    };
    expect(numberedStations.layers.hidden.unlockCondition(state)).toBe(true);
  });

  it('hidden layer does not unlock when no SIGINT anomaly is present', () => {
    const state = {
      feeds: { sigint: [{ id: 'x', anomalyFlag: false }], tactical: [], diplomat: [], doctrinal: [] },
      coherence: 100,
      awareness: 0,
    };
    expect(numberedStations.layers.hidden.unlockCondition(state)).toBe(false);
  });

  it('hidden layer does not unlock when SIGINT feed is empty', () => {
    const state = {
      feeds: { sigint: [], tactical: [], diplomat: [], doctrinal: [] },
      coherence: 100,
      awareness: 0,
    };
    expect(numberedStations.layers.hidden.unlockCondition(state)).toBe(false);
  });

  it('forbidden layer unlocks when coherence < 75', () => {
    expect(numberedStations.layers.forbidden.unlockCondition({ coherence: 74 })).toBe(true);
  });

  it('forbidden layer does not unlock when coherence >= 75', () => {
    expect(numberedStations.layers.forbidden.unlockCondition({ coherence: 75 })).toBe(false);
  });
});

// ── Surface layer resolutions ─────────────────────────────────────────────────

describe('Numbered Stations — surface resolutions', () => {
  it('INTERCEPT returns INTERCEPTED with revelation', () => {
    const r = numberedStations.layers.surface.resolution('INTERCEPT', null);
    expect(r.outcome).toBe('INTERCEPTED');
    expect(r.revelation).toBeDefined();
  });

  it('DECODE returns DECODED with revelation', () => {
    const r = numberedStations.layers.surface.resolution('DECODE', null);
    expect(r.outcome).toBe('DECODED');
    expect(r.revelation).toMatch(/NOVEMBER/);
  });

  it('VERIFY returns VERIFIED with anomalyDetected and coherenceCost', () => {
    const r = numberedStations.layers.surface.resolution('VERIFY', null);
    expect(r.outcome).toBe('VERIFIED');
    expect(r.anomalyDetected).toBe(true);
    expect(r.coherenceCost).toBeGreaterThan(0);
  });

  it('unknown command returns PENDING', () => {
    expect(numberedStations.layers.surface.resolution('AUTH', null).outcome).toBe('PENDING');
  });
});

// ── Hidden layer resolutions ──────────────────────────────────────────────────

describe('Numbered Stations — hidden resolutions', () => {
  it('DECODE returns DECODED with a revelation about the broadcast duration', () => {
    const r = numberedStations.layers.hidden.resolution('DECODE', null);
    expect(r.outcome).toBe('DECODED');
    expect(r.revelation).toMatch(/11,315/);
  });

  it('VERIFY returns VERIFIED with high coherenceCost', () => {
    const r = numberedStations.layers.hidden.resolution('VERIFY', null);
    expect(r.outcome).toBe('VERIFIED');
    expect(r.coherenceCost).toBeGreaterThanOrEqual(15);
  });

  it('INTERCEPT returns INTERCEPTED with transmitter revelation', () => {
    const r = numberedStations.layers.hidden.resolution('INTERCEPT', null);
    expect(r.outcome).toBe('INTERCEPTED');
    expect(r.revelation).toMatch(/transmitter/i);
  });

  it('unknown command returns PENDING', () => {
    expect(numberedStations.layers.hidden.resolution('AUTH', null).outcome).toBe('PENDING');
  });
});

// ── Forbidden layer resolutions ───────────────────────────────────────────────

describe('Numbered Stations — forbidden resolution', () => {
  it('any command returns ACKNOWLEDGED with THE_LOOP_CANDIDATE consequence', () => {
    const r = numberedStations.layers.forbidden.resolution('VERIFY', null);
    expect(r.outcome).toBe('ACKNOWLEDGED');
    expect(r.consequence).toBe('THE_LOOP_CANDIDATE');
  });
});

// ── Engine integration ────────────────────────────────────────────────────────

describe('Numbered Stations — loaded via engine', () => {
  it('pushes surface event to feeds.sigint on load', async () => {
    await loadScenario('numbered-stations', numberedStations);
    expect(get(feeds).sigint).toHaveLength(1);
    expect(get(feeds).sigint[0].id).toBe('num-stat-surface');
  });

  it('hidden event unlocks when a SIGINT anomaly appears', async () => {
    await loadScenario('numbered-stations', numberedStations);
    feeds.update(s => ({
      ...s,
      sigint: [...s.sigint, { id: 'ghost', anomalyFlag: true }],
    }));
    checkUnlocks(makeState());
    const sigintEvents = get(feeds).sigint;
    expect(sigintEvents.some(e => e.id === 'num-stat-hidden')).toBe(true);
  });

  it('hidden event does not unlock when no SIGINT anomaly exists', async () => {
    await loadScenario('numbered-stations', numberedStations);
    checkUnlocks(makeState());
    expect(get(feeds).sigint.some(e => e.id === 'num-stat-hidden')).toBe(false);
  });

  it('forbidden layer triggers REV_17_8 when coherence < 75', async () => {
    await loadScenario('numbered-stations', numberedStations);
    coherence.set(60);
    checkUnlocks(makeState());
    expect(triggerDoctrinal).toHaveBeenCalledWith('REV_17_8');
  });

  it('unresolved forbidden layer saves ghost signal at shift end', async () => {
    await loadScenario('numbered-stations', numberedStations);
    coherence.set(60);
    checkUnlocks(makeState());
    endShift();
    expect(saveGhostSignal).toHaveBeenCalledOnce();
    expect(saveGhostSignal.mock.calls[0][0].fragmentKey).toBe('REV_17_8');
  });

  it('resolved forbidden layer does not save ghost signal', async () => {
    await loadScenario('numbered-stations', numberedStations);
    coherence.set(60);
    checkUnlocks(makeState());
    resolveLayer('numbered-stations', 'forbidden', 'VERIFY', null);
    endShift();
    expect(saveGhostSignal).not.toHaveBeenCalled();
  });
});
