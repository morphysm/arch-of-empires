import { vi, describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { anomalies, awareness, nature } from '../src/core/store.js';

vi.mock('../src/core/clock.js', () => ({ advance: vi.fn() }));
vi.mock('../src/core/persistence.js', () => ({ saveGhostSignal: vi.fn() }));

import { advance } from '../src/core/clock.js';
import { saveGhostSignal } from '../src/core/persistence.js';
import {
  ASPECT_DECK,
  ASPECT_NATURE,
  drawAspects,
  manifestAnomaly,
  acknowledgeAnomaly,
  ignoreAnomaly,
} from '../src/core/anomaly.js';

beforeEach(() => {
  anomalies.set({ aspects: [], manifestations: [] });
  awareness.set(0);
  nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
  vi.clearAllMocks();
});

describe('drawAspects()', () => {
  it('returns 2 or 3 aspects', () => {
    for (let i = 0; i < 30; i++) {
      const drawn = drawAspects();
      expect(drawn.length).toBeGreaterThanOrEqual(2);
      expect(drawn.length).toBeLessThanOrEqual(3);
    }
  });

  it('only draws from the valid deck', () => {
    for (let i = 0; i < 30; i++) {
      drawAspects().forEach(a => expect(ASPECT_DECK).toContain(a));
    }
  });

  it('never draws duplicate aspects in a single draw', () => {
    for (let i = 0; i < 30; i++) {
      const drawn = drawAspects();
      expect(new Set(drawn).size).toBe(drawn.length);
    }
  });

  it('writes drawn aspects to the store', () => {
    const drawn = drawAspects();
    expect(get(anomalies).aspects).toEqual(drawn);
  });
});

describe('manifestAnomaly()', () => {
  beforeEach(() => {
    drawAspects();
  });

  it('every manifestation has an aspectId traceable to the drawn aspects', () => {
    const { aspects } = get(anomalies);
    const m = manifestAnomaly();
    expect(aspects).toContain(m.aspectId);
  });

  it('appends one manifestation to the store per call', () => {
    manifestAnomaly();
    manifestAnomaly();
    expect(get(anomalies).manifestations).toHaveLength(2);
  });

  it('manifestation starts with acknowledged: false and ignored: false', () => {
    const m = manifestAnomaly();
    expect(m.acknowledged).toBe(false);
    expect(m.ignored).toBe(false);
  });

  it('advances the clock with source ANOMALY', () => {
    manifestAnomaly();
    expect(advance).toHaveBeenCalledWith(expect.any(Number), 'ANOMALY');
  });

  it('advances the clock by 1–10 seconds', () => {
    for (let i = 0; i < 30; i++) {
      vi.clearAllMocks();
      manifestAnomaly();
      const seconds = advance.mock.calls[0][0];
      expect(seconds).toBeGreaterThanOrEqual(1);
      expect(seconds).toBeLessThanOrEqual(10);
    }
  });

  it('increments the correct nature dimension for the aspect', () => {
    const m = manifestAnomaly();
    const dim = ASPECT_NATURE[m.aspectId];
    expect(get(nature)[dim]).toBe(1);
  });

  it('does not increment nature dimensions not tied to the aspect', () => {
    const m = manifestAnomaly();
    const dim = ASPECT_NATURE[m.aspectId];
    const others = Object.keys(get(nature)).filter(k => k !== dim);
    others.forEach(k => expect(get(nature)[k]).toBe(0));
  });

  it('manifestation has a unique id each call', () => {
    const ids = Array.from({ length: 10 }, () => manifestAnomaly().id);
    expect(new Set(ids).size).toBe(10);
  });
});

describe('acknowledgeAnomaly()', () => {
  beforeEach(() => {
    drawAspects();
  });

  it('raises awareness by 1', () => {
    const m = manifestAnomaly();
    acknowledgeAnomaly(m.id);
    expect(get(awareness)).toBe(1);
  });

  it('marks the correct manifestation as acknowledged', () => {
    const m = manifestAnomaly();
    acknowledgeAnomaly(m.id);
    const found = get(anomalies).manifestations.find(x => x.id === m.id);
    expect(found.acknowledged).toBe(true);
  });

  it('does not mark other manifestations as acknowledged', () => {
    const m1 = manifestAnomaly();
    const m2 = manifestAnomaly();
    acknowledgeAnomaly(m1.id);
    const other = get(anomalies).manifestations.find(x => x.id === m2.id);
    expect(other.acknowledged).toBe(false);
  });

  it('does not call saveGhostSignal', () => {
    const m = manifestAnomaly();
    acknowledgeAnomaly(m.id);
    expect(saveGhostSignal).not.toHaveBeenCalled();
  });
});

describe('ignoreAnomaly()', () => {
  beforeEach(() => {
    drawAspects();
  });

  it('marks the manifestation as ignored', () => {
    const m = manifestAnomaly();
    ignoreAnomaly(m.id);
    const found = get(anomalies).manifestations.find(x => x.id === m.id);
    expect(found.ignored).toBe(true);
  });

  it('calls saveGhostSignal exactly once', () => {
    const m = manifestAnomaly();
    ignoreAnomaly(m.id);
    expect(saveGhostSignal).toHaveBeenCalledOnce();
  });

  it('passes the manifestation id and aspectId to saveGhostSignal', () => {
    const m = manifestAnomaly();
    ignoreAnomaly(m.id);
    const arg = saveGhostSignal.mock.calls[0][0];
    expect(arg.id).toBe(m.id);
    expect(arg.aspectId).toBe(m.aspectId);
  });

  it('ghost signal has ignored: true', () => {
    const m = manifestAnomaly();
    ignoreAnomaly(m.id);
    expect(saveGhostSignal.mock.calls[0][0].ignored).toBe(true);
  });

  it('ghost signal includes a numeric ignoredAt timestamp', () => {
    const before = Date.now();
    const m = manifestAnomaly();
    ignoreAnomaly(m.id);
    const after = Date.now();
    const { ignoredAt } = saveGhostSignal.mock.calls[0][0];
    expect(ignoredAt).toBeGreaterThanOrEqual(before);
    expect(ignoredAt).toBeLessThanOrEqual(after);
  });

  it('does not raise awareness', () => {
    const m = manifestAnomaly();
    ignoreAnomaly(m.id);
    expect(get(awareness)).toBe(0);
  });
});
