import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  saveClock,
  loadClock,
  saveGhostSignal,
  loadGhostSignals,
  saveLastCommand,
  loadLastCommand,
  saveCurrentShift,
  loadCurrentShift,
  _resetDB,
} from '../src/core/persistence.js';

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  _resetDB();
});

describe('loadClock() — first run', () => {
  it('returns null when no clock has been saved', async () => {
    expect(await loadClock()).toBeNull();
  });
});

describe('saveClock / loadClock — round-trip', () => {
  it('restores the full clock slice', async () => {
    const slice = { time: '11:54:00', debtLedger: [], currentShift: 0 };
    await saveClock(slice);
    expect(await loadClock()).toEqual(slice);
  });

  it('restores a non-default time', async () => {
    await saveClock({ time: '11:58:42', debtLedger: [], currentShift: 2 });
    const loaded = await loadClock();
    expect(loaded.time).toBe('11:58:42');
    expect(loaded.currentShift).toBe(2);
  });

  it('restores debtLedger entries exactly', async () => {
    const ledger = [
      { timestamp: 1000, source: 'STRIKE', seconds: 30, shift: 0 },
      { timestamp: 2000, source: 'CEASEFIRE', seconds: 10, shift: 0 },
    ];
    await saveClock({ time: '11:55:00', debtLedger: ledger, currentShift: 0 });
    expect((await loadClock()).debtLedger).toEqual(ledger);
  });

  it('overwrites the previous save — only one record exists', async () => {
    await saveClock({ time: '11:54:00', debtLedger: [], currentShift: 0 });
    const updated = { time: '11:59:00', debtLedger: [{ source: 'DEBT' }], currentShift: 3 };
    await saveClock(updated);
    expect(await loadClock()).toEqual(updated);
  });
});

describe('saveGhostSignal / loadGhostSignals — round-trip', () => {
  it('returns empty array when no signals have been saved', async () => {
    expect(await loadGhostSignals()).toEqual([]);
  });

  it('persists a single ghost signal', async () => {
    const signal = { id: 'sig-001', origin: 'SIGINT', payload: 'UNKNOWN_LAUNCH', runId: 1 };
    await saveGhostSignal(signal);
    const loaded = await loadGhostSignals();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(signal);
  });

  it('accumulates multiple ghost signals', async () => {
    await saveGhostSignal({ id: 'a', payload: 'FIRST' });
    await saveGhostSignal({ id: 'b', payload: 'SECOND' });
    await saveGhostSignal({ id: 'c', payload: 'THIRD' });
    expect(await loadGhostSignals()).toHaveLength(3);
  });

  it('preserves insertion order across multiple saves', async () => {
    await saveGhostSignal({ seq: 1 });
    await saveGhostSignal({ seq: 2 });
    await saveGhostSignal({ seq: 3 });
    const signals = await loadGhostSignals();
    expect(signals.map(s => s.seq)).toEqual([1, 2, 3]);
  });

  it('ghost signals are independent of clock saves', async () => {
    await saveGhostSignal({ id: 'ghost-1', payload: 'DEBRIS' });
    await saveClock({ time: '11:54:00', debtLedger: [] });
    expect(await loadGhostSignals()).toHaveLength(1);
    expect(await loadClock()).not.toBeNull();
  });

  it('clock saves do not corrupt ghost signal data', async () => {
    await saveGhostSignal({ id: 'ghost-1', runId: 0, payload: 'FROM_RUN_0' });
    await saveClock({ time: '11:57:00', debtLedger: [] });
    const signals = await loadGhostSignals();
    expect(signals[0].payload).toBe('FROM_RUN_0');
  });
});

describe('saveLastCommand / loadLastCommand — round-trip', () => {
  it('returns the saved command string', async () => {
    await saveLastCommand('AUTH STRIKE ghost-sub-surface');
    expect(await loadLastCommand()).toBe('AUTH STRIKE ghost-sub-surface');
  });

  it('overwrites the previous value — only the most recent command is kept', async () => {
    await saveLastCommand('INTERCEPT sig-001');
    await saveLastCommand('VERIFY sig-002');
    expect(await loadLastCommand()).toBe('VERIFY sig-002');
  });
});

describe('loadLastCommand — nothing saved', () => {
  it('returns null when no command has been saved', async () => {
    expect(await loadLastCommand()).toBeNull();
  });
});

describe('saveCurrentShift / loadCurrentShift — round-trip', () => {
  it('returns null when no shift has been saved', async () => {
    expect(await loadCurrentShift()).toBeNull();
  });

  it('returns the saved shift number', async () => {
    await saveCurrentShift(5);
    expect(await loadCurrentShift()).toBe(5);
  });

  it('overwrites the previous value — only the most recent shift is kept', async () => {
    await saveCurrentShift(3);
    await saveCurrentShift(7);
    expect(await loadCurrentShift()).toBe(7);
  });

  it('is independent of clock and command saves', async () => {
    await saveClock({ time: '11:55:00', debtLedger: [] });
    await saveLastCommand('INTERCEPT sig-001');
    await saveCurrentShift(4);
    expect(await loadCurrentShift()).toBe(4);
    expect(await loadClock()).not.toBeNull();
    expect(await loadLastCommand()).toBe('INTERCEPT sig-001');
  });
});
