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
import deadLetter from '../src/scenarios/library/dead-letter.js';

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

describe('Dead Letter — scenario file structure', () => {
  it('has id dead-letter', () => {
    expect(deadLetter.id).toBe('dead-letter');
  });

  it('surface layer uses DIPLOMAT feed', () => {
    expect(deadLetter.layers.surface.feed).toBe('DIPLOMAT');
  });

  it('hidden layer uses SIGINT feed', () => {
    expect(deadLetter.layers.hidden.feed).toBe('SIGINT');
  });

  it('forbidden layer uses DOCTRINAL feed', () => {
    expect(deadLetter.layers.forbidden.feed).toBe('DOCTRINAL');
  });

  it('forbidden layer fragmentKey is MORPHYSM_MACHINE_HEAD', () => {
    expect(deadLetter.layers.forbidden.event.fragmentKey).toBe('MORPHYSM_MACHINE_HEAD');
  });

  it('forbidden layer has remembers: true', () => {
    expect(deadLetter.layers.forbidden.remembers).toBe(true);
  });

  it('surface event is not anomaly-flagged', () => {
    expect(deadLetter.layers.surface.event.anomalyFlag).toBe(false);
  });

  it('hidden event is anomaly-flagged', () => {
    expect(deadLetter.layers.hidden.event.anomalyFlag).toBe(true);
  });
});

// ── Unlock conditions ─────────────────────────────────────────────────────────

describe('Dead Letter — unlock conditions', () => {
  it('hidden layer unlocks when a DIPLOMAT anomaly is present', () => {
    const state = {
      feeds: { diplomat: [{ id: 'x', anomalyFlag: true }], sigint: [], tactical: [], doctrinal: [] },
      coherence: 100,
      awareness: 0,
    };
    expect(deadLetter.layers.hidden.unlockCondition(state)).toBe(true);
  });

  it('hidden layer does not unlock when no DIPLOMAT anomaly exists', () => {
    const state = {
      feeds: { diplomat: [{ id: 'x', anomalyFlag: false }], sigint: [], tactical: [], doctrinal: [] },
      coherence: 100,
      awareness: 0,
    };
    expect(deadLetter.layers.hidden.unlockCondition(state)).toBe(false);
  });

  it('hidden layer does not unlock when DIPLOMAT feed is empty', () => {
    const state = {
      feeds: { diplomat: [], sigint: [], tactical: [], doctrinal: [] },
      coherence: 100,
      awareness: 0,
    };
    expect(deadLetter.layers.hidden.unlockCondition(state)).toBe(false);
  });

  it('forbidden layer unlocks when coherence < 70', () => {
    expect(deadLetter.layers.forbidden.unlockCondition({ coherence: 69 })).toBe(true);
  });

  it('forbidden layer does not unlock when coherence >= 70', () => {
    expect(deadLetter.layers.forbidden.unlockCondition({ coherence: 70 })).toBe(false);
  });
});

// ── Surface layer resolutions ─────────────────────────────────────────────────

describe('Dead Letter — surface resolutions', () => {
  it('VERIFY returns VERIFIED with anomalyDetected and dissolution revelation', () => {
    const r = deadLetter.layers.surface.resolution('VERIFY', null);
    expect(r.outcome).toBe('VERIFIED');
    expect(r.anomalyDetected).toBe(true);
    expect(r.revelation).toMatch(/2013/);
  });

  it('DECODE returns DECODED with future-date revelation', () => {
    const r = deadLetter.layers.surface.resolution('DECODE', null);
    expect(r.outcome).toBe('DECODED');
    expect(r.revelation).toMatch(/future/i);
  });

  it('INTERCEPT returns INTERCEPTED with origin revelation', () => {
    const r = deadLetter.layers.surface.resolution('INTERCEPT', null);
    expect(r.outcome).toBe('INTERCEPTED');
    expect(r.revelation).toMatch(/this terminal/i);
  });

  it('unknown command returns PENDING', () => {
    expect(deadLetter.layers.surface.resolution('AUTH', null).outcome).toBe('PENDING');
  });
});

