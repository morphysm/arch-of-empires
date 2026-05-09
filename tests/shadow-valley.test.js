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
import shadowValley from '../src/scenarios/library/shadow-valley.js';

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

describe('Shadow Valley — scenario file structure', () => {
  it('has id shadow-valley', () => {
    expect(shadowValley.id).toBe('shadow-valley');
  });

  it('surface layer uses SIGINT feed', () => {
    expect(shadowValley.layers.surface.feed).toBe('SIGINT');
  });

  it('hidden layer uses SIGINT feed', () => {
    expect(shadowValley.layers.hidden.feed).toBe('SIGINT');
  });

  it('forbidden layer uses DOCTRINAL feed', () => {
    expect(shadowValley.layers.forbidden.feed).toBe('DOCTRINAL');
  });

  it('forbidden layer fragmentKey is GITA_DUTY_WITHOUT_ATTACHMENT', () => {
    expect(shadowValley.layers.forbidden.event.fragmentKey).toBe('GITA_DUTY_WITHOUT_ATTACHMENT');
  });

  it('forbidden layer has remembers: true', () => {
    expect(shadowValley.layers.forbidden.remembers).toBe(true);
  });

  it('surface event is not anomaly-flagged', () => {
    expect(shadowValley.layers.surface.event.anomalyFlag).toBe(false);
  });

  it('hidden event is anomaly-flagged', () => {
    expect(shadowValley.layers.hidden.event.anomalyFlag).toBe(true);
  });

  it('surface event id is shadow-valley-surface', () => {
    expect(shadowValley.layers.surface.event.id).toBe('shadow-valley-surface');
  });

  it('hidden event id is shadow-valley-hidden', () => {
    expect(shadowValley.layers.hidden.event.id).toBe('shadow-valley-hidden');
  });

  it('surface content contains Psalm 23:4 fragments', () => {
    expect(shadowValley.layers.surface.event.content).toMatch(/valley of the shadow/);
    expect(shadowValley.layers.surface.event.content).toMatch(/fear no evil/);
  });

  it('hidden content contains the full Psalm 23:4 verse', () => {
    const c = shadowValley.layers.hidden.event.content;
    expect(c).toMatch(/thy rod and thy staff/);
    expect(c).toMatch(/MISSION: COMPLETE/);
  });
});

// ── Unlock conditions ─────────────────────────────────────────────────────────

describe('Shadow Valley — unlock conditions', () => {
  it('hidden layer unlocks when DETONATION_CONFIRMED is in tactical', () => {
    const state = {
      feeds: { tactical: [{ id: 'x', type: 'DETONATION_CONFIRMED' }], sigint: [], diplomat: [], doctrinal: [] },
      coherence: 100,
    };
    expect(shadowValley.layers.hidden.unlockCondition(state)).toBe(true);
  });

  it('hidden layer does not unlock when tactical has no DETONATION_CONFIRMED', () => {
    const state = {
      feeds: { tactical: [{ id: 'x', type: 'LAUNCH_DETECTED' }], sigint: [], diplomat: [], doctrinal: [] },
      coherence: 100,
    };
    expect(shadowValley.layers.hidden.unlockCondition(state)).toBe(false);
  });

  it('hidden layer does not unlock when tactical feed is empty', () => {
    const state = {
      feeds: { tactical: [], sigint: [], diplomat: [], doctrinal: [] },
      coherence: 100,
    };
    expect(shadowValley.layers.hidden.unlockCondition(state)).toBe(false);
  });

  it('forbidden layer unlocks when coherence < 55', () => {
    expect(shadowValley.layers.forbidden.unlockCondition({ coherence: 54 })).toBe(true);
  });

  it('forbidden layer does not unlock when coherence === 55', () => {
    expect(shadowValley.layers.forbidden.unlockCondition({ coherence: 55 })).toBe(false);
  });

  it('forbidden layer does not unlock when coherence > 55', () => {
    expect(shadowValley.layers.forbidden.unlockCondition({ coherence: 80 })).toBe(false);
  });
});

// ── Surface layer resolutions ─────────────────────────────────────────────────

describe('Shadow Valley — surface resolutions', () => {
  it('INTERCEPT returns INTERCEPTED and notes the transmission was not intended to be heard', () => {
    const r = shadowValley.layers.surface.resolution('INTERCEPT', null);
    expect(r.outcome).toBe('INTERCEPTED');
    expect(r.revelation).toMatch(/not intended/i);
  });

  it('TRIANGULATE returns TRIANGULATED and reveals hardpoints empty', () => {
    const r = shadowValley.layers.surface.resolution('TRIANGULATE', null);
    expect(r.outcome).toBe('TRIANGULATED');
    expect(r.revelation).toMatch(/hardpoints/i);
  });

  it('DECODE returns DECODED and notes crew manifest is redacted', () => {
    const r = shadowValley.layers.surface.resolution('DECODE', null);
    expect(r.outcome).toBe('DECODED');
    expect(r.revelation).toMatch(/redacted/i);
  });

  it('VERIFY returns VERIFIED with no anomaly detected', () => {
    const r = shadowValley.layers.surface.resolution('VERIFY', null);
    expect(r.outcome).toBe('VERIFIED');
    expect(r.anomalyDetected).toBe(false);
  });

  it('unknown command returns PENDING', () => {
    expect(shadowValley.layers.surface.resolution('AUTH', null).outcome).toBe('PENDING');
  });
});

