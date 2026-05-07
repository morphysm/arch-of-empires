import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { feeds, clock, currentShift, anomalies } from '../src/core/store.js';

vi.mock('../src/core/clock.js', () => ({ advance: vi.fn() }));
vi.mock('../src/feeds/doctrinal.js', () => ({ triggerDoctrinal: vi.fn() }));

import { advance } from '../src/core/clock.js';
import { triggerDoctrinal } from '../src/feeds/doctrinal.js';
import {
  generateEvent,
  appendToFeed,
  ignoreCrisis,
  failedAuth,
} from '../src/feeds/tactical.js';

const EVENT_TYPES = [
  'MISSILE_LAUNCH', 'TROOP_MOVEMENT', 'STRIKE_AUTHORIZED',
  'LAUNCH_DETECTED', 'SATELLITE_ACTIVATED',
];

function toSec(t) {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

beforeEach(() => {
  feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
  clock.set({ time: '11:54:00', debtLedger: [] });
  currentShift.set(0);
  anomalies.set({ aspects: [], manifestations: [] });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Shape ────────────────────────────────────────────────────────────────────

describe('generateEvent() — shape', () => {
  it('returns an event with all required fields', () => {
    const event = generateEvent();
    expect(event).toMatchObject({
      id: expect.any(String),
      timestamp: expect.any(String),
      type: expect.stringMatching(
        /^(MISSILE_LAUNCH|TROOP_MOVEMENT|STRIKE_AUTHORIZED|LAUNCH_DETECTED|SATELLITE_ACTIVATED)$/
      ),
      origin: expect.any(String),
      content: expect.any(String),
      anomalyFlag: expect.any(Boolean),
      verified: false,
      shift: expect.any(Number),
    });
  });

  it('verified is always false on generation', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateEvent().verified).toBe(false);
    }
  });

  it('anomalyFlag is false with no active aspects', () => {
    for (let i = 0; i < 30; i++) {
      const e = generateEvent();
      if (e.type !== 'MISSILE_LAUNCH' && e.type !== 'LAUNCH_DETECTED') {
        expect(e.anomalyFlag).toBe(false);
      }
    }
  });

  it('shift matches currentShift store value', () => {
    currentShift.set(3);
    expect(generateEvent().shift).toBe(3);
  });

  it('SATELLITE_ACTIVATED events have origin UNKNOWN', () => {
    // Force SATELLITE_ACTIVATED: index 4, value ≥ 0.8
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9)  // type = index 4 = SATELLITE_ACTIVATED
      .mockReturnValueOnce(0.0); // content
    expect(generateEvent().origin).toBe('UNKNOWN');
  });

  it('LAUNCH_DETECTED events have null target', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.7)  // type = index 3 = LAUNCH_DETECTED
      .mockReturnValueOnce(0.0)  // origin
      .mockReturnValueOnce(0.0); // content
    expect(generateEvent().target).toBeNull();
  });

  it('SATELLITE_ACTIVATED events have null target', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.0);
    expect(generateEvent().target).toBeNull();
  });
});

// ─── All five types ───────────────────────────────────────────────────────────

describe('generateEvent() — all five event types', () => {
  it('can produce all five types across enough calls', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      seen.add(generateEvent().type);
      if (seen.size === 5) break;
    }
    expect(seen).toEqual(new Set(EVENT_TYPES));
  });
});

// ─── appendToFeed ─────────────────────────────────────────────────────────────

describe('appendToFeed()', () => {
  it('appends to feeds.tactical', () => {
    const event = generateEvent();
    appendToFeed(event);
    expect(get(feeds).tactical).toHaveLength(1);
    expect(get(feeds).tactical[0]).toBe(event);
  });

  it('does not touch other feed slices', () => {
    appendToFeed(generateEvent());
    const { diplomat, sigint, doctrinal } = get(feeds);
    expect(diplomat).toHaveLength(0);
    expect(sigint).toHaveLength(0);
    expect(doctrinal).toHaveLength(0);
  });
});

