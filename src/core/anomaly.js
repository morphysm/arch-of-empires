import { get } from 'svelte/store';
import { anomalies, awareness, nature } from './store.js';
import { advance } from './clock.js';
import { saveGhostSignal } from './persistence.js';

export const ASPECT_DECK = [
  'THE_PREDICTOR',
  'THE_MIMIC',
  'THE_MEMETIC',
  'THE_ARCHITECT',
  'THE_DISSOLVER',
];

export const ASPECT_NATURE = {
  THE_PREDICTOR: 'system',
  THE_MIMIC:     'antichrist',
  THE_MEMETIC:   'prophet',
  THE_ARCHITECT: 'system',
  THE_DISSOLVER: 'martyr',
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function drawAspects() {
  const count = randomInt(2, 3);
  const shuffled = [...ASPECT_DECK].sort(() => Math.random() - 0.5);
  const drawn = shuffled.slice(0, count);
  anomalies.update(s => ({ ...s, aspects: drawn }));
  return drawn;
}

export function manifestAnomaly() {
  const { aspects } = get(anomalies);
  if (aspects.length === 0) return null;
  const aspectId = aspects[Math.floor(Math.random() * aspects.length)];
  const seconds = randomInt(1, 10);

  const manifestation = {
    id: crypto.randomUUID(),
    aspectId,
    timestamp: Date.now(),
    acknowledged: false,
    ignored: false,
  };

  anomalies.update(s => ({
    ...s,
    manifestations: [...s.manifestations, manifestation],
  }));

  advance(seconds, 'ANOMALY');

  nature.update(s => ({
    ...s,
    [ASPECT_NATURE[aspectId]]: s[ASPECT_NATURE[aspectId]] + 1,
  }));

  return manifestation;
}

export function acknowledgeAnomaly(id) {
  anomalies.update(s => ({
    ...s,
    manifestations: s.manifestations.map(m =>
      m.id === id ? { ...m, acknowledged: true } : m
    ),
  }));
  awareness.update(n => n + 1);
}

export function ignoreAnomaly(id) {
  const entry = get(anomalies).manifestations.find(m => m.id === id);

  anomalies.update(s => ({
    ...s,
    manifestations: s.manifestations.map(m =>
      m.id === id ? { ...m, ignored: true } : m
    ),
  }));

  if (entry) {
    saveGhostSignal({ ...entry, ignored: true, ignoredAt: Date.now() });
  }
}
