import { describe, it, expect, beforeEach } from 'vitest';
import { feeds } from '../src/core/store.js';
import { resolveTraditionTarget, canonicalEventId } from '../src/core/eventIds.js';

function seedGitaEvent(id = 'gita-uuid-001') {
  feeds.update(s => ({
    ...s,
    tactical: [...s.tactical, {
      id,
      timestamp: '11:55:00',
      tradition: 'GITA',
      fragmentKey: 'GITA_DUTY_WITHOUT_ATTACHMENT',
      content: 'Test fragment.',
      shift: 1,
      anomalyFlag: true,
      isDoctrinal: true,
    }],
  }));
  return id;
}

function seedRevEvent(id = 'rev-uuid-001') {
  feeds.update(s => ({
    ...s,
    tactical: [...s.tactical, {
      id,
      timestamp: '11:55:00',
      tradition: 'REVELATION',
      fragmentKey: 'REV_6_3',
      content: 'Test rev fragment.',
      shift: 1,
      anomalyFlag: true,
      isDoctrinal: true,
    }],
  }));
  return id;
}

beforeEach(() => {
  feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
});

describe('resolveTraditionTarget — GITA aliases', () => {
  it('GITA resolves to the last GITA event id', () => {
    const id = seedGitaEvent();
    const result = resolveTraditionTarget('GITA', { diplomat: [], tactical: [{ id, tradition: 'GITA', isDoctrinal: true }], sigint: [] });
    expect(result).toBe(id);
  });

  it('BHAGAVAD GITA resolves identically to GITA', () => {
    const id = seedGitaEvent();
    const feedsVal = { diplomat: [], tactical: [{ id, tradition: 'GITA', isDoctrinal: true }], sigint: [] };
    expect(resolveTraditionTarget('BHAGAVAD GITA', feedsVal)).toBe(resolveTraditionTarget('GITA', feedsVal));
  });

  it('BHAGAVAD-GITA resolves identically to GITA', () => {
    const id = seedGitaEvent();
    const feedsVal = { diplomat: [], tactical: [{ id, tradition: 'GITA', isDoctrinal: true }], sigint: [] };
    expect(resolveTraditionTarget('BHAGAVAD-GITA', feedsVal)).toBe(resolveTraditionTarget('GITA', feedsVal));
  });

  it('returns null when no GITA events are in the feeds', () => {
    const feedsVal = { diplomat: [], tactical: [], sigint: [] };
    expect(resolveTraditionTarget('BHAGAVAD GITA', feedsVal)).toBeNull();
    expect(resolveTraditionTarget('GITA', feedsVal)).toBeNull();
  });

  it('is case-insensitive', () => {
    const id = seedGitaEvent();
    const feedsVal = { diplomat: [], tactical: [{ id, tradition: 'GITA', isDoctrinal: true }], sigint: [] };
    expect(resolveTraditionTarget('bhagavad gita', feedsVal)).toBe(id);
    expect(resolveTraditionTarget('Gita', feedsVal)).toBe(id);
  });
});

describe('resolveTraditionTarget — REVELATION aliases', () => {
  it('REVELATION resolves to the last REVELATION event id', () => {
    const id = seedRevEvent();
    const feedsVal = { diplomat: [], tactical: [{ id, tradition: 'REVELATION', isDoctrinal: true }], sigint: [] };
    expect(resolveTraditionTarget('REVELATION', feedsVal)).toBe(id);
  });

  it('REVELATIONS resolves identically to REVELATION', () => {
    const id = seedRevEvent();
    const feedsVal = { diplomat: [], tactical: [{ id, tradition: 'REVELATION', isDoctrinal: true }], sigint: [] };
    expect(resolveTraditionTarget('REVELATIONS', feedsVal)).toBe(resolveTraditionTarget('REVELATION', feedsVal));
  });

  it('BIBLE resolves identically to REVELATION', () => {
    const id = seedRevEvent();
    const feedsVal = { diplomat: [], tactical: [{ id, tradition: 'REVELATION', isDoctrinal: true }], sigint: [] };
    expect(resolveTraditionTarget('BIBLE', feedsVal)).toBe(id);
  });
});

describe('resolveTraditionTarget — returns null for unknown aliases', () => {
  it('returns null for unrecognized tradition strings', () => {
    const feedsVal = { diplomat: [], tactical: [], sigint: [] };
    expect(resolveTraditionTarget('BHAGAVAD', feedsVal)).toBeNull();
    expect(resolveTraditionTarget('UNKNOWN', feedsVal)).toBeNull();
    expect(resolveTraditionTarget('', feedsVal)).toBeNull();
  });
});

describe('canonicalEventId', () => {
  it('normalizes UUID-style ids', () => {
    const id = 'abc-123-DEF';
    expect(canonicalEventId(id)).toBe('abc-123-def');
  });

  it('normalizes evt- style ids to 3-digit zero-padded', () => {
    expect(canonicalEventId('EVT-001')).toBe('evt-001');
    expect(canonicalEventId('EVT-7')).toBe('evt-007');
    expect(canonicalEventId('evt-042')).toBe('evt-042');
  });

  it('returns empty string for null', () => {
    expect(canonicalEventId(null)).toBe('');
  });
});