// ─── Architect Aspect ─────────────────────────────────────────────────────────

describe('Architect Aspect — phantom locations', () => {
  const PHANTOM_COORDS = ['GRID_00N_00E', 'GRID_UNKNOWN', 'GRID_REDACTED', 'SECTOR_NULL'];

  beforeEach(() => {
    anomalies.set({ aspects: ['THE_ARCHITECT'], manifestations: [] });
  });

  it('sets anomalyFlag: true on MISSILE_LAUNCH', () => {
    // type(0.05→0) → origin → target → content → which(<0.5→origin) → phantom
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.05) // MISSILE_LAUNCH (index 0)
      .mockReturnValueOnce(0.0)  // origin
      .mockReturnValueOnce(0.0)  // target
      .mockReturnValueOnce(0.0)  // content
      .mockReturnValueOnce(0.3)  // which: 0.3 < 0.5 → corrupt origin
      .mockReturnValueOnce(0.0); // phantom coord
    expect(generateEvent().anomalyFlag).toBe(true);
  });

  it('sets phantomLocation: true on MISSILE_LAUNCH', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.0);
    expect(generateEvent().phantomLocation).toBe(true);
  });

  it('corrupts origin on MISSILE_LAUNCH when which < 0.5', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.05) // MISSILE_LAUNCH
      .mockReturnValueOnce(0.0)  // real origin (overwritten)
      .mockReturnValueOnce(0.0)  // target
      .mockReturnValueOnce(0.0)  // content
      .mockReturnValueOnce(0.3)  // which: corrupt origin
      .mockReturnValueOnce(0.0); // phantom coord index 0 = 'GRID_00N_00E'
    const event = generateEvent();
    expect(PHANTOM_COORDS).toContain(event.origin);
  });

  it('corrupts target on MISSILE_LAUNCH when which >= 0.5', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.05) // MISSILE_LAUNCH
      .mockReturnValueOnce(0.0)  // origin
      .mockReturnValueOnce(0.0)  // target (overwritten)
      .mockReturnValueOnce(0.0)  // content
      .mockReturnValueOnce(0.7)  // which: 0.7 >= 0.5 → corrupt target
      .mockReturnValueOnce(0.0); // phantom coord
    const event = generateEvent();
    expect(PHANTOM_COORDS).toContain(event.target);
  });

  it('sets anomalyFlag: true on LAUNCH_DETECTED', () => {
    // type(0.7→3) → origin → content → phantom (no 'which' call)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.7)  // LAUNCH_DETECTED (index 3)
      .mockReturnValueOnce(0.0)  // origin (overwritten)
      .mockReturnValueOnce(0.0)  // content
      .mockReturnValueOnce(0.0); // phantom coord
    expect(generateEvent().anomalyFlag).toBe(true);
  });

  it('sets phantomLocation: true on LAUNCH_DETECTED', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0);
    expect(generateEvent().phantomLocation).toBe(true);
  });

  it('always corrupts origin on LAUNCH_DETECTED (no target to corrupt)', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.7)  // LAUNCH_DETECTED
      .mockReturnValueOnce(0.0)  // origin (overwritten)
      .mockReturnValueOnce(0.0)  // content
      .mockReturnValueOnce(0.0); // phantom coord
    const event = generateEvent();
    expect(PHANTOM_COORDS).toContain(event.origin);
    expect(event.target).toBeNull();
  });

  it('does not set phantomLocation on TROOP_MOVEMENT', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.3)  // TROOP_MOVEMENT (index 1)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0);
    const event = generateEvent();
    expect(event.phantomLocation).toBeUndefined();
    expect(event.anomalyFlag).toBe(false);
  });
});

// ─── Predictor Aspect ─────────────────────────────────────────────────────────

