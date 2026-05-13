import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { bandwidth, nature, feeds, clock, currentShift, awareness } from '../src/core/store.js';

vi.mock('../src/core/clock.js', () => ({ advance: vi.fn() }));
vi.mock('../src/feeds/doctrinal.js', () => ({ triggerDoctrinal: vi.fn() }));

import { advance } from '../src/core/clock.js';
import { triggerDoctrinal } from '../src/feeds/doctrinal.js';
import { intercept, auth, silence, leak } from '../src/commands/tier1.js';
import { transcend, AWARENESS_MAX, TOTAL_SHIFTS, _resetLockForTesting } from '../src/commands/tier3.js';
import { resetOperatorErrors } from '../src/core/operatorError.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSigintEvent(overrides = {}) {
  return {
    id: 'ev-sigint-1',
    timestamp: '11:54:00',
    type: 'INTERCEPT',
    source: 'VECTOR',
    content: 'Signal intercepted.',
    anomalyFlag: false,
    verified: false,
    isGhost: false,
    shift: 0,
    ...overrides,
  };
}

function makeTacticalEvent(overrides = {}) {
  return {
    id: 'ev-tactical-1',
    timestamp: '11:54:00',
    type: 'STRIKE_AUTHORIZED',
    origin: 'USA',
    target: 'GRID_47N_38E',
    content: 'Strike authorized.',
    anomalyFlag: false,
    verified: false,
    shift: 0,
    ...overrides,
  };
}

