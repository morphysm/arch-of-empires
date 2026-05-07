import { get } from 'svelte/store';
import { clock, terminalState, currentShift } from './store.js';

import { saveClock } from './persistence.js';

const MIDNIGHT = 43200; // 12:00:00 in total seconds

function toSeconds(timeStr) {
  const [h, m, s] = timeStr.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

function toTimeStr(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function advance(seconds, source) {
  const state = get(clock);
  const shift = get(currentShift);

  const collapsed = state.debtLedger.some(
    e => e.shift === shift && e.source === 'COHERENCE_COLLAPSE_DEBT_MULTIPLIER'
  );
  const debtMultiplier = collapsed ? 2.0 : 1.0;
  const actualSeconds = Math.floor(seconds * debtMultiplier);

  const next = Math.min(toSeconds(state.time) + actualSeconds, MIDNIGHT);

  const entry = { timestamp: Date.now(), source, seconds, shift };
  const newState = {
    time: toTimeStr(next),
    debtLedger: [...state.debtLedger, entry],
  };

  clock.set(newState);
  saveClock(newState);

  if (next >= MIDNIGHT) {
    terminalState.set('MIDNIGHT');
  }
}

export function getDebt(shiftOffset = 0) {
  const { debtLedger } = get(clock);
  const targetShift = get(currentShift) - shiftOffset;
  return debtLedger.filter(entry => entry.shift === targetShift);
}