// ── Hidden layer resolutions ──────────────────────────────────────────────────

describe('Shadow Valley — hidden resolutions', () => {
  it('VERIFY returns VERIFIED and notes this was the last mission', () => {
    const r = shadowValley.layers.hidden.resolution('VERIFY', null);
    expect(r.outcome).toBe('VERIFIED');
    expect(r.revelation).toMatch(/last one/i);
  });

  it('DECODE returns DECODED and reveals bomb fell before intercept captured', () => {
    const r = shadowValley.layers.hidden.resolution('DECODE', null);
    expect(r.outcome).toBe('DECODED');
    expect(r.revelation).toMatch(/already fallen/i);
  });

  it('INTERCEPT returns INTERCEPTED and notes crew did not know who gave the orders', () => {
    const r = shadowValley.layers.hidden.resolution('INTERCEPT', null);
    expect(r.outcome).toBe('INTERCEPTED');
    expect(r.revelation).toMatch(/did not know/i);
  });

  it('unknown command returns PENDING', () => {
    expect(shadowValley.layers.hidden.resolution('AUTH', null).outcome).toBe('PENDING');
  });
});

// ── Forbidden layer resolution ────────────────────────────────────────────────

describe('Shadow Valley — forbidden resolution', () => {
  it('returns ACKNOWLEDGED with COMPLICITY_LOGGED consequence', () => {
    const r = shadowValley.layers.forbidden.resolution('VERIFY', null);
    expect(r.outcome).toBe('ACKNOWLEDGED');
    expect(r.consequence).toBe('COMPLICITY_LOGGED');
  });

  it('note ties the mission authorization to this terminal seat', () => {
    const r = shadowValley.layers.forbidden.resolution('VERIFY', null);
    expect(r.note).toMatch(/session token/i);
    expect(r.note).toMatch(/this seat/i);
  });
});

// ── Engine integration ────────────────────────────────────────────────────────

describe('Shadow Valley — loaded via engine', () => {
  it('pushes surface event to feeds.sigint on load', async () => {
    await loadScenario('shadow-valley', shadowValley);
    expect(get(feeds).sigint).toHaveLength(1);
    expect(get(feeds).sigint[0].id).toBe('shadow-valley-surface');
  });

  it('hidden event unlocks when DETONATION_CONFIRMED is in tactical', async () => {
    await loadScenario('shadow-valley', shadowValley);
    feeds.update(s => ({
      ...s,
      tactical: [...s.tactical, { id: 'det', type: 'DETONATION_CONFIRMED' }],
    }));
    checkUnlocks(makeState());
    expect(get(feeds).sigint.some(e => e.id === 'shadow-valley-hidden')).toBe(true);
  });

  it('hidden event does not unlock without DETONATION_CONFIRMED', async () => {
    await loadScenario('shadow-valley', shadowValley);
    checkUnlocks(makeState());
    expect(get(feeds).sigint.some(e => e.id === 'shadow-valley-hidden')).toBe(false);
  });

  it('forbidden layer triggers GITA_DUTY_WITHOUT_ATTACHMENT when coherence < 55', async () => {
    await loadScenario('shadow-valley', shadowValley);
    coherence.set(40);
    checkUnlocks(makeState());
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_DUTY_WITHOUT_ATTACHMENT');
  });

  it('forbidden layer does not trigger when coherence >= 55', async () => {
    await loadScenario('shadow-valley', shadowValley);
    coherence.set(70);
    checkUnlocks(makeState());
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('unresolved forbidden layer saves ghost signal at shift end', async () => {
    await loadScenario('shadow-valley', shadowValley);
    coherence.set(40);
    checkUnlocks(makeState());
    endShift();
    expect(saveGhostSignal).toHaveBeenCalledOnce();
    expect(saveGhostSignal.mock.calls[0][0].fragmentKey).toBe('GITA_DUTY_WITHOUT_ATTACHMENT');
  });

  it('resolved forbidden layer does not save ghost signal', async () => {
    await loadScenario('shadow-valley', shadowValley);
    coherence.set(40);
    checkUnlocks(makeState());
    resolveLayer('shadow-valley', 'forbidden', 'VERIFY', null);
    endShift();
    expect(saveGhostSignal).not.toHaveBeenCalled();
  });
});
