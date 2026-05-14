import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { bandwidth, awareness, coherence, feeds, clock, anomalies, currentShift } from '../src/core/store.js';

vi.mock('../src/core/clock.js',       () => ({ advance: vi.fn() }));
vi.mock('../src/feeds/doctrinal.js',  () => ({ triggerDoctrinal: vi.fn() }));
vi.mock('../src/core/persistence.js', () => ({
  saveClock:        vi.fn(),
  loadClock:        vi.fn(),
  saveGhostSignal:  vi.fn(),
  loadGhostSignals: vi.fn(),
  _resetDB:         vi.fn(),
}));

import { advance }          from '../src/core/clock.js';
import { triggerDoctrinal } from '../src/feeds/doctrinal.js';
import { saveClock }        from '../src/core/persistence.js';
import { decode, verify, triangulate } from '../src/commands/tier2.js';
import { transcend, AWARENESS_MAX, TOTAL_SHIFTS, _resetLockForTesting } from '../src/commands/tier3.js';
import { resetOperatorErrors } from '../src/core/operatorError.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSigintEvent(overrides = {}) {
  return {
    id: 'ev-1',
    timestamp: '11:54:00',
    type: 'DECRYPT',
    source: 'VECTOR',
    content: 'Decrypted content: ASSET COMPROMISED. Verification required.',
    anomalyFlag: false,
    verified: false,
    isGhost: false,
    shift: 0,
    ...overrides,
  };
}

function seedFeed(event) {
  feeds.update(s => ({ ...s, sigint: [event] }));
}

function forceRoll(value) {
  return vi.spyOn(Math, 'random').mockReturnValueOnce(value);
}

