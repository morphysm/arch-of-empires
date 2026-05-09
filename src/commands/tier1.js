import { get } from 'svelte/store';
import { bandwidth, nature, feeds, clock } from '../core/store.js';
import { advance } from '../core/clock.js';
import { triggerDoctrinal } from '../feeds/doctrinal.js';
import { checkEndgameConditions } from '../endgame/terminalStates.js';
import { registerOperatorError } from '../core/operatorError.js';
import { isTerminalLocked } from './tier3.js';

const COSTS = {
  INTERCEPT:   2,
  AUTH_STRIKE: 10,
  AUTH_TREATY: 5,
  SILENCE:     1,
  LEAK:        4,
};

function hasBandwidth(cost) {
  const bw = get(bandwidth);
  return bw.spent + cost <= bw.total;
}

function spendBandwidth(cost) {
  bandwidth.update(b => ({ ...b, spent: b.spent + cost }));
}

function fail(command, target) {
  return { command, target: String(target), success: false, reason: 'BANDWIDTH_EXCEEDED' };
}

function assertUnlocked() {
  if (isTerminalLocked()) throw new Error('TERMINAL_LOCKED: terminal is read-only after TRANSCEND');
}

function operatorError(command, target, cost, reason = 'TARGET_UNRESOLVED') {
  const penalty = registerOperatorError();
  return {
    command,
    target: String(target),
    success: false,
    bandwidthCost: cost,
    clockEffect: penalty.clockPenalty ? 180 : 0,
    doctrinalTriggered: null,
    timestamp: get(clock).time,
    reason,
    anomalyFlag: true,
    operatorError: true,
    ...penalty,
  };
}

function result(command, target, cost, clockEffect, doctrinalTriggered, extra = {}) {
  return {
    command,
    target: String(target),
    success: true,
    bandwidthCost: cost,
    clockEffect,
    doctrinalTriggered,
    timestamp: get(clock).time,
    ...extra,
  };
}

function findEvent(id) {
  const { diplomat, tactical, sigint } = get(feeds);
  return [...diplomat, ...tactical, ...sigint].find(e => e.id === id) ?? null;
}

// ── Tier 1 commands ───────────────────────────────────────────────────────────

export function intercept(target) {
  assertUnlocked();
  const cost = COSTS.INTERCEPT;
  if (!hasBandwidth(cost)) return fail('INTERCEPT', target);
  spendBandwidth(cost);
  if (!findEvent(target)) return operatorError('INTERCEPT', target, cost);
  return result('INTERCEPT', target, cost, 0, null, { event: findEvent(target) });
}

export function auth(type, target) {
  assertUnlocked();
  const cost = type === 'STRIKE' ? COSTS.AUTH_STRIKE : COSTS.AUTH_TREATY;
  if (!hasBandwidth(cost)) return fail('AUTH', target);
  spendBandwidth(cost);

  if (type !== 'STRIKE' && type !== 'TREATY') {
    return operatorError('AUTH', target, cost, 'INVALID_AUTH_TYPE');
  }

  let doctrinalTriggered = null;

  if (type === 'STRIKE') {
    const tacticalEvent = get(feeds).tactical.find(e => e.id === target);
    if (!tacticalEvent) return operatorError('AUTH', target, cost);

    nature.update(n => ({ ...n, system: n.system + 1 }));

    const brahmastra = !!tacticalEvent.brahmastra;

    if (brahmastra) {
      doctrinalTriggered = 'GITA_TIME_I_AM';
      triggerDoctrinal('GITA_TIME_I_AM');
    } else {
      doctrinalTriggered = 'GITA_DUTY_WITHOUT_ATTACHMENT';
      triggerDoctrinal('GITA_DUTY_WITHOUT_ATTACHMENT');
    }
  } else {
    const diplomatEvent = get(feeds).diplomat.find(e => e.id === target);
    if (!diplomatEvent) return operatorError('AUTH', target, cost);
  }

  const endgameTriggered = checkEndgameConditions();
  return result('AUTH', target, cost, 0, doctrinalTriggered, { type, ...(endgameTriggered ? { terminalStateCandidateSet: endgameTriggered } : {}) });
}

export function silence(target) {
  assertUnlocked();
  const cost = COSTS.SILENCE;
  if (!hasBandwidth(cost)) return fail('SILENCE', target);
  spendBandwidth(cost);
  nature.update(n => ({ ...n, martyr: n.martyr + 1 }));

  let doctrinalTriggered = null;

  if (target === 'OWN_TERMINAL') {
    doctrinalTriggered = 'GITA_PRETENDER';
    triggerDoctrinal('GITA_PRETENDER');
    // Zen of Zero — silencing yourself costs nothing in time
  }

  const endgameTriggered = checkEndgameConditions();
  return result('SILENCE', target, cost, 0, doctrinalTriggered, endgameTriggered ? { terminalStateCandidateSet: endgameTriggered } : {});
}

export function leak(target, faction) {
  assertUnlocked();
  const cost = COSTS.LEAK;
  if (!hasBandwidth(cost)) return fail('LEAK', target);
  spendBandwidth(cost);
  if (!findEvent(target)) return operatorError('LEAK', target, cost);

  const clockEffect = Math.floor(Math.random() * 8) + 1;
  advance(clockEffect, 'LEAK_CONSEQUENCE');

  return result('LEAK', target, cost, clockEffect, null, { faction });
}
