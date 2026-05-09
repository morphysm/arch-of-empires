import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { entityMode, entityLines } from '../src/core/store.js';
import { openEntityChannel, closeEntityChannel } from '../src/terminal/entity.js';

beforeEach(() => {
  vi.useFakeTimers();
  entityMode.set(false);
  entityLines.set([]);
});

afterEach(() => {
  closeEntityChannel();
  vi.useRealTimers();
});

describe('entity channel timers', () => {
  it('does not append delayed lines after the channel is closed', () => {
    openEntityChannel(['FIRST', 'SECOND'], { delayMs: 1000, holdMs: 5000 });
    closeEntityChannel();

    vi.advanceTimersByTime(2_000);

    expect(get(entityMode)).toBe(false);
    expect(get(entityLines)).toEqual([]);
  });

  it('clears pending lines when a new channel opens', () => {
    openEntityChannel(['OLD-1', 'OLD-2'], { delayMs: 1000, holdMs: 5000 });
    openEntityChannel(['NEW'], { delayMs: 1000, holdMs: 5000 });

    vi.advanceTimersByTime(1_001);

    expect(get(entityLines)).toEqual(['NEW']);
  });
});