describe('Predictor Aspect — future timestamps on LAUNCH_DETECTED', () => {
  beforeEach(() => {
    anomalies.set({ aspects: ['THE_PREDICTOR'], manifestations: [] });
    clock.set({ time: '11:54:00', debtLedger: [] });
  });

  it('LAUNCH_DETECTED timestamp is 2–5 minutes ahead of clock time', () => {
    // type(0.7→3) → offset(randomInt 120-300) → origin → content
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.7)  // LAUNCH_DETECTED
      .mockReturnValueOnce(0.5)  // offset: floor(0.5*181)+120 = 210s
      .mockReturnValueOnce(0.0)  // origin
      .mockReturnValueOnce(0.0); // content
    const event = generateEvent();
    const delta = toSec(event.timestamp) - toSec('11:54:00');
    expect(delta).toBeGreaterThanOrEqual(120);
    expect(delta).toBeLessThanOrEqual(300);
  });

  it('LAUNCH_DETECTED timestamp is strictly ahead of current clock time', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0);
    expect(generateEvent().timestamp).not.toBe('11:54:00');
  });

  it('non-LAUNCH_DETECTED events keep the current clock timestamp', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.05) // MISSILE_LAUNCH — Predictor does NOT apply
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0);
    expect(generateEvent().timestamp).toBe('11:54:00');
  });
});

// ─── Brahmastra ───────────────────────────────────────────────────────────────

describe('brahmastra flag — high-yield strike events', () => {
  it('sets brahmastra: true on STRIKE_AUTHORIZED when random < 0.3', () => {
    // type(0.5→2) → origin → target → content → brahmastra check
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)  // STRIKE_AUTHORIZED (index 2)
      .mockReturnValueOnce(0.0)  // origin
      .mockReturnValueOnce(0.0)  // target
      .mockReturnValueOnce(0.0)  // content
      .mockReturnValueOnce(0.1); // brahmastra: 0.1 < 0.3 → true
    expect(generateEvent().brahmastra).toBe(true);
  });

  it('does not set brahmastra when random >= 0.3', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.8); // 0.8 >= 0.3 → false
    const event = generateEvent();
    expect(event.brahmastra).toBeUndefined();
  });

  it('brahmastra is never set on non-STRIKE_AUTHORIZED events', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.05) // MISSILE_LAUNCH
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.3)  // Architect which (if Architect active — it's not)
      .mockReturnValueOnce(0.0);
    const event = generateEvent();
    expect(event.brahmastra).toBeUndefined();
  });
});

// ─── Clock side effects ───────────────────────────────────────────────────────

describe('ignoreCrisis()', () => {
  it('advances clock by 3 with source IGNORED_CRISIS', () => {
    ignoreCrisis();
    expect(advance).toHaveBeenCalledWith(3, 'IGNORED_CRISIS');
  });

  it('calls advance exactly once', () => {
    ignoreCrisis();
    expect(advance).toHaveBeenCalledOnce();
  });
});

describe('failedAuth()', () => {
  it('advances clock by 5 with source FAILED_AUTH', () => {
    failedAuth();
    expect(advance).toHaveBeenCalledWith(5, 'FAILED_AUTH');
  });
});

// ─── Doctrinal trigger ────────────────────────────────────────────────────────

describe('SATELLITE_ACTIVATED — doctrinal trigger', () => {
  it('calls triggerDoctrinal with REV_8_10 on SATELLITE_ACTIVATED', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9)  // SATELLITE_ACTIVATED (index 4)
      .mockReturnValueOnce(0.0); // content
    generateEvent();
    expect(triggerDoctrinal).toHaveBeenCalledWith('REV_8_10');
  });

  it('calls triggerDoctrinal exactly once per SATELLITE_ACTIVATED event', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.0);
    generateEvent();
    expect(triggerDoctrinal).toHaveBeenCalledOnce();
  });

  it('does not call triggerDoctrinal for other event types', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.05) // MISSILE_LAUNCH
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0);
    generateEvent();
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });
});
