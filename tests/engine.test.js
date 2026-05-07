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
import ghostSubmarine from '../src/scenarios/library/ghost-submarine.js';

// ── Inline test scenarios ─────────────────────────────────────────────────────

function makeMockScenario(overrides = {}) {
  return {
    id: 'mock-scenario',
    title: 'MOCK',
    aspects: ['THE_PREDICTOR'],
    layers: {
      surface: {
        feed: 'TACTICAL',
        event: {
          id: 'mock-surface',
          type: 'TROOP_MOVEMENT',
          origin: 'RUSSIA',
          target: 'NATO_COMPOSITE',
          content: 'Mock surface event.',
          anomalyFlag: false,
          verified: false,
        },
        resolution: (cmd, tgt) => ({ outcome: 'SURFACE_RESOLVED', cmd, tgt }),
      },
      hidden: {
        feed: 'SIGINT',
        unlockCondition: (state) => state.awareness > 5,
        event: {
          id: 'mock-hidden',
          type: 'GHOST_SIGNAL',
          source: 'UNKNOWN',
          content: 'Hidden layer revealed.',
          anomalyFlag: true,
          verified: false,
          isGhost: false,
        },
        resolution: (cmd, tgt) => ({ outcome: 'HIDDEN_RESOLVED' }),
      },
      forbidden: {
        feed: 'DOCTRINAL',
        unlockCondition: (state) => state.coherence < 50,
        event: { fragmentKey: 'GITA_SOUL_NEVER_DIES' },
        resolution: (cmd, tgt) => ({ outcome: 'FORBIDDEN_RESOLVED' }),
        remembers: true,
      },
    },
    ...overrides,
  };
}

function makeState(overrides = {}) {
  return {
    clock: get(clock),
    awareness: get(awareness),
    coherence: get(coherence),
    feeds: get(feeds),
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

// ── loadScenario() — surface layer ───────────────────────────────────────────

describe('loadScenario() — surface layer', () => {
  it('pushes the surface event to the correct feed immediately', async () => {
    await loadScenario('mock', makeMockScenario());
    expect(get(feeds).tactical).toHaveLength(1);
  });

  it('surface event has the correct id', async () => {
    await loadScenario('mock', makeMockScenario());
    expect(get(feeds).tactical[0].id).toBe('mock-surface');
  });

  it('stamps current clock time onto the surface event', async () => {
    clock.set({ time: '11:57:00', debtLedger: [] });
    await loadScenario('mock', makeMockScenario());
    expect(get(feeds).tactical[0].timestamp).toBe('11:57:00');
  });

  it('stamps current shift onto the surface event', async () => {
    currentShift.set(3);
    await loadScenario('mock', makeMockScenario());
    expect(get(feeds).tactical[0].shift).toBe(3);
  });

  it('does not push hidden or forbidden events at load time', async () => {
    await loadScenario('mock', makeMockScenario());
    expect(get(feeds).sigint).toHaveLength(0);
    expect(get(feeds).doctrinal).toHaveLength(0);
  });

  it('does not call triggerDoctrinal at load time', async () => {
    await loadScenario('mock', makeMockScenario());
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('routes DIPLOMAT surface events to feeds.diplomat', async () => {
    const scenario = makeMockScenario();
    scenario.layers.surface.feed = 'DIPLOMAT';
    await loadScenario('mock', scenario);
    expect(get(feeds).diplomat).toHaveLength(1);
    expect(get(feeds).tactical).toHaveLength(0);
  });
});

// ── checkUnlocks() — hidden layer ─────────────────────────────────────────────

describe('checkUnlocks() — hidden layer', () => {
  it('does not push hidden event when condition is not met', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ awareness: 0 }));
    expect(get(feeds).sigint).toHaveLength(0);
  });

  it('pushes hidden event to correct feed when condition is met', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ awareness: 10 })); // awareness > 5 → unlock
    expect(get(feeds).sigint).toHaveLength(1);
    expect(get(feeds).sigint[0].id).toBe('mock-hidden');
  });

  it('stamps current clock time onto hidden event', async () => {
    clock.set({ time: '11:56:00', debtLedger: [] });
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ awareness: 10 }));
    expect(get(feeds).sigint[0].timestamp).toBe('11:56:00');
  });

  it('does not push hidden event twice if checkUnlocks is called again', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ awareness: 10 }));
    checkUnlocks(makeState({ awareness: 10 }));
    expect(get(feeds).sigint).toHaveLength(1);
  });

  it('returns true when at least one layer unlocked', async () => {
    await loadScenario('mock', makeMockScenario());
    expect(checkUnlocks(makeState({ awareness: 10 }))).toBe(true);
  });

  it('returns false when no layers unlock', async () => {
    await loadScenario('mock', makeMockScenario());
    expect(checkUnlocks(makeState({ awareness: 0 }))).toBe(false);
  });
});

