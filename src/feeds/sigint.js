import { get } from 'svelte/store';
import { feeds, clock, currentShift, anomalies } from '../core/store.js';
import { advance } from '../core/clock.js';
import { loadGhostSignals } from '../core/persistence.js';
import { triggerDoctrinal } from './doctrinal.js';

const EVENT_TYPES = [
  'INTERCEPT',
  'DECRYPT',
  'DEAD_DROP',
  'GHOST_SIGNAL',
  'FUTURE_TIMESTAMP',
];

// Exported so tests can reference exact indices without duplicating the array
export const AGENTS = [
  { name: 'VECTOR',        kia: false },
  { name: 'CHRYSANTHEMUM', kia: false },
  { name: 'IRONBELL',      kia: true  },
  { name: 'SHEPHERD',      kia: false },
  { name: 'NIGHTJAR',      kia: true  },
  { name: 'COBALT',        kia: false },
  { name: 'UNKNOWN',       kia: false },
];

// Words that carry ontological weight when THE_MEMETIC is active
const MEMETIC_WORDS = [
  'ASSET', 'COMPROMISED', 'CLASSIFIED', 'REDACTED', 'UNKNOWN', 'GHOST',
];

const CONTENT = {
  INTERCEPT: [
    'Encrypted transmission logged. Source authentication failed.',
    'Signal origin triangulated. Frequency: 7.83 MHz. Duration: 4s.',
    'Partial intercept. Message fragmented. Reconstruction pending.',
  ],
  DECRYPT: [
    // All DECRYPT strings contain at least one MEMETIC word
    'Decrypted content: ASSET COMPROMISED. Verification required.',
    'Message decoded: CLASSIFIED movement orders. Grid coordinates REDACTED.',
    'Decryption complete: GHOST signal suspected. Counter-intelligence active.',
  ],
  DEAD_DROP: [
    'Dead drop location confirmed. Package unretrieved for 72 hours.',
    'Brush pass logged. Contents: classified documents. Disposition unknown.',
    'Dead drop activated. Access code: [REDACTED]. One-time use.',
  ],
  GHOST_SIGNAL: [
    'Signal origin unverified. Timestamp inconsistent with local time.',
    'Transmission detected on abandoned frequency. Source: non-existent asset.',
    'Ghost carrier detected. Signal predates station activation by 3 years.',
  ],
  FUTURE_TIMESTAMP: [
    'Message dated [FUTURE]. Transmission integrity: compromised.',
    'Temporal anomaly logged. Signal received before transmission window.',
    'Clock skew detected. Message origin: [UNKNOWN EPOCH].',
  ],
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function appendToFeed(event) {
  feeds.update(s => ({ ...s, sigint: [...s.sigint, event] }));
}

export function ghostIgnored() {
  advance(2, 'GHOST_IGNORED');
}

export function falseFlagExposed() {
  advance(-5, 'FALSE_FLAG_EXPOSED');
}

export async function loadGhosts() {
  const ghosts = await loadGhostSignals();
  if (ghosts.length === 0) return [];

  const { time } = get(clock);
  const shift = get(currentShift);

  const events = ghosts.map(g => ({
    id: g.id,
    timestamp: time,
    type: 'GHOST_SIGNAL',
    source: 'UNKNOWN',
    content: pickRandom(CONTENT.GHOST_SIGNAL),
    anomalyFlag: true,
    verified: false,
    isGhost: true,
    shift,
  }));

  feeds.update(s => ({ ...s, sigint: [...s.sigint, ...events] }));
  return events;
}

export function generateEvent() {
  const aspects = get(anomalies).aspects;
  const hasMemetic = aspects.includes('THE_MEMETIC');

  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const { time } = get(clock);
  const shift = get(currentShift);

  const agent = pickRandom(AGENTS);
  const content = pickRandom(CONTENT[type]);

  // Dead agent signals: KIA source transmitting as if still operational
  if (agent.kia) {
    triggerDoctrinal('GITA_SOUL_NEVER_DIES');
  }

  // Memetic: DECRYPT content infects adjacent feed
  let memetic = false;
  if (hasMemetic && type === 'DECRYPT') {
    memetic = MEMETIC_WORDS.some(w => content.includes(w));
  }

  const event = {
    id: crypto.randomUUID(),
    timestamp: time,
    type,
    source: agent.name,
    content,
    anomalyFlag: agent.kia,
    verified: false,
    isGhost: false,
    shift,
    ...(memetic && { memetic: true }),
  };

  if (memetic) {
    const spreadTarget = pickRandom(['diplomat', 'tactical']);
    feeds.update(s => ({
      ...s,
      [spreadTarget]: [...s[spreadTarget], { ...event, memeticSpread: true }],
    }));
  }

  return event;
}