beforeEach(() => {
  feeds.set({
    diplomat: [],
    tactical: [
      { id: 't', timestamp: '11:54:00', type: 'CONTACT_UNIDENTIFIED', origin: 'North Atlantic', content: 'Contact.', anomalyFlag: false, verified: false, shift: 0 },
      { id: 'target-1', timestamp: '11:54:00', type: 'CONTACT_UNIDENTIFIED', origin: 'North Atlantic', content: 'Contact.', anomalyFlag: false, verified: false, shift: 0 },
    ],
    sigint: [makeSigintEvent()],
    doctrinal: [],
  });
  clock.set({ time: '11:54:00', debtLedger: [] });
  bandwidth.set({ total: 100, spent: 0 });
  awareness.set(0);
  coherence.set(100);
  anomalies.set({ aspects: [], manifestations: [] });
  currentShift.set(0);
  resetOperatorErrors();
  _resetLockForTesting();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── decode() — shape ──────────────────────────────────────────────────────────

describe('decode() — result shape', () => {
  it('returns required fields on success', () => {
    forceRoll(0.01); // 0.01 < 0.70 → success
    const r = decode('ev-1');
    expect(r).toMatchObject({
      command: 'DECODE',
      target: 'ev-1',
      success: true,
      bandwidthCost: 1,
      clockEffect: 10,
      doctrinalTriggered: null,
      timestamp: '11:54:00',
      observerEffectApplied: true,
    });
    expect(typeof r.probability).toBe('number');
    expect(typeof r.content).toBe('string');
  });

  it('accepts tradition alias target at game start (DECODE GITA)', () => {
    feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
    triggerDoctrinal.mockImplementationOnce(() => {
      const event = {
        id: 'gita-boot-1',
        timestamp: '11:54:00',
        tradition: 'GITA',
        fragmentKey: 'GITA_LIMBS_FAIL',
        content: 'Bootstrapped doctrinal fragment.',
        shift: 0,
        anomalyFlag: true,
        isDoctrinal: true,
      };
      feeds.update(s => ({ ...s, sigint: [...s.sigint, event] }));
      return event;
    });
    forceRoll(0.01);
    const r = decode('GITA');
    expect(r.command).toBe('DECODE');
    expect(r.target).toBe('GITA');
    expect(r.success).toBe(true);
  });

  it('accepts revelation alias target at game start (DECODE BIBLE)', () => {
    feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
    triggerDoctrinal.mockImplementationOnce(() => {
      const event = {
        id: 'rev-boot-1',
        timestamp: '11:54:00',
        tradition: 'REVELATION',
        fragmentKey: 'REV_6_1',
        content: 'Bootstrapped revelation fragment.',
        shift: 0,
        anomalyFlag: true,
        isDoctrinal: true,
      };
      feeds.update(s => ({ ...s, tactical: [...s.tactical, event] }));
      return event;
    });
    forceRoll(0.01);
    const r = decode('BIBLE');
    expect(r.command).toBe('DECODE');
    expect(r.target).toBe('BIBLE');
    expect(r.success).toBe(true);
  });

  it('returns required fields on failure', () => {
    forceRoll(0.99); // fail
    const r = decode('ev-1');
    expect(r.success).toBe(false);
    expect(r.observerEffectApplied).toBe(true);
    expect(r.reason).toBe('DECODE_FAILED');
    expect(r.anomalyFlag).toBe(true);
  });

  it('clockEffect is always 10', () => {
    forceRoll(0.01);
    expect(decode('ev-1').clockEffect).toBe(10);
    vi.restoreAllMocks();
    forceRoll(0.99);
    bandwidth.set({ total: 100, spent: 0 });
    expect(decode('ev-1').clockEffect).toBe(10);
  });
});

// ── decode() — Observer Effect ────────────────────────────────────────────────

describe('decode() — Observer Effect', () => {
  it('sets verified: true on the event when decode succeeds', () => {
    seedFeed(makeSigintEvent());
    forceRoll(0.01);
    decode('ev-1');
    expect(get(feeds).sigint[0].verified).toBe(true);
  });

  it('sets verified: true on the event when decode fails', () => {
    seedFeed(makeSigintEvent());
    forceRoll(0.99);
    decode('ev-1');
    expect(get(feeds).sigint[0].verified).toBe(true);
  });

  it('sets anomalyFlag: true on the event when decode fails', () => {
    seedFeed(makeSigintEvent({ anomalyFlag: false }));
    forceRoll(0.99);
    decode('ev-1');
    expect(get(feeds).sigint[0].anomalyFlag).toBe(true);
  });

  it('does not set anomalyFlag: true when decode succeeds', () => {
    seedFeed(makeSigintEvent({ anomalyFlag: false }));
    forceRoll(0.01);
    decode('ev-1');
    expect(get(feeds).sigint[0].anomalyFlag).toBe(false);
  });

  it('calls persistence.saveClock() after execution', () => {
    forceRoll(0.5);
    decode('ev-1');
    expect(saveClock).toHaveBeenCalledOnce();
  });

  it('calls persistence.saveClock() on both success and failure', () => {
    forceRoll(0.01);
    decode('ev-1');
    expect(saveClock).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    bandwidth.set({ total: 100, spent: 0 });
    forceRoll(0.99);
    decode('ev-1');
    expect(saveClock).toHaveBeenCalledOnce();
  });

  it('observerEffectApplied is true regardless of success', () => {
    forceRoll(0.99);
    expect(decode('ev-1').observerEffectApplied).toBe(true);
  });
});

// ── decode() — content ────────────────────────────────────────────────────────

describe('decode() — content', () => {
  it('returns full content on success', () => {
    const ev = makeSigintEvent({ content: 'FULL SIGNAL CONTENT HERE' });
    seedFeed(ev);
    forceRoll(0.01);
    expect(decode('ev-1').content).toBe('FULL SIGNAL CONTENT HERE');
  });

  it('returns partial content on failure', () => {
    seedFeed(makeSigintEvent({ content: 'Long content string that will be truncated on failure.' }));
    forceRoll(0.99);
    const content = decode('ev-1').content;
    expect(content).toContain('[PARTIAL DECODE — SIGNAL CORRUPTED]');
  });

  it('advances clock by 10 unconditionally', () => {
    forceRoll(0.5);
    decode('ev-1');
    expect(advance).toHaveBeenCalledWith(10, 'DECODE_ATTEMPT');
  });
});

// ── decode() — probability modifiers ─────────────────────────────────────────

describe('decode() — probability calculation', () => {
  it('base probability is 0.70', () => {
    forceRoll(0.5);
    expect(decode('ev-1').probability).toBeCloseTo(0.70);
  });

  it('THE_MEMETIC reduces probability by 0.20', () => {
    anomalies.set({ aspects: ['THE_MEMETIC'], manifestations: [] });
    forceRoll(0.5);
    expect(decode('ev-1').probability).toBeCloseTo(0.50);
  });

  it('awareness > 50 increases probability by 0.10', () => {
    awareness.set(51);
    forceRoll(0.5);
    expect(decode('ev-1').probability).toBeCloseTo(0.80);
  });

  it('coherence < 50 reduces probability by 0.15', () => {
    coherence.set(49);
    forceRoll(0.5);
    expect(decode('ev-1').probability).toBeCloseTo(0.55);
  });

  it('all modifiers stack correctly', () => {
    anomalies.set({ aspects: ['THE_MEMETIC'], manifestations: [] });
    awareness.set(51);
    coherence.set(49);
    // 0.70 - 0.20 + 0.10 - 0.15 = 0.45
    forceRoll(0.5);
    expect(decode('ev-1').probability).toBeCloseTo(0.45);
  });

  it('probability is clamped to [0, 1]', () => {
    // Pile on all negatives: -0.20 (Memetic) + -0.15 (low coherence) = -0.35 from 0.70 = 0.35
    anomalies.set({ aspects: ['THE_MEMETIC'], manifestations: [] });
    coherence.set(10);
    forceRoll(0.5);
    const p = decode('ev-1').probability;
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

// ── verify() — Observer Effect ────────────────────────────────────────────────

describe('verify() — Observer Effect', () => {
  it('observerEffectApplied is true', () => {
    forceRoll(0.5);
    expect(verify('ev-1').observerEffectApplied).toBe(true);
  });

  it('sets verified: true on the event', () => {
    seedFeed(makeSigintEvent());
    forceRoll(0.01);
    verify('ev-1');
    expect(get(feeds).sigint[0].verified).toBe(true);
  });

  it('sets verified: true even on failure', () => {
    seedFeed(makeSigintEvent());
    forceRoll(0.99);
    verify('ev-1');
    expect(get(feeds).sigint[0].verified).toBe(true);
  });

  it('advances clock by 30 unconditionally', () => {
    forceRoll(0.5);
    verify('ev-1');
    expect(advance).toHaveBeenCalledWith(30, 'VERIFY_ATTEMPT');
  });
});

// ── verify() — four outcome paths ────────────────────────────────────────────

describe('verify() — true positive (real signal, roll passes)', () => {
  it('advances clock by -2 with VERIFICATION_SUCCESS', () => {
    seedFeed(makeSigintEvent({ isGhost: false }));
    forceRoll(0.01); // 0.01 < 0.60 → success
    verify('ev-1');
    expect(advance).toHaveBeenCalledWith(-2, 'VERIFICATION_SUCCESS');
  });

  it('does not trigger a doctrinal fragment', () => {
    seedFeed(makeSigintEvent({ isGhost: false }));
    forceRoll(0.01);
    verify('ev-1');
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('success is true', () => {
    seedFeed(makeSigintEvent({ isGhost: false }));
    forceRoll(0.01);
    expect(verify('ev-1').success).toBe(true);
  });
});

describe('verify() — false positive (ghost signal, roll passes)', () => {
  it('advances clock by +3 with FALSE_POSITIVE', () => {
    seedFeed(makeSigintEvent({ isGhost: true }));
    forceRoll(0.01);
    verify('ev-1');
    expect(advance).toHaveBeenCalledWith(3, 'FALSE_POSITIVE');
  });

  it('result has anomalyFlag: true', () => {
    seedFeed(makeSigintEvent({ isGhost: true }));
    forceRoll(0.01);
    expect(verify('ev-1').anomalyFlag).toBe(true);
  });

  it('clockEffect includes the +3 penalty', () => {
    seedFeed(makeSigintEvent({ isGhost: true }));
    forceRoll(0.01);
    expect(verify('ev-1').clockEffect).toBe(33);
  });
});

describe('verify() — false negative (real signal, roll fails)', () => {
  it('triggers GITA_OWN_DUTIES', () => {
    seedFeed(makeSigintEvent({ isGhost: false }));
    forceRoll(0.99); // 0.99 >= 0.60 → fail
    verify('ev-1');
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_OWN_DUTIES');
  });

  it('doctrinalTriggered is GITA_OWN_DUTIES', () => {
    seedFeed(makeSigintEvent({ isGhost: false }));
    forceRoll(0.99);
    expect(verify('ev-1').doctrinalTriggered).toBe('GITA_OWN_DUTIES');
  });

  it('success is false', () => {
    seedFeed(makeSigintEvent({ isGhost: false }));
    forceRoll(0.99);
    expect(verify('ev-1').success).toBe(false);
  });

  it('does not advance clock beyond base 30', () => {
    seedFeed(makeSigintEvent({ isGhost: false }));
    forceRoll(0.99);
    verify('ev-1');
    // Should be called once with 30 only
    expect(advance).toHaveBeenCalledOnce();
    expect(advance).toHaveBeenCalledWith(30, 'VERIFY_ATTEMPT');
  });
});

describe('verify() — true negative (ghost signal, roll fails)', () => {
  it('triggers no doctrinal fragment', () => {
    seedFeed(makeSigintEvent({ isGhost: true }));
    forceRoll(0.99);
    verify('ev-1');
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('does not advance clock beyond base 30', () => {
    seedFeed(makeSigintEvent({ isGhost: true }));
    forceRoll(0.99);
    verify('ev-1');
    expect(advance).toHaveBeenCalledOnce();
  });
});

// ── triangulate() ─────────────────────────────────────────────────────────────

describe('triangulate() — shape', () => {
  it('returns required fields', () => {
    forceRoll(0.01);
    const r = triangulate('target-1');
    expect(r).toMatchObject({
      command: 'TRIANGULATE',
      target: 'target-1',
      success: expect.any(Boolean),
      bandwidthCost: 3,
      clockEffect: 20,
      doctrinalTriggered: null,
      probability: 0.50,
      observerEffectApplied: false,
    });
    expect(typeof r.location).toBe('string');
    expect(typeof r.confidence).toBe('number');
    expect(typeof r.phantomRisk).toBe('boolean');
  });

  it('observerEffectApplied is false', () => {
    forceRoll(0.5);
    expect(triangulate('t').observerEffectApplied).toBe(false);
  });

  it('does not call saveClock', () => {
    forceRoll(0.5);
    triangulate('t');
    expect(saveClock).not.toHaveBeenCalled();
  });

  it('advances clock by 20 unconditionally', () => {
    forceRoll(0.5);
    triangulate('t');
    expect(advance).toHaveBeenCalledWith(20, 'TRIANGULATE');
  });
});

describe('triangulate() — Architect Aspect', () => {
  beforeEach(() => {
    anomalies.set({ aspects: ['THE_ARCHITECT'], manifestations: [] });
  });

  it('sets phantomRisk: true on failure', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99) // fail
      .mockReturnValueOnce(0.5); // confidence
    expect(triangulate('t').phantomRisk).toBe(true);
  });

  it('location shifts to SECTOR_NULL on failure', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.5);
    expect(triangulate('t').location).toBe('SECTOR_NULL');
  });

  it('phantomRisk is false on success even with Architect', () => {
    // success → find event, confidence 70-100
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.01) // success
      .mockReturnValueOnce(0.5); // confidence
    expect(triangulate('t').phantomRisk).toBe(false);
  });
});

describe('triangulate() — confidence', () => {
  it('confidence is 70–100 on success', () => {
    for (let i = 0; i < 20; i++) {
      bandwidth.set({ total: 100, spent: 0 });
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.01) // success
        .mockReturnValueOnce(Math.random()); // real random for confidence
      const r = triangulate('t');
      expect(r.confidence).toBeGreaterThanOrEqual(70);
      expect(r.confidence).toBeLessThanOrEqual(100);
      vi.restoreAllMocks();
    }
  });

  it('confidence is 0–30 on failure', () => {
    for (let i = 0; i < 20; i++) {
      bandwidth.set({ total: 100, spent: 0 });
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.99) // fail
        .mockReturnValueOnce(Math.random()); // real random for confidence
      const r = triangulate('t');
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(30);
      vi.restoreAllMocks();
    }
  });
});

// ── Bandwidth enforcement ─────────────────────────────────────────────────────

describe('bandwidth enforcement', () => {
  it('decode returns BANDWIDTH_EXCEEDED when spent + cost > total', () => {
    bandwidth.set({ total: 100, spent: 100 });
    const r = decode('ev-1');
    expect(r).toMatchObject({ success: false, reason: 'BANDWIDTH_EXCEEDED' });
  });

  it('verify returns BANDWIDTH_EXCEEDED', () => {
    bandwidth.set({ total: 100, spent: 97 }); // cost 4, 97+4=101 > 100
    const r = verify('ev-1');
    expect(r).toMatchObject({ success: false, reason: 'BANDWIDTH_EXCEEDED' });
  });

  it('triangulate returns BANDWIDTH_EXCEEDED', () => {
    bandwidth.set({ total: 100, spent: 98 }); // cost 3, 98+3=101 > 100
    const r = triangulate('ev-1');
    expect(r).toMatchObject({ success: false, reason: 'BANDWIDTH_EXCEEDED' });
  });

  it('does not call advance on bandwidth failure', () => {
    bandwidth.set({ total: 100, spent: 100 });
    decode('ev-1');
    expect(advance).not.toHaveBeenCalled();
  });

  it('does not call saveClock on bandwidth failure', () => {
    bandwidth.set({ total: 100, spent: 100 });
    decode('ev-1');
    expect(saveClock).not.toHaveBeenCalled();
  });
});

describe('terminal lock', () => {
  it('blocks tier 2 commands after TRANSCEND locks the terminal', () => {
    currentShift.set(TOTAL_SHIFTS - 1);
    awareness.set(AWARENESS_MAX);
    transcend();
    expect(() => verify('ev-1')).toThrow('TERMINAL_LOCKED');
  });
});
