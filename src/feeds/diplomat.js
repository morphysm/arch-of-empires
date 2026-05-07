import { get } from 'svelte/store';
import { feeds, clock, currentShift, anomalies } from '../core/store.js';
import { advance } from '../core/clock.js';

const EVENT_TYPES = ['TREATY', 'PRESIDENTIAL_CALL', 'CEASEFIRE', 'SANCTION'];

const CONTENT = {
  TREATY: [
    'Mutual non-aggression framework signed. Terms classified.',
    'Emergency ratification complete. 72-hour review window open.',
    'Article IV invoked. Joint verification protocol initiated.',
  ],
  PRESIDENTIAL_CALL: [
    'Channel secured. Message authenticated. Standing by.',
    'Communication relay established. Presidential authority confirmed.',
    'Encrypted line active. Protocol NIGHTWATCH engaged.',
  ],
  CEASEFIRE: [
    'Ceasefire terms transmitted. Acknowledgement pending.',
    'Hostility pause in effect. Boundary coordinates transmitted.',
    'Temporary cessation logged. Verification team en route.',
  ],
  SANCTION: [
    'Economic sanction package enacted. 48-hour compliance window.',
    'Asset freeze protocol active. Coordination with allies confirmed.',
    'Trade suspension logged. Diplomatic channels remain open.',
  ],
};

const CEASEFIRE_COLLAPSE_PROBABILITY = 0.4;

let _mimicEchoPending = null;

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
  feeds.update(s => ({ ...s, diplomat: [...s.diplomat, event] }));
}

export function generateEvent() {
  // Decrement pending Mimic echo; auto-append when countdown expires
  if (_mimicEchoPending) {
    _mimicEchoPending.countdown--;
    if (_mimicEchoPending.countdown <= 0) {
      appendToFeed(_mimicEchoPending.event);
      _mimicEchoPending = null;
    }
  }

  const aspects = get(anomalies).aspects;
  const hasPredictor = aspects.includes('THE_PREDICTOR');
  const hasMimic = aspects.includes('THE_MIMIC');

  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const { time } = get(clock);
  const shift = get(currentShift);

  // Predictor: signatures appear before pens move
  let timestamp = time;
  if (hasPredictor) {
    timestamp = secondsToTime(timeToSeconds(time) + randomInt(120, 300));
  }

  const rawContent = pickRandom(CONTENT[type]);
  let content = rawContent;
  let anomalyFlag = false;

  // Mimic: corrupt PRESIDENTIAL_CALL and schedule a delayed echo
  if (hasMimic && type === 'PRESIDENTIAL_CALL') {
    anomalyFlag = true;
    content = rawContent + ' [DELAY: 0.3s]';

    const echoPool = CONTENT.PRESIDENTIAL_CALL.filter(c => c !== rawContent);
    const echoRaw = echoPool.length > 0 ? pickRandom(echoPool) : rawContent;

    _mimicEchoPending = {
      countdown: randomInt(1, 3),
      event: {
        id: crypto.randomUUID(),
        timestamp,
        type: 'PRESIDENTIAL_CALL',
        content: echoRaw + ' [DELAY: 0.3s]',
        anomalyFlag: true,
        verified: false,
        shift,
      },
    };
  }

  const event = {
    id: crypto.randomUUID(),
    timestamp,
    type,
    content,
    anomalyFlag,
    verified: false,
    shift,
  };

  // Failed diplomacy: ceasefire collapse advances the clock
  if (type === 'CEASEFIRE' && Math.random() < CEASEFIRE_COLLAPSE_PROBABILITY) {
    advance(5, 'FAILED_DIPLOMACY');
  }

  return event;
}

// Test escape hatch — resets pending Mimic echo state between tests
export function _resetMimicEcho() {
  _mimicEchoPending = null;
}
