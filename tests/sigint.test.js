import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { feeds, clock, currentShift, anomalies } from '../src/core/store.js';

vi.mock('../src/core/clock.js', () => ({ advance: vi.fn() }));
vi.mock('../src/feeds/doctrinal.js', () => ({ triggerDoctrinal: vi.fn() }));
vi.mock('../src/core/persistence.js', () => ({
  loadGhostSignals: vi.fn(),
  saveGhostSignal: vi.fn(),
  saveClock: vi.fn(),
  loadClock: vi.fn(),
  _resetDB: vi.fn(),
}));

import { advance } from '../src/core/clock.js';
import { triggerDoctrinal } from '../src/feeds/doctrinal.js';
import { loadGhostSignals } from '../src/core/persistence.js';
import {
  AGENTS,
  generateEvent,
  appendToFeed,
  loadGhosts,
  ghostIgnored,
  falseFlagExposed,
} from '../src/feeds/sigint.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// AGENTS array: index 2 = IRONBELL (kia: true), index 4 = NIGHTJAR (kia: true)
// pickRandom(arr) = arr[Math.floor(Math.random() * arr.length)]
// To force index I from array of length N: mock value = I / N

function agentValue(index) {
  return index / AGENTS.length + 0.001; // nudge above exact boundary
}

const EVENT_TYPES = [
  'INTERCEPT', 'DECRYPT', 'DEAD_DROP', 'GHOST_SIGNAL', 'FUTURE_TIMESTAMP',
];

// Force type index I out of 5
function typeValue(index) {
  return index / 5 + 0.001;
}

beforeEach(() => {
  feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
  clock.set({ time: '11:54:00', debtLedger: [] });
  currentShift.set(0);
  anomalies.set({ aspects: [], manifestations: [] });
  vi.clearAllMocks();
  loadGhostSignals.mockResolvedValue([]);
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
        /^(INTERCEPT|DECRYPT|DEAD_DROP|GHOST_SIGNAL|FUTURE_TIMESTAMP)$/
      ),
      source: expect.any(String),
      content: expect.any(String),
      anomalyFlag: expect.any(Boolean),
      verified: false,
      isGhost: false,
      shift: expect.any(Number),
    });
  });

  it('isGhost is always false on live-generated events', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateEvent().isGhost).toBe(false);
    }
  });

  it('verified is always false on generation', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateEvent().verified).toBe(false);
    }
  });

  it('timestamp matches current clock time', () => {
    clock.set({ time: '11:57:30', debtLedger: [] });
    expect(generateEvent().timestamp).toBe('11:57:30');
  });

  it('shift matches currentShift store value', () => {
    currentShift.set(5);
    expect(generateEvent().shift).toBe(5);
  });

  it('can produce all five event types', () => {
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      seen.add(generateEvent().type);
      if (seen.size === 5) break;
    }
    expect(seen).toEqual(new Set(EVENT_TYPES));
  });

  it('source is always a known agent name', () => {
    const agentNames = AGENTS.map(a => a.name);
    for (let i = 0; i < 20; i++) {
      expect(agentNames).toContain(generateEvent().source);
    }
  });
});

// ─── appendToFeed ─────────────────────────────────────────────────────────────

describe('appendToFeed()', () => {
  it('appends to feeds.sigint', () => {
    const event = generateEvent();
    appendToFeed(event);
    expect(get(feeds).sigint).toHaveLength(1);
    expect(get(feeds).sigint[0]).toBe(event);
  });

  it('does not touch other feed slices', () => {
    appendToFeed(generateEvent());
    expect(get(feeds).diplomat).toHaveLength(0);
    expect(get(feeds).tactical).toHaveLength(0);
    expect(get(feeds).doctrinal).toHaveLength(0);
  });
});

// ─── KIA agent signals ────────────────────────────────────────────────────────

describe('KIA agent signals', () => {
  // IRONBELL is at index 2 of AGENTS (kia: true)
  // Force: type(any) → agent(IRONBELL) → content

  it('sets anomalyFlag: true when source agent is KIA', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(typeValue(0))    // INTERCEPT
      .mockReturnValueOnce(agentValue(2))   // IRONBELL (KIA)
      .mockReturnValueOnce(0.0);            // content index 0
    expect(generateEvent().anomalyFlag).toBe(true);
  });

  it('calls triggerDoctrinal with GITA_SOUL_NEVER_DIES for KIA agent', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(typeValue(0))
      .mockReturnValueOnce(agentValue(2))
      .mockReturnValueOnce(0.0);
    generateEvent();
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_SOUL_NEVER_DIES');
  });

  it('calls triggerDoctrinal exactly once per KIA signal', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(typeValue(0))
      .mockReturnValueOnce(agentValue(2))
      .mockReturnValueOnce(0.0);
    generateEvent();
    expect(triggerDoctrinal).toHaveBeenCalledOnce();
  });

  it('does not call triggerDoctrinal for live agents', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(typeValue(0))
      .mockReturnValueOnce(agentValue(0))  // VECTOR (not KIA)
      .mockReturnValueOnce(0.0);
    generateEvent();
    expect(triggerDoctrinal).not.toHaveBeenCalled();
  });

  it('content still reads as normal operational traffic for KIA agents', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(typeValue(0))
      .mockReturnValueOnce(agentValue(2))
      .mockReturnValueOnce(0.0);
    const event = generateEvent();
    // KIA agent's source is their name, not a death marker
    expect(event.source).toBe('IRONBELL');
    expect(event.content.length).toBeGreaterThan(0);
  });
});

// ─── Memetic Aspect ───────────────────────────────────────────────────────────

