import { get } from 'svelte/store';
import { bandwidth, awareness, coherence, feeds, clock, anomalies } from '../core/store.js';
import { advance } from '../core/clock.js';
import { saveClock } from '../core/persistence.js';
import { triggerDoctrinal } from '../feeds/doctrinal.js';
import { registerOperatorError } from '../core/operatorError.js';
import { canonicalEventId } from '../core/eventIds.js';
import { isTerminalLocked } from './tier3.js';

const COSTS = {
  DECODE:      1,
  VERIFY:      4,
  TRIANGULATE: 3,
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

function findEvent(id) {
  const { diplomat, tactical, sigint } = get(feeds);
  const canonical = canonicalEventId(id);
  return [...diplomat, ...tactical, ...sigint].find(e => canonicalEventId(e.id) === canonical) ?? null;
}

// Observer Effect: mark the event as verified in the store, with optional extra fields.
// This applies regardless of command success or failure — observation collapses the wave.
function markVerified(eventId, extra = {}) {
  feeds.update(s => {
    const stamp = slice =>
      slice.map(e => e.id === eventId ? { ...e, verified: true, ...extra } : e);
    return {
      ...s,
      diplomat: stamp(s.diplomat),
      tactical: stamp(s.tactical),
      sigint:   stamp(s.sigint),
    };
  });
}

// ── Tier 2 commands ───────────────────────────────────────────────────────────

export function decode(signalId) {
  assertUnlocked();
  const cost = COSTS.DECODE;
  if (!hasBandwidth(cost)) return fail('DECODE', signalId);
  spendBandwidth(cost);

  const event = findEvent(signalId);
  if (!event) return operatorError('DECODE', signalId, cost);
  const aspects = get(anomalies).aspects;

  // Probability calculation (auditable):
  //   Base:                          70%
  //   THE_MEMETIC active:           -20%  (signal resists decoding)
  //   awareness > 50:               +10%  (operator sees more clearly)
  //   coherence < 50:               -15%  (terminal is corrupting)
  let probability = 0.70;
  if (aspects.includes('THE_MEMETIC')) probability -= 0.20;
  if (get(awareness) > 50)             probability += 0.10;
  if (get(coherence) < 50)             probability -= 0.15;
  probability = Math.max(0, Math.min(1, probability));

  const succeeded = Math.random() < probability;

  // Clock cost is unconditional — the attempt itself takes time
  advance(10, 'DECODE_ATTEMPT');

  // Observer Effect: the signal is now real regardless of decode outcome
  markVerified(signalId, succeeded ? {} : { anomalyFlag: true });

  // Explicit Observer Effect debt write
  saveClock(get(clock));

  const rawContent = event?.content ?? '';
  const content = succeeded
    ? (rawContent || '[SIGNAL CONTENT UNAVAILABLE]')
    : (rawContent.slice(0, 40) + ' [PARTIAL DECODE — SIGNAL CORRUPTED]');

  return {
    command: 'DECODE',
    target: String(signalId),
    success: succeeded,
    bandwidthCost: cost,
    clockEffect: 10,
    doctrinalTriggered: null,
    timestamp: get(clock).time,
    probability,
    observerEffectApplied: true,
    content,
    ...(event?.isDoctrinal ? { isDoctrinal: true } : {}),
    ...(succeeded ? {} : { reason: 'DECODE_FAILED', anomalyFlag: true }),
  };
}

export function verify(sourceId) {
  assertUnlocked();
  const cost = COSTS.VERIFY;
  if (!hasBandwidth(cost)) return fail('VERIFY', sourceId);
  spendBandwidth(cost);

  const event = findEvent(sourceId);
  if (!event) return operatorError('VERIFY', sourceId, cost);
  const isGhost = event?.isGhost ?? false;
  const aspects = get(anomalies).aspects;

  // Probability calculation (auditable):
  //   Base:                          60%
  //   THE_PREDICTOR active:         +15%  (recognises authentic signal patterns)
  //   THE_MIMIC active:             -20%  (origin may be mimicked)
  //   awareness > 50:               +10%
  //   coherence < 50:               -15%
  let probability = 0.60;
  if (aspects.includes('THE_PREDICTOR')) probability += 0.15;
  if (aspects.includes('THE_MIMIC'))     probability -= 0.20;
  if (get(awareness) > 50)               probability += 0.10;
  if (get(coherence) < 50)               probability -= 0.15;
  probability = Math.max(0, Math.min(1, probability));

  const succeeded = Math.random() < probability;

  // Clock cost is unconditional
  advance(30, 'VERIFY_ATTEMPT');

  // Observer Effect: the signal is now real regardless of verify outcome
  markVerified(sourceId);

  let doctrinalTriggered = null;
  let secondaryClockEffect = 0;
  let anomalyFlag = false;

  if (succeeded && !isGhost) {
    // True positive — genuine signal confirmed
    advance(-2, 'VERIFICATION_SUCCESS');
    secondaryClockEffect = -2;
  } else if (succeeded && isGhost) {
    // False positive — ghost verified as real; operator cannot distinguish this
    advance(3, 'FALSE_POSITIVE');
    secondaryClockEffect = 3;
    anomalyFlag = true;
  } else if (!succeeded && !isGhost) {
    // False negative — real signal missed; the Gita admonishes the imperfect duty
    doctrinalTriggered = 'GITA_OWN_DUTIES';
    triggerDoctrinal('GITA_OWN_DUTIES');
  }
  // True negative (!succeeded && isGhost): correct dismissal of ghost — no special action

  saveClock(get(clock));

  return {
    command: 'VERIFY',
    target: String(sourceId),
    success: succeeded,
    bandwidthCost: cost,
    clockEffect: 30 + secondaryClockEffect,
    doctrinalTriggered,
    timestamp: get(clock).time,
    probability,
    observerEffectApplied: true,
    ...(event?.isDoctrinal ? { isDoctrinal: true } : {}),
    ...(anomalyFlag ? { anomalyFlag: true } : {}),
  };
}

export function triangulate(targetId) {
  assertUnlocked();
  const cost = COSTS.TRIANGULATE;
  if (!hasBandwidth(cost)) return fail('TRIANGULATE', targetId);
  spendBandwidth(cost);

  const event = findEvent(targetId);
  if (!event) return operatorError('TRIANGULATE', targetId, cost);

  advance(20, 'TRIANGULATE');

  const aspects = get(anomalies).aspects;
  const hasArchitect = aspects.includes('THE_ARCHITECT');

  // Probability calculation (auditable):
  //   Base:  50%
  //   (no aspect modifiers for triangulate — location cannot be predicted)
  const probability = 0.50;
  const succeeded = Math.random() < probability;

  let location;
  let confidence;
  let phantomRisk = false;

  if (succeeded) {
    location = event?.origin ?? 'UNKNOWN';
    confidence = 70 + Math.floor(Math.random() * 31); // 70–100
  } else {
    if (hasArchitect) {
      // Architect corrupts the location — target shifts when unobserved
      location = 'SECTOR_NULL';
      phantomRisk = true;
    } else {
      location = 'UNKNOWN';
    }
    confidence = Math.floor(Math.random() * 31); // 0–30
  }

  return {
    command: 'TRIANGULATE',
    target: String(targetId),
    success: succeeded,
    bandwidthCost: cost,
    clockEffect: 20,
    doctrinalTriggered: null,
    timestamp: get(clock).time,
    probability,
    observerEffectApplied: false,
    location,
    confidence,
    phantomRisk,
  };
}