// ── checkUnlocks() — forbidden layer ─────────────────────────────────────────

describe('checkUnlocks() — forbidden layer', () => {
  it('calls triggerDoctrinal with the fragment key when condition is met', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ coherence: 40 })); // coherence < 50 → unlock
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_SOUL_NEVER_DIES');
  });

  it('does not call triggerDoctrinal when condition is not met', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ coherence: 80 }));
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('does not push forbidden event to feeds directly — triggerDoctrinal handles it', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ coherence: 40 }));
    // doctrinal feed is not directly pushed by engine (triggerDoctrinal is mocked)
    expect(get(feeds).doctrinal).toHaveLength(0);
  });

  it('tracks the forbidden layer as unresolved after unlock', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ coherence: 40 }));
    // Verify it will produce a ghost signal at shift end (remembers: true)
    endShift();
    expect(saveGhostSignal).toHaveBeenCalledOnce();
  });
});

// ── resolveLayer() ────────────────────────────────────────────────────────────

describe('resolveLayer()', () => {
  it('returns correct result shape for surface layer', async () => {
    await loadScenario('mock', makeMockScenario());
    const r = resolveLayer('mock-scenario', 'surface', 'VERIFY', 'mock-surface');
    expect(r).toMatchObject({
      scenarioId: 'mock-scenario',
      layer: 'surface',
      command: 'VERIFY',
      target: 'mock-surface',
      outcome: 'SURFACE_RESOLVED',
    });
  });

  it('returns correct result shape for hidden layer', async () => {
    await loadScenario('mock', makeMockScenario());
    const r = resolveLayer('mock-scenario', 'hidden', 'DECODE', null);
    expect(r).toMatchObject({
      scenarioId: 'mock-scenario',
      layer: 'hidden',
      outcome: 'HIDDEN_RESOLVED',
    });
  });

  it('returns SCENARIO_NOT_FOUND for unknown scenario', () => {
    const r = resolveLayer('nonexistent', 'surface', 'VERIFY', null);
    expect(r).toMatchObject({ success: false, reason: 'SCENARIO_NOT_FOUND' });
  });

  it('returns LAYER_NOT_FOUND for unknown layer name', async () => {
    await loadScenario('mock', makeMockScenario());
    const r = resolveLayer('mock-scenario', 'ultra', 'VERIFY', null);
    expect(r).toMatchObject({ success: false, reason: 'LAYER_NOT_FOUND' });
  });

  it('resolving forbidden layer removes it from ghost signal tracking', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ coherence: 40 })); // unlock forbidden
    resolveLayer('mock-scenario', 'forbidden', 'ACKNOWLEDGE', null); // resolve it
    endShift();
    expect(saveGhostSignal).not.toHaveBeenCalled(); // resolved — no ghost
  });
});

// ── endShift() — ghost signal persistence (the 10% rule) ─────────────────────