describe('Memetic Aspect — DECRYPT spread', () => {
  beforeEach(() => {
    anomalies.set({ aspects: ['THE_MEMETIC'], manifestations: [] });
  });

  it('marks a DECRYPT event with memetic: true when memetic words are present', () => {
    // Force DECRYPT (index 1) + live agent + content index 0 (has ASSET, COMPROMISED)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(typeValue(1))   // DECRYPT
      .mockReturnValueOnce(agentValue(0))  // VECTOR (live)
      .mockReturnValueOnce(0.0)            // content index 0
      .mockReturnValueOnce(0.0);           // spread target: diplomat
    const event = generateEvent();
    expect(event.memetic).toBe(true);
  });

  it('appends a copy to an adjacent feed with memeticSpread: true', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(typeValue(1))
      .mockReturnValueOnce(agentValue(0))
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0);  // spread to diplomat
    generateEvent();
    expect(get(feeds).diplomat).toHaveLength(1);
    expect(get(feeds).diplomat[0].memeticSpread).toBe(true);
  });

  it('spread copy has the same content as the original', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(typeValue(1))
      .mockReturnValueOnce(agentValue(0))
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.0);
    const event = generateEvent();
    expect(get(feeds).diplomat[0].content).toBe(event.content);
  });

  it('can spread to tactical feed', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(typeValue(1))
      .mockReturnValueOnce(agentValue(0))
      .mockReturnValueOnce(0.0)
      .mockReturnValueOnce(0.7);  // spread to tactical
    generateEvent();
    expect(get(feeds).tactical).toHaveLength(1);
    expect(get(feeds).tactical[0].memeticSpread).toBe(true);
  });

  it('non-DECRYPT events are not spread', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(typeValue(0))   // INTERCEPT
      .mockReturnValueOnce(agentValue(0))
      .mockReturnValueOnce(0.0);
    generateEvent();
    expect(get(feeds).diplomat).toHaveLength(0);
    expect(get(feeds).tactical).toHaveLength(0);
  });
});

// ─── loadGhosts() ─────────────────────────────────────────────────────────────

describe('loadGhosts()', () => {
  it('injects ghost signals into feeds.sigint marked isGhost: true', async () => {
    loadGhostSignals.mockResolvedValue([
      { id: 'g-1', aspectId: 'THE_MIMIC', ignoredAt: 1000 },
    ]);
    await loadGhosts();
    const feed = get(feeds).sigint;
    expect(feed).toHaveLength(1);
    expect(feed[0].isGhost).toBe(true);
  });

  it('injects all ghost signals from the previous run', async () => {
    loadGhostSignals.mockResolvedValue([
      { id: 'g-1', aspectId: 'THE_MIMIC' },
      { id: 'g-2', aspectId: 'THE_PREDICTOR' },
      { id: 'g-3', aspectId: 'THE_DISSOLVER' },
    ]);
    await loadGhosts();
    expect(get(feeds).sigint).toHaveLength(3);
  });

  it('preserves the original ghost signal id', async () => {
    loadGhostSignals.mockResolvedValue([{ id: 'original-id-abc' }]);
    await loadGhosts();
    expect(get(feeds).sigint[0].id).toBe('original-id-abc');
  });

  it('returns an empty array and does not modify feed when no ghosts exist', async () => {
    loadGhostSignals.mockResolvedValue([]);
    const result = await loadGhosts();
    expect(result).toEqual([]);
    expect(get(feeds).sigint).toHaveLength(0);
  });

  it('ghost events have type GHOST_SIGNAL', async () => {
    loadGhostSignals.mockResolvedValue([{ id: 'g-1' }]);
    await loadGhosts();
    expect(get(feeds).sigint[0].type).toBe('GHOST_SIGNAL');
  });

  it('ghost events have anomalyFlag: true', async () => {
    loadGhostSignals.mockResolvedValue([{ id: 'g-1' }]);
    await loadGhosts();
    expect(get(feeds).sigint[0].anomalyFlag).toBe(true);
  });
});

// ─── Ghost signals indistinguishable from live ────────────────────────────────

describe('ghost signals — shape indistinguishable from live signals', () => {
  it('ghost event has all the same top-level fields as a live event', async () => {
    loadGhostSignals.mockResolvedValue([{ id: 'g-1' }]);
    await loadGhosts();
    const ghost = get(feeds).sigint[0];
    const live = generateEvent();

    const ghostKeys = Object.keys(ghost).sort();
    // ghost has isGhost: true, live has isGhost: false — the field exists on both
    expect(ghostKeys).toContain('id');
    expect(ghostKeys).toContain('timestamp');
    expect(ghostKeys).toContain('type');
    expect(ghostKeys).toContain('source');
    expect(ghostKeys).toContain('content');
    expect(ghostKeys).toContain('anomalyFlag');
    expect(ghostKeys).toContain('verified');
    expect(ghostKeys).toContain('isGhost');
    expect(ghostKeys).toContain('shift');
    expect(Object.keys(live).sort()).toEqual(ghostKeys);
  });

  it('ghost event verified is false', async () => {
    loadGhostSignals.mockResolvedValue([{ id: 'g-1' }]);
    await loadGhosts();
    expect(get(feeds).sigint[0].verified).toBe(false);
  });
});

// ─── Clock side effects ───────────────────────────────────────────────────────

describe('ghostIgnored()', () => {
  it('advances clock by 2 with source GHOST_IGNORED', () => {
    ghostIgnored();
    expect(advance).toHaveBeenCalledWith(2, 'GHOST_IGNORED');
  });
});

describe('falseFlagExposed()', () => {
  it('advances clock by -5 with source FALSE_FLAG_EXPOSED', () => {
    falseFlagExposed();
    expect(advance).toHaveBeenCalledWith(-5, 'FALSE_FLAG_EXPOSED');
  });
});
