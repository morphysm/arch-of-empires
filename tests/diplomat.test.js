import { vi, describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { feeds, clock, currentShift, anomalies } from '../src/core/store.js';

vi.mock('../src/core/clock.js', () => ({ advance: vi.fn() }));

import { advance } from '../src/core/clock.js';
import { generateEvent, appendToFeed, _resetMimicEcho } from '../src/feeds/diplomat.js';

const EVENT_TYPES = ['TREATY', 'PRESIDENTIAL_CALL', 'CEASEFIRE', 'SANCTION'];

function toSec(t) {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

beforeEach(() => {
  feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
  clock.set({ time: '11:54:00', debtLedger: [] });
  currentShift.set(0);
  anomalies.set({ aspects: [], manifestations: [] });
  _resetMimicEcho();
  vi.clearAllMocks();
});

describe('generateEvent() — shape', () => {
  it('returns an event with all required fields', () => {
    const event = generateEvent();
    expect(event).toMatchObject({
      id: expect.any(String),
      timestamp: expect.any(String),
      type: expect.stringMatching(/^(TREATY|PRESIDENTIAL_CALL|CEASEFIRE|SANCTION)$/),
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

  it('shift matches currentShift store value', () => {
    currentShift.set(4);
    expect(generateEvent().shift).toBe(4);
  });

  it('timestamp matches current clock time when no aspects are active', () => {
    expect(generateEvent().timestamp).toBe('11:54:00');
  });

  it('anomalyFlag is false with no active aspects', () => {
    for (let i = 0; i < 20; i++) {
      const e = generateEvent();
      if (e.type !== 'PRESIDENTIAL_CALL') {
        expect(e.anomalyFlag).toBe(false);
      }
    }
  });
});

describe('generateEvent() — all four event types', () => {
  it('can produce all four types across enough calls', () => {
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      seen.add(generateEvent().type);
      if (seen.size === 4) break;
    }
    expect(seen).toEqual(new Set(EVENT_TYPES));
  });
});

describe('appendToFeed()', () => {
  it('appends the event to feeds.diplomat', () => {
    const event = generateEvent();
    appendToFeed(event);
    expect(get(feeds).diplomat).toHaveLength(1);
    expect(get(feeds).diplomat[0]).toBe(event);
  });

  it('accumulates events in order', () => {
    const e1 = generateEvent();
    const e2 = generateEvent();
    appendToFeed(e1);
    appendToFeed(e2);
    const feed = get(feeds).diplomat;
    expect(feed[0]).toBe(e1);
    expect(feed[1]).toBe(e2);
  });
});

describe('Mimic Aspect — PRESIDENTIAL_CALL corruption', () => {
  beforeEach(() => {
    anomalies.set({ aspects: ['THE_MIMIC'], manifestations: [] });
  });

  it('sets anomalyFlag: true on PRESIDENTIAL_CALL events', () => {
    let found = null;
    for (let i = 0; i < 100; i++) {
      const e = generateEvent();
      if (e.type === 'PRESIDENTIAL_CALL') { found = e; break; }
    }
    expect(found).not.toBeNull();
    expect(found.anomalyFlag).toBe(true);
  });

  it('appends [DELAY: 0.3s] to the content of PRESIDENTIAL_CALL events', () => {
    let found = null;
    for (let i = 0; i < 100; i++) {
      const e = generateEvent();
      if (e.type === 'PRESIDENTIAL_CALL') { found = e; break; }
    }
    expect(found.content).toContain('[DELAY: 0.3s]');
  });

  it('non-PRESIDENTIAL_CALL events are not corrupted by Mimic', () => {
    for (let i = 0; i < 50; i++) {
      const e = generateEvent();
      if (e.type !== 'PRESIDENTIAL_CALL') {
        expect(e.anomalyFlag).toBe(false);
        expect(e.content).not.toContain('[DELAY: 0.3s]');
      }
    }
  });

  it('echo auto-appends to feed within 3 events after a corrupted call', () => {
    // Force PRESIDENTIAL_CALL as first event, countdown = 1
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.3)  // type index 1 = PRESIDENTIAL_CALL
      .mockReturnValueOnce(0.0)  // raw content index 0
      .mockReturnValueOnce(0.0)  // countdown: Math.floor(0*3)+1 = 1
      .mockReturnValueOnce(0.0)  // echo content (picks from filtered pool)
      .mockReturnValueOnce(0.1)  // next type = TREATY (index 0)
      .mockReturnValueOnce(0.0); // next content

    const corrupted = generateEvent();
    appendToFeed(corrupted);
    expect(corrupted.type).toBe('PRESIDENTIAL_CALL');
    expect(corrupted.anomalyFlag).toBe(true);

    // Next call: countdown was 1 → decrements to 0 → echo fires automatically
    const next = generateEvent();
    appendToFeed(next);

    const feed = get(feeds).diplomat;
    expect(feed).toHaveLength(3); // corrupted + echo (auto) + next
    const echo = feed[1];
    expect(echo.type).toBe('PRESIDENTIAL_CALL');
    expect(echo.anomalyFlag).toBe(true);
    expect(echo.content).toContain('[DELAY: 0.3s]');
    expect(echo.content).not.toBe(corrupted.content);
  });
});

describe('Predictor Aspect — future timestamps', () => {
  it('generates timestamps 2–5 minutes ahead of the current clock time', () => {
    anomalies.set({ aspects: ['THE_PREDICTOR'], manifestations: [] });
    clock.set({ time: '11:54:00', debtLedger: [] });

    for (let i = 0; i < 10; i++) {
      const event = generateEvent();
      const clockSec = toSec('11:54:00');
      const eventSec = toSec(event.timestamp);
      expect(eventSec - clockSec).toBeGreaterThanOrEqual(120);
      expect(eventSec - clockSec).toBeLessThanOrEqual(300);
    }
  });

  it('timestamp is different from current clock time', () => {
    anomalies.set({ aspects: ['THE_PREDICTOR'], manifestations: [] });
    const event = generateEvent();
    expect(event.timestamp).not.toBe('11:54:00');
  });
});

describe('failed diplomacy — clock advance', () => {
  it('advances clock by 5 seconds with source FAILED_DIPLOMACY on ceasefire collapse', () => {
    anomalies.set({ aspects: [], manifestations: [] });

    // With no aspects active, call order: type select → content → collapse check
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.6)  // Math.floor(0.6*4) = 2 → CEASEFIRE
      .mockReturnValueOnce(0.0)  // content index
      .mockReturnValueOnce(0.2); // 0.2 < 0.4 → collapse

    generateEvent();
    expect(advance).toHaveBeenCalledWith(5, 'FAILED_DIPLOMACY');
  });

  it('does not advance clock when ceasefire does not collapse', () => {
    anomalies.set({ aspects: [], manifestations: [] });

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.6)  // CEASEFIRE
      .mockReturnValueOnce(0.0)  // content
      .mockReturnValueOnce(0.9); // 0.9 >= 0.4 → no collapse

    generateEvent();
    expect(advance).not.toHaveBeenCalled();
  });

  it('does not advance clock for non-CEASEFIRE events', () => {
    anomalies.set({ aspects: [], manifestations: [] });

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)  // TREATY
      .mockReturnValueOnce(0.0); // content

    generateEvent();
    expect(advance).not.toHaveBeenCalled();
  });
});