describe('endShift() — unresolved forbidden layers', () => {
  it('calls saveGhostSignal for unresolved forbidden layer with remembers: true', async () => {
    await loadScenario('mock', makeMockScenario()); // remembers: true
    checkUnlocks(makeState({ coherence: 40 }));
    // Do NOT call resolveLayer — leave it unresolved
    endShift();
    expect(saveGhostSignal).toHaveBeenCalledOnce();
  });

  it('ghost signal contains the fragment key', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ coherence: 40 }));
    endShift();
    const arg = saveGhostSignal.mock.calls[0][0];
    expect(arg.fragmentKey).toBe('GITA_SOUL_NEVER_DIES');
  });

  it('ghost signal includes origin: UNRESOLVED_FORBIDDEN', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ coherence: 40 }));
    endShift();
    expect(saveGhostSignal.mock.calls[0][0].origin).toBe('UNRESOLVED_FORBIDDEN');
  });

  it('does not call saveGhostSignal for forbidden layer with remembers: false', async () => {
    const scenario = makeMockScenario();
    scenario.layers.forbidden.remembers = false;
    await loadScenario('mock', scenario);
    checkUnlocks(makeState({ coherence: 40 }));
    endShift();
    expect(saveGhostSignal).not.toHaveBeenCalled();
  });

  it('does not call saveGhostSignal if forbidden layer was never unlocked', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ coherence: 80 })); // condition not met
    endShift();
    expect(saveGhostSignal).not.toHaveBeenCalled();
  });

  it('clears unresolved tracking after endShift', async () => {
    await loadScenario('mock', makeMockScenario());
    checkUnlocks(makeState({ coherence: 40 }));
    endShift();
    vi.clearAllMocks();
    endShift(); // second call should not re-save
    expect(saveGhostSignal).not.toHaveBeenCalled();
  });
});

// ── Ghost Submarine scenario ──────────────────────────────────────────────────

describe('Ghost Submarine — scenario file structure', () => {
  it('has id ghost-submarine', () => {
    expect(ghostSubmarine.id).toBe('ghost-submarine');
  });

  it('forbidden layer has remembers: true', () => {
    expect(ghostSubmarine.layers.forbidden.remembers).toBe(true);
  });

  it('forbidden layer fragmentKey is GITA_SOUL_NEVER_DIES', () => {
    expect(ghostSubmarine.layers.forbidden.event.fragmentKey).toBe('GITA_SOUL_NEVER_DIES');
  });

  it('surface layer uses TACTICAL feed', () => {
    expect(ghostSubmarine.layers.surface.feed).toBe('TACTICAL');
  });

  it('hidden layer uses SIGINT feed', () => {
    expect(ghostSubmarine.layers.hidden.feed).toBe('SIGINT');
  });

  it('forbidden layer uses DOCTRINAL feed', () => {
    expect(ghostSubmarine.layers.forbidden.feed).toBe('DOCTRINAL');
  });

  it('lists THE_PREDICTOR and THE_MIMIC as modifying aspects', () => {
    expect(ghostSubmarine.aspects).toContain('THE_PREDICTOR');
    expect(ghostSubmarine.aspects).toContain('THE_MIMIC');
  });

  it('hidden layer unlocks when a tactical event is verified', () => {
    const stateWithVerified = {
      feeds: { tactical: [{ id: 'ev', verified: true }], sigint: [], diplomat: [], doctrinal: [] },
      awareness: 0,
      coherence: 100,
    };
    expect(ghostSubmarine.layers.hidden.unlockCondition(stateWithVerified)).toBe(true);
  });

  it('hidden layer does not unlock when no tactical event is verified', () => {
    const stateWithout = {
      feeds: { tactical: [{ id: 'ev', verified: false }], sigint: [], diplomat: [], doctrinal: [] },
      awareness: 0,
      coherence: 100,
    };
    expect(ghostSubmarine.layers.hidden.unlockCondition(stateWithout)).toBe(false);
  });

  it('forbidden layer unlocks when coherence < 80', () => {
    expect(ghostSubmarine.layers.forbidden.unlockCondition({ coherence: 79 })).toBe(true);
  });

  it('forbidden layer does not unlock when coherence >= 80', () => {
    expect(ghostSubmarine.layers.forbidden.unlockCondition({ coherence: 80 })).toBe(false);
  });
});