beforeEach(() => {
  feeds.set({
    diplomat: [
      { id: 'target', timestamp: '11:54:00', type: 'CEASEFIRE_STATUS', content: 'Treaty target.', anomalyFlag: false, verified: false, shift: 0 },
    ],
    tactical: [
      makeTacticalEvent({ id: 'target' }),
      makeTacticalEvent({ id: 'non-brahmastra-target' }),
      makeTacticalEvent({ id: 'a' }),
      makeTacticalEvent({ id: 'b' }),
      makeTacticalEvent({ id: 'evt-003' }),
    ],
    sigint: [
      makeSigintEvent({ id: 'my-target' }),
      makeSigintEvent({ id: 'PACKAGE' }),
      makeSigintEvent({ id: 'INTEL_PACKAGE' }),
    ],
    doctrinal: [],
  });
  clock.set({ time: '11:54:00', debtLedger: [] });
  bandwidth.set({ total: 100, spent: 0 });
  nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
  currentShift.set(0);
  awareness.set(0);
  resetOperatorErrors();
  _resetLockForTesting();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── intercept() ───────────────────────────────────────────────────────────────

describe('intercept()', () => {
  it('returns the correct result shape', () => {
    const event = makeSigintEvent();
    feeds.update(s => ({ ...s, sigint: [event] }));

    const r = intercept('ev-sigint-1');
    expect(r).toMatchObject({
      command: 'INTERCEPT',
      target: 'ev-sigint-1',
      success: true,
      bandwidthCost: 2,
      clockEffect: 0,
      doctrinalTriggered: null,
      timestamp: '11:54:00',
    });
  });

  it('returns the raw event in result.event', () => {
    const event = makeSigintEvent();
    feeds.update(s => ({ ...s, sigint: [event] }));
    expect(intercept('ev-sigint-1').event).toEqual(event);
  });

  it('finds events across all feed slices', () => {
    const ev = makeTacticalEvent({ id: 'tactical-ev' });
    feeds.update(s => ({ ...s, tactical: [ev] }));
    expect(intercept('tactical-ev').event).toEqual(ev);
  });

  it('returns operator error for an unknown id', () => {
    expect(intercept('nonexistent')).toMatchObject({
      success: false,
      reason: 'TARGET_UNRESOLVED',
      anomalyFlag: true,
      operatorError: true,
    });
  });

  it('does not trigger a doctrinal fragment', () => {
    intercept('any-target');
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('does not call advance', () => {
    intercept('any-target');
    expect(advance).not.toHaveBeenCalled();
  });

  it('spends 2 bandwidth', () => {
    intercept('any-target');
    expect(get(bandwidth).spent).toBe(2);
  });
});

// ── auth() ────────────────────────────────────────────────────────────────────

describe('auth() — STRIKE', () => {
  it('triggers GITA_DUTY_WITHOUT_ATTACHMENT on a normal strike', () => {
    auth('STRIKE', 'non-brahmastra-target');
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_DUTY_WITHOUT_ATTACHMENT');
  });

  it('sets doctrinalTriggered to GITA_DUTY_WITHOUT_ATTACHMENT', () => {
    expect(auth('STRIKE', 'target').doctrinalTriggered).toBe('GITA_DUTY_WITHOUT_ATTACHMENT');
  });

  it('triggers GITA_TIME_I_AM instead on a brahmastra event', () => {
    const ev = makeTacticalEvent({ id: 'brahmastra-ev', brahmastra: true });
    feeds.update(s => ({ ...s, tactical: [ev] }));
    auth('STRIKE', 'brahmastra-ev');
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_TIME_I_AM');
    expect(triggerDoctrinal).not.toHaveBeenCalledWith('GITA_DUTY_WITHOUT_ATTACHMENT');
  });

  it('sets doctrinalTriggered to GITA_TIME_I_AM on brahmastra', () => {
    const ev = makeTacticalEvent({ id: 'brahmastra-ev', brahmastra: true });
    feeds.update(s => ({ ...s, tactical: [ev] }));
    expect(auth('STRIKE', 'brahmastra-ev').doctrinalTriggered).toBe('GITA_TIME_I_AM');
  });

  it('triggers GITA_DUTY_WITHOUT_ATTACHMENT for a non-brahmastra tactical event', () => {
    const ev = makeTacticalEvent({ id: 'normal-ev' }); // no brahmastra field
    feeds.update(s => ({ ...s, tactical: [ev] }));
    auth('STRIKE', 'normal-ev');
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_DUTY_WITHOUT_ATTACHMENT');
    expect(triggerDoctrinal).not.toHaveBeenCalledWith('GITA_TIME_I_AM');
  });

  it('increments nature.system by 1', () => {
    auth('STRIKE', 'target');
    expect(get(nature).system).toBe(1);
  });

  it('does not advance clock', () => {
    auth('STRIKE', 'target');
    expect(advance).not.toHaveBeenCalled();
  });

  it('spends 10 bandwidth', () => {
    auth('STRIKE', 'target');
    expect(get(bandwidth).spent).toBe(10);
  });

  it('accepts a split and unpadded event id with explicit STRIKE type', () => {
    const r = auth('STRIKE', 'EVT -3');
    expect(r).toMatchObject({
      success: true,
      type: 'STRIKE',
      target: 'evt-003',
      doctrinalTriggered: 'GITA_DUTY_WITHOUT_ATTACHMENT',
    });
  });

  it('infers STRIKE from a tactical event id when AUTH receives only the event code', () => {
    const r = auth('EVT', '-3');
    expect(r).toMatchObject({
      success: true,
      type: 'STRIKE',
      target: 'evt-003',
      doctrinalTriggered: 'GITA_DUTY_WITHOUT_ATTACHMENT',
    });
  });
});

describe('auth() — TREATY', () => {
  it('triggers no doctrinal fragment', () => {
    auth('TREATY', 'diplomat-event-1');
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('doctrinalTriggered is null', () => {
    expect(auth('TREATY', 'target').doctrinalTriggered).toBeNull();
  });

  it('does not increment nature.system', () => {
    auth('TREATY', 'target');
    expect(get(nature).system).toBe(0);
  });

  it('spends 5 bandwidth', () => {
    auth('TREATY', 'target');
    expect(get(bandwidth).spent).toBe(5);
  });

  it('result includes type field set to TREATY', () => {
    expect(auth('TREATY', 'target').type).toBe('TREATY');
  });

  it('infers TREATY from a diplomatic event id when AUTH receives only the event code', () => {
    feeds.update(s => ({
      ...s,
      diplomat: [
        ...s.diplomat,
        { id: 'evt-004', timestamp: '11:54:00', type: 'CEASEFIRE_STATUS', content: 'Treaty event.', anomalyFlag: false, verified: false, shift: 0 },
      ],
    }));

    const r = auth('EVT', '-4');
    expect(r).toMatchObject({
      success: true,
      type: 'TREATY',
      target: 'evt-004',
      doctrinalTriggered: null,
    });
  });
});

describe('auth() — malformed input', () => {
  it('punishes illogical auth types as operator errors', () => {
    const r = auth('BANANA', undefined);
    expect(r).toMatchObject({
      success: false,
      reason: 'INVALID_AUTH_TYPE',
      anomalyFlag: true,
      operatorError: true,
    });
  });
});

// ── silence() ─────────────────────────────────────────────────────────────────

describe('silence() — OWN_TERMINAL', () => {
  it('triggers GITA_PRETENDER', () => {
    silence('OWN_TERMINAL');
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_PRETENDER');
  });

  it('sets doctrinalTriggered to GITA_PRETENDER', () => {
    expect(silence('OWN_TERMINAL').doctrinalTriggered).toBe('GITA_PRETENDER');
  });

  it('does not call advance — Zen of Zero', () => {
    silence('OWN_TERMINAL');
    expect(advance).not.toHaveBeenCalled();
  });

  it('clockEffect is 0', () => {
    expect(silence('OWN_TERMINAL').clockEffect).toBe(0);
  });

  it('still increments nature.martyr', () => {
    silence('OWN_TERMINAL');
    expect(get(nature).martyr).toBe(1);
  });
});

describe('silence() — other target', () => {
  it('does not trigger GITA_PRETENDER', () => {
    silence('AGENT_VECTOR');
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('doctrinalTriggered is null', () => {
    expect(silence('AGENT_VECTOR').doctrinalTriggered).toBeNull();
  });

  it('increments nature.martyr', () => {
    silence('AGENT_VECTOR');
    expect(get(nature).martyr).toBe(1);
  });

  it('does not advance clock', () => {
    silence('AGENT_VECTOR');
    expect(advance).not.toHaveBeenCalled();
  });

  it('spends 1 bandwidth', () => {
    silence('AGENT_VECTOR');
    expect(get(bandwidth).spent).toBe(1);
  });
});

// ── leak() ────────────────────────────────────────────────────────────────────

describe('leak()', () => {
  it('advances clock with source LEAK_CONSEQUENCE', () => {
    leak('INTEL_PACKAGE', 'RUSSIA');
    expect(advance).toHaveBeenCalledWith(expect.any(Number), 'LEAK_CONSEQUENCE');
  });

  it('advances clock by 1–8 seconds', () => {
    for (let i = 0; i < 30; i++) {
      vi.clearAllMocks();
      bandwidth.set({ total: 100, spent: 0 });
      leak('PACKAGE', 'FACTION');
      const seconds = advance.mock.calls[0][0];
      expect(seconds).toBeGreaterThanOrEqual(1);
      expect(seconds).toBeLessThanOrEqual(8);
    }
  });

  it('result clockEffect matches the seconds passed to advance', () => {
    const r = leak('PACKAGE', 'FACTION');
    const seconds = advance.mock.calls[0][0];
    expect(r.clockEffect).toBe(seconds);
  });

  it('result includes faction field', () => {
    expect(leak('PACKAGE', 'RUSSIA').faction).toBe('RUSSIA');
  });

  it('triggers no doctrinal fragment', () => {
    leak('PACKAGE', 'FACTION');
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('spends 4 bandwidth', () => {
    leak('PACKAGE', 'FACTION');
    expect(get(bandwidth).spent).toBe(4);
  });
});

// ── Bandwidth enforcement ─────────────────────────────────────────────────────

describe('bandwidth enforcement', () => {
  it('returns failure shape when bandwidth is exceeded', () => {
    bandwidth.set({ total: 100, spent: 99 });
    const r = intercept('target'); // cost 2, 99+2=101 > 100
    expect(r).toMatchObject({ success: false, reason: 'BANDWIDTH_EXCEEDED' });
  });

  it('failure includes command and target', () => {
    bandwidth.set({ total: 100, spent: 99 });
    const r = intercept('my-target');
    expect(r.command).toBe('INTERCEPT');
    expect(r.target).toBe('my-target');
  });

  it('does not spend bandwidth on failure', () => {
    bandwidth.set({ total: 100, spent: 99 });
    intercept('target');
    expect(get(bandwidth).spent).toBe(99);
  });

  it('does not call advance on bandwidth failure', () => {
    bandwidth.set({ total: 100, spent: 97 });
    leak('target', 'faction'); // cost 4, 97+4=101 > 100
    expect(advance).not.toHaveBeenCalled();
  });

  it('does not trigger doctrinal on bandwidth failure', () => {
    bandwidth.set({ total: 100, spent: 91 });
    auth('STRIKE', 'target'); // cost 10, 91+10=101 > 100
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('allows command when cost exactly fills remaining bandwidth', () => {
    bandwidth.set({ total: 100, spent: 98 });
    const r = intercept('target'); // cost 2, 98+2=100 <= 100 → success
    expect(r.success).toBe(true);
  });

  it('auth TREATY fails correctly', () => {
    bandwidth.set({ total: 100, spent: 96 });
    const r = auth('TREATY', 'target'); // cost 5, 96+5=101 > 100
    expect(r.success).toBe(false);
    expect(r.reason).toBe('BANDWIDTH_EXCEEDED');
  });
});

describe('operator errors', () => {
  it('flags invalid targets as anomalous operator errors with side effects', () => {
    const r = intercept('missing-target');
    expect(r).toMatchObject({
      success: false,
      reason: 'TARGET_UNRESOLVED',
      anomalyFlag: true,
      operatorError: true,
      bandwidthCost: 2,
    });
    expect(get(bandwidth).spent).toBe(2);
  });

  it('advances the clock by 3 minutes on the 8th operator error in the same shift', () => {
    for (let i = 0; i < 8; i++) intercept(`missing-${i}`);
    expect(advance).toHaveBeenCalledWith(180, 'OPERATOR_ERROR');
  });
});

describe('terminal lock', () => {
  it('blocks tier 1 commands after TRANSCEND locks the terminal', () => {
    currentShift.set(TOTAL_SHIFTS - 1);
    awareness.set(AWARENESS_MAX);
    transcend();
    expect(() => intercept('my-target')).toThrow('TERMINAL_LOCKED');
  });
});

// ── Nature scores ─────────────────────────────────────────────────────────────

describe('nature score updates', () => {
  it('auth STRIKE increments nature.system by 1', () => {
    auth('STRIKE', 'target');
    expect(get(nature).system).toBe(1);
  });

  it('auth STRIKE accumulates nature.system across calls', () => {
    auth('STRIKE', 'a');
    bandwidth.set({ total: 100, spent: 0 }); // reset bandwidth between calls
    auth('STRIKE', 'b');
    expect(get(nature).system).toBe(2);
  });

  it('auth TREATY does not change any nature score', () => {
    auth('TREATY', 'target');
    const n = get(nature);
    expect(n.system).toBe(0);
    expect(n.martyr).toBe(0);
    expect(n.prophet).toBe(0);
    expect(n.antichrist).toBe(0);
  });

  it('silence increments nature.martyr by 1', () => {
    silence('AGENT_X');
    expect(get(nature).martyr).toBe(1);
  });

  it('intercept does not change any nature score', () => {
    intercept('target');
    const n = get(nature);
    expect(Object.values(n).every(v => v === 0)).toBe(true);
  });

  it('leak does not change any nature score', () => {
    leak('target', 'faction');
    const n = get(nature);
    expect(Object.values(n).every(v => v === 0)).toBe(true);
  });
});
