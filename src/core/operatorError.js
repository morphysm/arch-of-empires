import { get } from 'svelte/store';
import { currentShift } from './store.js';
import { advance } from './clock.js';

let _shift = null;
let _count = 0;

export function resetOperatorErrors() {
  _shift = null;
  _count = 0;
}

export function registerOperatorError() {
  const shift = get(currentShift);
  if (_shift !== shift) {
    _shift = shift;
    _count = 0;
  }

  _count += 1;
  const clockPenalty = _count % 5 === 0;
  if (clockPenalty) advance(180, 'OPERATOR_ERROR');

  return { operatorErrorCount: _count, clockPenalty };
}

