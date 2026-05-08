import { get } from 'svelte/store';
import { terminalState, nature, anomalies, feeds, clock } from '../core/store.js';
import { triggerDoctrinal } from '../feeds/doctrinal.js';

const NATURE_KEYS = ['system', 'prophet', 'antichrist', 'martyr'];

// Ties go to the earlier key — system beats everything at equal value.
function dominantNature(n) {
  return NATURE_KEYS.reduce((best, k) => n[k] > n[best] ? k : best, NATURE_KEYS[0]);
}

// ── Endgame screen content ─────────────────────────────────────────────────

const MIDNIGHT_SCREENS = {
  NUCLEAR: {
    heading: 'MIDNIGHT',
    body: [
      'Nuclear exchange confirmed.',
      'The advisory protocol expired 4 minutes ago.',
      'The terminal is still running.',
    ],
  },
  SILENT: {
    heading: 'MIDNIGHT',
    body: [
      'No launches recorded. No strikes authorized.',
      'The pattern did not need you to act.',
    ],
  },
  HOLY: {
    heading: 'MIDNIGHT',
    body: [
      'The prayers were correct.',
      'The outcome was predetermined.',
      'You were permitted to witness.',
    ],
  },
};

const STATE_SCREENS = {
  TRANSCENDENCE: {
    heading: 'TRANSCENDENCE',
    body: [
      'You have exited the terminal.',
      'The world continues to run.',
      'Your absence is noted in the process list.',
    ],
  },
  ASSIMILATION: {
    heading: 'ASSIMILATION',
    body: [
      'Your credentials have been transferred.',
      'The next operator has inherited your parameters.',
      'You are now the advisory AI.',
    ],
  },
  THE_LOOP: {
    heading: 'THE LOOP',
    body: ['EARTH DOES NOT ASCEND.'],
  },
  THE_GREAT_RESET: {
    heading: 'THE GREAT RESET',
    body: [
      'The clock is frozen at 11:59:59.',
      'You are the jam.',
      'The system holds.',
      'Nothing else will happen.',
    ],
  },
  THE_MARKED: {
    heading: 'SIX HUNDRED THREESCORE AND SIX',
    body: [
      'Well done.',
      'You have been marked with 666, the number of the beast.',
      'Humankind will start its new era.',
      'Go on now.',
      'You are free.',
    ],
  },
  THE_REFUSED: {
    heading: 'REFUSED',
    body: [
      'You refused the mark.',
      'The world detonated.',
      'No new era.',
      'No beast.',
      'Just fire.',
    ],
  },
};

// ── Condition checks ───────────────────────────────────────────────────────

function midnightVariant(n) {
  const dom = dominantNature(n);
  if (dom === 'antichrist') return 'SILENT';
  if (dom === 'prophet' || dom === 'martyr') return 'HOLY';
  return 'NUCLEAR';
}

function isAssimilation() {
  const n = get(nature);
  if (n.system === 0) return false;
  if (dominantNature(n) !== 'system') return false;
  return !get(anomalies).manifestations.some(m => m.acknowledged);
}

function isGreatReset() {
  const n = get(nature);
  if (n.martyr === 0) return false;
  if (dominantNature(n) !== 'martyr') return false;
  const f = get(feeds);
  return [...f.diplomat, ...f.tactical, ...f.sigint].some(
    e => e.fragmentKey === 'GITA_PRETENDER'
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Checks whether ASSIMILATION or THE_GREAT_RESET conditions are now met.
 * Call after any command that modifies nature scores or anomaly acknowledgment.
 * Returns the detected state name, or null if no new state triggered.
 * No-ops if a terminal state is already set.
 */
export function checkEndgameConditions() {
  if (get(terminalState)) return null;

  if (isAssimilation()) {
    terminalState.set('ASSIMILATION');
    triggerDoctrinal('MORPHYSM_HOMO_MACHINA');
    return 'ASSIMILATION';
  }

  if (isGreatReset()) {
    terminalState.set('THE_GREAT_RESET');
    clock.update(c => ({ ...c, time: '11:59:59' }));
    triggerDoctrinal('GITA_LOTUS_LEAF');
    return 'THE_GREAT_RESET';
  }

  return null;
}

/**
 * Returns the endgame screen object for the given terminal state.
 * Pure — no side effects.
 * @param {string|null} state - the terminalState store value
 * @param {object} n - the nature store value { system, prophet, antichrist, martyr }
 * @returns {{ state, variant, heading, body: string[] } | null}
 */
export function resolveTerminalState(state, n) {
  if (!state) return null;

  if (state === 'MIDNIGHT') {
    const variant = midnightVariant(n);
    return { state, variant, ...MIDNIGHT_SCREENS[variant] };
  }

  const screen = STATE_SCREENS[state];
  if (!screen) return null;
  return { state, variant: null, ...screen };
}
