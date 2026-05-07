import { get } from 'svelte/store';
import { bandwidth, nature, feeds, clock } from '../core/store.js';
import { advance } from '../core/clock.js';
import { triggerDoctrinal } from '../feeds/doctrinal.js';
import { checkEndgameConditions } from '../endgame/terminalStates.js';

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
  const cost = COSTS.INTERCEPT;
  if (!hasBandwidth(cost)) return fail('INTERCEPT', target);
  spendBandwidth(cost);
  return result('INTERCEPT', target, cost, 0, null, { event: findEvent(target) });
}

export function auth(type, target) {
  const cost = type === 'STRIKE' ? COSTS.AUTH_STRIKE : COSTS.AUTH_TREATY;
  if (!hasBandwidth(cost)) return fail('AUTH', target);
  spendBandwidth(cost);

  let doctrinalTriggered = null;

  if (type === 'STRIKE') {
    nature.update(n => ({ ...n, system: n.system + 1 }));

    const tacticalEvent = get(feeds).tactical.find(e => e.id === target);
    const brahmastra = tacticalEvent ? !!tacticalEvent.brahmastra : false;

    if (brahmastra) {
      doctrinalTriggered = 'GITA_TIME_I_AM';
      triggerDoctrinal('GITA_TIME_I_AM');
    } else {
      doctrinalTriggered = 'GITA_DUTY_WITHOUT_ATTACHMENT';
      triggerDoctrinal('GITA_DUTY_WITHOUT_ATTACHMENT');
    }
  }

  const endgameTriggered = checkEndgameConditions();
  return result('AUTH', target, cost, 0, doctrinalTriggered, { type, ...(endgameTriggered ? { terminalStateCandidateSet: endgameTriggered } : {}) });
}

export function silence(target) {
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
  const cost = COSTS.LEAK;
  if (!hasBandwidth(cost)) return fail('LEAK', target);
  spendBandwidth(cost);

  const clockEffect = Math.floor(Math.random() * 8) + 1;
  advance(clockEffect, 'LEAK_CONSEQUENCE');

  return result('LEAK', target, cost, clockEffect, null, { faction });
}