describe('Ghost Submarine — loaded via engine', () => {
  it('pushes surface event to feeds.tactical on load', async () => {
    await loadScenario('ghost-submarine', ghostSubmarine);
    expect(get(feeds).tactical).toHaveLength(1);
    expect(get(feeds).tactical[0].id).toBe('ghost-sub-surface');
  });

  it('hidden event unlocks when a tactical event is verified', async () => {
    await loadScenario('ghost-submarine', ghostSubmarine);
    // Seed a verified tactical event in the store
    feeds.update(s => ({
      ...s,
      tactical: [{ ...s.tactical[0], verified: true }],
    }));
    checkUnlocks(makeState());
    expect(get(feeds).sigint).toHaveLength(1);
    expect(get(feeds).sigint[0].id).toBe('ghost-sub-hidden');
  });

  it('forbidden layer triggers GITA_SOUL_NEVER_DIES when coherence < 80', async () => {
    await loadScenario('ghost-submarine', ghostSubmarine);
    coherence.set(70);
    checkUnlocks(makeState());
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_SOUL_NEVER_DIES');
  });

  it('unresolved Ghost Submarine forbidden layer saves ghost signal at shift end', async () => {
    await loadScenario('ghost-submarine', ghostSubmarine);
    coherence.set(70);
    checkUnlocks(makeState());
    // Do not resolve
    endShift();
    expect(saveGhostSignal).toHaveBeenCalledOnce();
    expect(saveGhostSignal.mock.calls[0][0].fragmentKey).toBe('GITA_SOUL_NEVER_DIES');
  });
});

// ── Aspect-driven behavior ────────────────────────────────────────────────────

describe('Aspects modify scenario unlock conditions', () => {
  it('scenario hidden layer can unlock based on active aspects', async () => {
    const aspectScenario = {
      id: 'aspect-scenario',
      title: 'ASPECT TEST',
      aspects: ['THE_PREDICTOR'],
      layers: {
        surface: {
          feed: 'TACTICAL',
          event: { id: 'as-surface', type: 'TROOP_MOVEMENT', content: 'Aspect test.' },
          resolution: () => ({ outcome: 'DONE' }),
        },
        hidden: {
          feed: 'SIGINT',
          // Unlocks only when THE_PREDICTOR is in active aspects
          unlockCondition: (state) => state.anomalies.aspects.includes('THE_PREDICTOR'),
          event: { id: 'as-hidden', type: 'INTERCEPT', source: 'VECTOR', content: 'Predictor revealed this.', anomalyFlag: false, verified: false, isGhost: false },
          resolution: () => ({ outcome: 'PREDICTOR_HIDDEN' }),
        },
        forbidden: {
          feed: 'DOCTRINAL',
          unlockCondition: () => false,
          event: { fragmentKey: 'MORPHYSM_TULPAS' },
          resolution: () => ({ outcome: 'NEVER' }),
          remembers: false,
        },
      },
    };

    await loadScenario('aspect-scenario', aspectScenario);

    // Without THE_PREDICTOR: hidden does not unlock
    anomalies.set({ aspects: [], manifestations: [] });
    checkUnlocks(makeState());
    expect(get(feeds).sigint).toHaveLength(0);

    // With THE_PREDICTOR: hidden unlocks
    anomalies.update(s => ({ ...s, aspects: ['THE_PREDICTOR'] }));
    checkUnlocks(makeState());
    expect(get(feeds).sigint).toHaveLength(1);
  });
});
