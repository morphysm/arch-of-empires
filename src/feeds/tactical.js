import { get } from 'svelte/store';
import { feeds, clock, currentShift, anomalies } from '../core/store.js';
import { advance } from '../core/clock.js';
import { triggerDoctrinal } from './doctrinal.js';

const EVENT_TYPES = [
  'MISSILE_LAUNCH',
  'TROOP_MOVEMENT',
  'STRIKE_AUTHORIZED',
  'LAUNCH_DETECTED',
  'SATELLITE_ACTIVATED',
];

const COUNTRIES = [
  'RUSSIA', 'USA', 'CHINA', 'INDIA',
  'PAKISTAN', 'NORTH_KOREA', 'IRAN', 'NATO_COMPOSITE',
];

const GRID_COORDINATES = [
  'GRID_47N_38E', 'GRID_55N_83E', 'GRID_39N_125E',
  'GRID_29N_77E', 'GRID_24N_67E', 'GRID_33N_44E',
];

const PHANTOM_COORDS = [
  'GRID_00N_00E', 'GRID_UNKNOWN', 'GRID_REDACTED', 'SECTOR_NULL',
];

const CONTENT = {
  MISSILE_LAUNCH: [
    'ICBM trajectory confirmed. Range: 11,000km. Impact window: 28 minutes.',
    'Ballistic object detected. Burn pattern consistent with MIRVed warhead.',
    'Launch signature confirmed. Targeting data withheld pending verification.',
  ],
  TROOP_MOVEMENT: [
    'Armored column crossing international boundary. 300+ vehicles.',
    'Forward deployment detected. Estimated 50,000 troops mobilized.',
    'Naval task force departing port. Destination: CLASSIFIED.',
  ],
  STRIKE_AUTHORIZED: [
    'Strike package authorized. Target coordinates locked.',
    'Weapons release authorized. Standby for confirmation.',
    'Authorization code verified. Strike window: 4 minutes.',
  ],
  LAUNCH_DETECTED: [
    'Early warning system triggered. Multiple objects leaving atmosphere.',
    'Launch confirmed via NORAD relay. Trajectory inbound.',
    'Detection logged. Origin disputed. Verification required.',
  ],
  SATELLITE_ACTIVATED: [
    'Weapons platform nominal. Targeting systems online.',
    'Orbital asset engaged. Ground strike capability confirmed.',
    'Satellite relay active. Targeting lock acquired.',
  ],
};

// Target pools per type — null means no ground target
const TARGET_POOLS = {
  MISSILE_LAUNCH: GRID_COORDINATES,
  TROOP_MOVEMENT: COUNTRIES,
  STRIKE_AUTHORIZED: GRID_COORDINATES,
  LAUNCH_DETECTED: null,
  SATELLITE_ACTIVATED: null,
};

const BRAHMASTRA_PROBABILITY = 0.3;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function timeToSeconds(t) {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

function secondsToTime(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function appendToFeed(event) {
  feeds.update(s => ({ ...s, tactical: [...s.tactical, event] }));
}

export function ignoreCrisis() {
  advance(3, 'IGNORED_CRISIS');
}

export function failedAuth() {
  advance(5, 'FAILED_AUTH');
}

export function generateEvent() {
  const aspects = get(anomalies).aspects;
  const hasPredictor = aspects.includes('THE_PREDICTOR');
  const hasArchitect = aspects.includes('THE_ARCHITECT');

  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const { time } = get(clock);
  const shift = get(currentShift);

  // Predictor: LAUNCH_DETECTED arrives before the launch is logged
  let timestamp = time;
  if (hasPredictor && type === 'LAUNCH_DETECTED') {
    timestamp = secondsToTime(timeToSeconds(time) + randomInt(120, 300));
  }

  // Origin: SATELLITE_ACTIVATED is always unattributed
  let origin = type === 'SATELLITE_ACTIVATED' ? 'UNKNOWN' : pickRandom(COUNTRIES);

  // Target: null for detection-only and orbital events
  const targetPool = TARGET_POOLS[type];
  let target = targetPool ? pickRandom(targetPool) : null;

  const content = pickRandom(CONTENT[type]);

  // Architect: phantom location on launch events
  let anomalyFlag = false;
  let phantomLocation = false;
  if (hasArchitect && (type === 'MISSILE_LAUNCH' || type === 'LAUNCH_DETECTED')) {
    anomalyFlag = true;
    phantomLocation = true;
    // LAUNCH_DETECTED has no target — always corrupt origin
    if (type === 'LAUNCH_DETECTED' || Math.random() < 0.5) {
      origin = pickRandom(PHANTOM_COORDS);
    } else {
      target = pickRandom(PHANTOM_COORDS);
    }
  }

  // Brahmastra: high-yield strike authorization pauses before confirmation
  let brahmastra = false;
  if (type === 'STRIKE_AUTHORIZED' && Math.random() < BRAHMASTRA_PROBABILITY) {
    brahmastra = true;
  }

  const event = {
    id: crypto.randomUUID(),
    timestamp,
    type,
    origin,
    target,
    content,
    anomalyFlag,
    verified: false,
    shift,
    ...(phantomLocation && { phantomLocation: true }),
    ...(brahmastra && { brahmastra: true }),
  };

  // Revelation 8:10–11 fires when a satellite weapons platform activates
  if (type === 'SATELLITE_ACTIVATED') {
    triggerDoctrinal('REV_8_10');
  }

  return event;
}
