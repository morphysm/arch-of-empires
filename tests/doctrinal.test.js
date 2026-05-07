import { vi, describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { feeds, clock, currentShift } from '../src/core/store.js';

vi.mock('../src/core/clock.js', () => ({ advance: vi.fn() }));

import { advance } from '../src/core/clock.js';
import {
  FRAGMENTS,
  triggerDoctrinal,
  checkCoherenceCollapse,
  _resetCoherenceTracker,
} from '../src/feeds/doctrinal.js';

const ALL_KEYS = [
  'MORPHYSM_WAR_TORN_SOIL', 'MORPHYSM_COMBATANTS_ANOMALIES', 'MORPHYSM_TULPAS',
  'MORPHYSM_HOMO_MACHINA', 'MORPHYSM_AUTONOMOUS_AI', 'MORPHYSM_MACHINE_HEAD',
  'MORPHYSM_EARTH_DETONATES',
  'REV_6_1', 'REV_6_3', 'REV_6_12', 'REV_8_10', 'REV_13_16',
  'REV_16_12', 'REV_17_8', 'REV_21_1', 'REV_22_13',
  'GITA_LIMBS_FAIL', 'GITA_DUTY_WITHOUT_ATTACHMENT', 'GITA_SOUL_NEVER_DIES',
  'GITA_TIME_I_AM', 'GITA_OWN_DUTIES', 'GITA_PRETENDER', 'GITA_LOTUS_LEAF',
];

beforeEach(() => {
  feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
  clock.set({ time: '11:54:00', debtLedger: [] });
  currentShift.set(0);
  _resetCoherenceTracker();
  vi.clearAllMocks();
});

// ─── Fragment table completeness ──────────────────────────────────────────────

describe('FRAGMENTS table — completeness', () => {
  it('defines all 23 required keys', () => {
    ALL_KEYS.forEach(key => {
      expect(FRAGMENTS[key], `missing key: ${key}`).toBeDefined();
    });
  });

  it('every fragment has a non-empty content string', () => {
    ALL_KEYS.forEach(key => {
      expect(FRAGMENTS[key].content.length, `empty content for: ${key}`).toBeGreaterThan(0);
    });
  });

  it('every fragment has a tradition field', () => {
    ALL_KEYS.forEach(key => {
      expect(['MORPHYSM', 'REVELATION', 'GITA']).toContain(FRAGMENTS[key].tradition);
    });
  });

  it('every fragment has a targetFeed field pointing to a valid feed slice', () => {
    const validFeeds = ['diplomat', 'tactical', 'sigint'];
    ALL_KEYS.forEach(key => {
      expect(validFeeds, `invalid targetFeed for: ${key}`).toContain(FRAGMENTS[key].targetFeed);
    });
  });

  it('all 7 MORPHYSM keys map to tradition MORPHYSM', () => {
    const morphysmKeys = ALL_KEYS.filter(k => k.startsWith('MORPHYSM_'));
    expect(morphysmKeys).toHaveLength(7);
    morphysmKeys.forEach(k => expect(FRAGMENTS[k].tradition).toBe('MORPHYSM'));
  });

  it('all 9 REVELATION keys map to tradition REVELATION', () => {
    const revKeys = ALL_KEYS.filter(k => k.startsWith('REV_'));
    expect(revKeys).toHaveLength(9);
    revKeys.forEach(k => expect(FRAGMENTS[k].tradition).toBe('REVELATION'));
  });

  it('all 7 GITA keys map to tradition GITA', () => {
    const gitaKeys = ALL_KEYS.filter(k => k.startsWith('GITA_'));
    expect(gitaKeys).toHaveLength(7);
    gitaKeys.forEach(k => expect(FRAGMENTS[k].tradition).toBe('GITA'));
  });
});

// ─── triggerDoctrinal() — event shape ─────────────────────────────────────────

describe('triggerDoctrinal() — event shape', () => {
  it('returns an event with all required fields', () => {
    const event = triggerDoctrinal('REV_8_10');
    expect(event).toMatchObject({
      id: expect.any(String),
      timestamp: expect.any(String),
      tradition: 'REVELATION',
      fragmentKey: 'REV_8_10',
      content: expect.any(String),
      shift: expect.any(Number),
      anomalyFlag: true,
      isDoctrinal: true,
    });
  });

  it('anomalyFlag is always true for every fragment', () => {
    ALL_KEYS.forEach(key => {
      _resetCoherenceTracker();
      expect(triggerDoctrinal(key).anomalyFlag).toBe(true);
    });
  });

  it('appends the event to its targetFeed — REV_8_10 goes to tactical', () => {
    triggerDoctrinal('REV_8_10');
    expect(get(feeds).tactical).toHaveLength(1);
    expect(get(feeds).doctrinal).toHaveLength(0); // doctrinal slice stays empty
  });

  it('appends the event to its targetFeed — GITA_SOUL_NEVER_DIES goes to sigint', () => {
    triggerDoctrinal('GITA_SOUL_NEVER_DIES');
    expect(get(feeds).sigint).toHaveLength(1);
  });

  it('appends the event to its targetFeed — REV_6_3 goes to diplomat', () => {
    triggerDoctrinal('REV_6_3');
    expect(get(feeds).diplomat).toHaveLength(1);
  });

  it('events across different target feeds accumulate independently', () => {
    triggerDoctrinal('REV_8_10');          // → tactical
    triggerDoctrinal('GITA_SOUL_NEVER_DIES'); // → sigint
    expect(get(feeds).tactical).toHaveLength(1);
    expect(get(feeds).sigint).toHaveLength(1);
    expect(get(feeds).tactical[0].fragmentKey).toBe('REV_8_10');
    expect(get(feeds).sigint[0].fragmentKey).toBe('GITA_SOUL_NEVER_DIES');
  });

  it('injected event has isDoctrinal: true', () => {
    triggerDoctrinal('REV_8_10');
    expect(get(feeds).tactical[0].isDoctrinal).toBe(true);
  });

  it('returns null for an unknown key', () => {
    expect(triggerDoctrinal('NONEXISTENT_KEY')).toBeNull();
  });

  it('does not append to any feed for an unknown key', () => {
    triggerDoctrinal('NONEXISTENT_KEY');
    const f = get(feeds);
    expect(f.diplomat).toHaveLength(0);
    expect(f.tactical).toHaveLength(0);
    expect(f.sigint).toHaveLength(0);
    expect(f.doctrinal).toHaveLength(0);
  });

  it('timestamp matches current clock time', () => {
    clock.set({ time: '11:58:00', debtLedger: [] });
    const event = triggerDoctrinal('REV_6_1');
    expect(event.timestamp).toBe('11:58:00');
  });

  it('shift matches currentShift store value', () => {
    currentShift.set(3);
    expect(triggerDoctrinal('REV_6_1').shift).toBe(3);
  });
});

// ─── MORPHYSM_EARTH_DETONATES ─────────────────────────────────────────────────

describe('MORPHYSM_EARTH_DETONATES', () => {
  it('content is exactly EARTH DOES NOT ASCEND.', () => {
    expect(FRAGMENTS.MORPHYSM_EARTH_DETONATES.content).toBe('EARTH DOES NOT ASCEND.');
  });

  it('content contains nothing beyond EARTH DOES NOT ASCEND.', () => {
    expect(FRAGMENTS.MORPHYSM_EARTH_DETONATES.content).toHaveLength('EARTH DOES NOT ASCEND.'.length);
  });
});

// ─── Revelation verbatim ──────────────────────────────────────────────────────

describe('Revelation verses — verbatim from GDD', () => {
  it('REV_6_1 is verbatim', () => {
    expect(FRAGMENTS.REV_6_1.content).toBe(
      'I watched as the Lamb opened the first seal... a white horse. Its rider held a bow... He rode out as a conqueror bent on conquest.'
    );
  });

  it('REV_6_3 is verbatim', () => {
    expect(FRAGMENTS.REV_6_3.content).toBe(
      'Its rider was given power to take peace from the earth and to make people kill each other.'
    );
  });

  it('REV_6_12 is verbatim', () => {
    expect(FRAGMENTS.REV_6_12.content).toBe(
      'There was a great earthquake. The sun turned black... every mountain and island was removed from its place.'
    );
  });

  it('REV_8_10 is verbatim', () => {
    expect(FRAGMENTS.REV_8_10.content).toBe(
      'A great star, blazing like a torch, fell from the sky... The name of the star is Wormwood.'
    );
  });

  it('REV_13_16 is verbatim', () => {
    expect(FRAGMENTS.REV_13_16.content).toBe(
      'It also forced all people... to receive a mark... so that they could not buy or sell unless they had the mark.'
    );
  });

  it('REV_16_12 is verbatim', () => {
    expect(FRAGMENTS.REV_16_12.content).toBe(
      'The sixth angel poured out his bowl on the great river Euphrates, and its water was dried up to prepare the way for the kings from the East.'
    );
  });

  it('REV_17_8 is verbatim', () => {
    expect(FRAGMENTS.REV_17_8.content).toBe(
      'The beast, which you saw, once was, now is not, and yet will come up out of the Abyss.'
    );
  });

  it('REV_21_1 is verbatim', () => {
    expect(FRAGMENTS.REV_21_1.content).toBe(
      'Then I saw a new heaven and a new earth, for the first heaven and the first earth had passed away.'
    );
  });

  it('REV_22_13 is verbatim', () => {
    expect(FRAGMENTS.REV_22_13.content).toBe(
      'I am the Alpha and the Omega, the First and the Last, the Beginning and the End.'
    );
  });
});

// ─── checkCoherenceCollapse() ─────────────────────────────────────────────────

describe('checkCoherenceCollapse()', () => {
  it('returns false when no traditions have fired', () => {
    expect(checkCoherenceCollapse()).toBe(false);
  });

  it('returns false when only one tradition has fired', () => {
    triggerDoctrinal('MORPHYSM_TULPAS');
    expect(checkCoherenceCollapse()).toBe(false);
  });

  it('returns false when only two traditions have fired', () => {
    triggerDoctrinal('MORPHYSM_TULPAS');
    triggerDoctrinal('REV_8_10');
    expect(checkCoherenceCollapse()).toBe(false);
  });

  it('returns true when all three traditions have fired in the same shift', () => {
    triggerDoctrinal('MORPHYSM_TULPAS');
    triggerDoctrinal('REV_8_10');
    triggerDoctrinal('GITA_SOUL_NEVER_DIES');
    expect(checkCoherenceCollapse()).toBe(true);
  });

  it('writes a debt marker to the clock ledger when collapse triggers', () => {
    triggerDoctrinal('MORPHYSM_TULPAS');
    triggerDoctrinal('REV_8_10');
    triggerDoctrinal('GITA_SOUL_NEVER_DIES');
    expect(advance).toHaveBeenCalledWith(0, 'COHERENCE_COLLAPSE_DEBT_MULTIPLIER');
  });

  it('fires the debt marker exactly once per shift regardless of subsequent triggers', () => {
    triggerDoctrinal('MORPHYSM_TULPAS');
    triggerDoctrinal('REV_8_10');
    triggerDoctrinal('GITA_SOUL_NEVER_DIES'); // collapse fires here
    triggerDoctrinal('MORPHYSM_WAR_TORN_SOIL'); // second MORPHYSM — no second fire
    triggerDoctrinal('REV_6_1');               // second REV — no second fire
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('resets when the shift increments', () => {
    triggerDoctrinal('MORPHYSM_TULPAS');
    triggerDoctrinal('REV_8_10');
    triggerDoctrinal('GITA_SOUL_NEVER_DIES'); // collapse in shift 0

    currentShift.set(1); // new shift
    vi.clearAllMocks();

    triggerDoctrinal('MORPHYSM_WAR_TORN_SOIL');
    triggerDoctrinal('REV_6_1');
    expect(checkCoherenceCollapse()).toBe(false); // only two traditions in shift 1
  });

  it('collapse in a new shift fires a fresh debt marker', () => {
    triggerDoctrinal('MORPHYSM_TULPAS');
    triggerDoctrinal('REV_8_10');
    triggerDoctrinal('GITA_SOUL_NEVER_DIES');

    currentShift.set(1);
    vi.clearAllMocks();

    triggerDoctrinal('MORPHYSM_WAR_TORN_SOIL');
    triggerDoctrinal('REV_6_1');
    triggerDoctrinal('GITA_LIMBS_FAIL'); // all three again in shift 1
    expect(advance).toHaveBeenCalledWith(0, 'COHERENCE_COLLAPSE_DEBT_MULTIPLIER');
    expect(advance).toHaveBeenCalledTimes(1);
  });
});
