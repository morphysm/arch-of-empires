import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { clock, terminalState, currentShift } from '../src/core/store.js';
import { advance, getDebt } from '../src/core/clock.js';

beforeEach(() => {
  clock.set({ time: '11:54:00', debtLedger: [] });
  terminalState.set(null);
  currentShift.set(0);
});

describe('advance() — time', () => {
  it('advances time by the given seconds', () => {
    advance(30, 'TEST');
    expect(get(clock).time).toBe('11:54:30');
  });

  it('accumulates across multiple calls', () => {
    advance(10, 'A');
    advance(20, 'B');
    expect(get(clock).time).toBe('11:54:30');
  });

  it('handles a full minute boundary', () => {
    advance(60, 'TEST');
    expect(get(clock).time).toBe('11:55:00');
  });
});

describe('advance() — debt ledger', () => {
  it('writes one entry per call', () => {
    advance(60, 'DIPLOMATIC_FAILURE');
    expect(get(clock).debtLedger).toHaveLength(1);
  });

  it('records the correct source', () => {
    advance(60, 'DIPLOMATIC_FAILURE');
    expect(get(clock).debtLedger[0].source).toBe('DIPLOMATIC_FAILURE');
  });

  it('records the correct seconds', () => {
    advance(45, 'TACTICAL_STRIKE');
    expect(get(clock).debtLedger[0].seconds).toBe(45);
  });

  it('stamps the current shift on each entry', () => {
    currentShift.set(3);
    advance(10, 'TEST');
    expect(get(clock).debtLedger[0].shift).toBe(3);
  });

  it('records a numeric timestamp', () => {
    const before = Date.now();
    advance(10, 'TEST');
    const after = Date.now();
    const ts = get(clock).debtLedger[0].timestamp;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('advance() — midnight boundary', () => {
  it('clamps time at 12:00:00 on overflow', () => {
    advance(400, 'OVERFLOW');
    expect(get(clock).time).toBe('12:00:00');
  });

  it('sets terminalState to MIDNIGHT at exactly 360 seconds', () => {
    advance(360, 'NUCLEAR_LAUNCH');
    expect(get(terminalState)).toBe('MIDNIGHT');
  });

  it('sets terminalState to MIDNIGHT on overflow past 360 seconds', () => {
    advance(500, 'OVERFLOW');
    expect(get(terminalState)).toBe('MIDNIGHT');
  });

  it('does not set MIDNIGHT before the boundary is reached', () => {
    advance(359, 'CLOSE_CALL');
    expect(get(terminalState)).toBeNull();
  });

  it('still writes the debt entry when triggering MIDNIGHT', () => {
    advance(360, 'FINAL_BLOW');
    expect(get(clock).debtLedger).toHaveLength(1);
    expect(get(clock).debtLedger[0].source).toBe('FINAL_BLOW');
  });
});

describe('getDebt()', () => {
  it('returns entries from the current shift when offset is 0', () => {
    currentShift.set(1);
    advance(10, 'SHIFT_1_EVENT');
    expect(getDebt(0)).toHaveLength(1);
    expect(getDebt(0)[0].source).toBe('SHIFT_1_EVENT');
  });

  it('returns entries from N shifts ago', () => {
    currentShift.set(0);
    advance(10, 'OLD_EVENT');
    currentShift.set(1);
    advance(20, 'NEW_EVENT');

    const past = getDebt(1);
    expect(past).toHaveLength(1);
    expect(past[0].source).toBe('OLD_EVENT');
  });

  it('excludes entries from other shifts', () => {
    currentShift.set(0);
    advance(10, 'SHIFT_0');
    currentShift.set(1);
    advance(10, 'SHIFT_1');
    currentShift.set(2);
    advance(10, 'SHIFT_2');

    expect(getDebt(0)).toHaveLength(1);
    expect(getDebt(0)[0].source).toBe('SHIFT_2');
  });

  it('returns empty array when no entries exist for that shift', () => {
    expect(getDebt(99)).toHaveLength(0);
  });

  it('defaults to offset 0 when called with no arguments', () => {
    advance(10, 'DEFAULT_TEST');
    expect(getDebt()).toHaveLength(1);
  });
});

describe('advance() — cross-doctrinal debt multiplier', () => {
  function seedCollapse(shift = 0) {
    clock.update(c => ({
      ...c,
      debtLedger: [
        ...c.debtLedger,
        { timestamp: Date.now(), source: 'COHERENCE_COLLAPSE_DEBT_MULTIPLIER', seconds: 0, shift },
      ],
    }));
  }

  it('applies 2x multiplier when collapse entry exists in current Shift ledger', () => {
    currentShift.set(0);
    seedCollapse(0);
    advance(10, 'TEST');
    expect(get(clock).time).toBe('11:54:20');
  });

  it('uses 1.0 multiplier when no collapse entry exists', () => {
    advance(10, 'TEST');
    expect(get(clock).time).toBe('11:54:10');
  });

  it('multiplier resets to 1.0 on new Shift', () => {
    currentShift.set(0);
    seedCollapse(0);
    currentShift.set(1);
    advance(10, 'TEST');
    expect(get(clock).time).toBe('11:54:10');
  });
});