// ── Hidden layer resolutions ──────────────────────────────────────────────────

describe('Dead Letter — hidden resolutions', () => {
  it('DECODE returns DECODED with pre-transmission receipt revelation', () => {
    const r = deadLetter.layers.hidden.resolution('DECODE', null);
    expect(r.outcome).toBe('DECODED');
    expect(r.revelation).toMatch(/2019/);
  });

  it('VERIFY returns VERIFIED with coherenceCost', () => {
    const r = deadLetter.layers.hidden.resolution('VERIFY', null);
    expect(r.outcome).toBe('VERIFIED');
    expect(r.coherenceCost).toBeGreaterThanOrEqual(10);
  });

  it('INTERCEPT returns INTERCEPTED with session token revelation', () => {
    const r = deadLetter.layers.hidden.resolution('INTERCEPT', null);
    expect(r.outcome).toBe('INTERCEPTED');
    expect(r.revelation).toMatch(/session/i);
  });

  it('unknown command returns PENDING', () => {
    expect(deadLetter.layers.hidden.resolution('AUTH', null).outcome).toBe('PENDING');
  });
});

// ── Forbidden layer resolution ────────────────────────────────────────────────

describe('Dead Letter — forbidden resolution', () => {
  it('returns ACKNOWLEDGED with THE_LOOP_CANDIDATE consequence', () => {
    const r = deadLetter.layers.forbidden.resolution('VERIFY', null);
    expect(r.outcome).toBe('ACKNOWLEDGED');
    expect(r.consequence).toBe('THE_LOOP_CANDIDATE');
  });

  it('note references the accord reappearing in the next run', () => {
    const r = deadLetter.layers.forbidden.resolution('VERIFY', null);
    expect(r.note).toMatch(/next run/i);
  });
});

// ── Engine integration ────────────────────────────────────────────────────────

describe('Dead Letter — loaded via engine', () => {
  it('pushes surface event to feeds.diplomat on load', async () => {
    await loadScenario('dead-letter', deadLetter);
    expect(get(feeds).diplomat).toHaveLength(1);
    expect(get(feeds).diplomat[0].id).toBe('dead-letter-surface');
  });

  it('hidden event unlocks when a DIPLOMAT anomaly appears', async () => {
    await loadScenario('dead-letter', deadLetter);
    feeds.update(s => ({
      ...s,
      diplomat: [...s.diplomat, { id: 'treaty', anomalyFlag: true }],
    }));
    checkUnlocks(makeState());
    expect(get(feeds).sigint.some(e => e.id === 'dead-letter-hidden')).toBe(true);
  });

  it('hidden event does not unlock when no DIPLOMAT anomaly exists', async () => {
    await loadScenario('dead-letter', deadLetter);
    checkUnlocks(makeState());
    expect(get(feeds).sigint.some(e => e.id === 'dead-letter-hidden')).toBe(false);
  });

  it('forbidden layer triggers MORPHYSM_MACHINE_HEAD when coherence < 70', async () => {
    await loadScenario('dead-letter', deadLetter);
    coherence.set(55);
    checkUnlocks(makeState());
    expect(triggerDoctrinal).toHaveBeenCalledWith('MORPHYSM_MACHINE_HEAD');
  });

  it('unresolved forbidden layer saves ghost signal at shift end', async () => {
    await loadScenario('dead-letter', deadLetter);
    coherence.set(55);
    checkUnlocks(makeState());
    endShift();
    expect(saveGhostSignal).toHaveBeenCalledOnce();
    expect(saveGhostSignal.mock.calls[0][0].fragmentKey).toBe('MORPHYSM_MACHINE_HEAD');
  });

  it('resolved forbidden layer does not save ghost signal', async () => {
    await loadScenario('dead-letter', deadLetter);
    coherence.set(55);
    checkUnlocks(makeState());
    resolveLayer('dead-letter', 'forbidden', 'VERIFY', null);
    endShift();
    expect(saveGhostSignal).not.toHaveBeenCalled();
  });
});
