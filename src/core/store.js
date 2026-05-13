import { writable, derived } from 'svelte/store';

export const clock = writable({
  time: '11:54:00',
  debtLedger: [],
});

export const bandwidth = writable({
  total: 100,
  spent: 0,
});

export const awareness = writable(0);

export const nature = writable({
  system: 0,
  prophet: 0,
  antichrist: 0,
  martyr: 0,
});

export const feeds = writable({
  diplomat: [],
  tactical: [],
  sigint: [],
  doctrinal: [],
});

export const anomalies = writable({
  aspects: [],
  manifestations: [],
});

export const terminalState = writable(null);

export const commandCount = writable(0);

// { city, country, region, isVPN } | null
export const playerLocation = writable(null);

export const entityMode    = writable(false);
export const entityLines   = writable([]);
export const entityVariant = writable('default'); // 'default' | 'babalon'

export const altarRevealed = writable(false);

// Set to a manifestation ID when Babalon's letter arrives. Null after OPEN.
export const pendingLetter = writable(null);

export const gamePaused = writable(false);

export const doctrinalFlash = writable(false);

export const currentShift = writable(0);

export const coherence = writable(100);

// Controls which CSS mode class is applied to the root element.
// 'VT220' → amber phosphor  |  'ANYK7' → green phosphor  |  'NMCC' → white sharp
export const terminalMode = writable('VT220');

export const gameState = derived(
  [clock, bandwidth, awareness, nature, feeds, anomalies, terminalState, currentShift, coherence, terminalMode],
  ([$clock, $bandwidth, $awareness, $nature, $feeds, $anomalies, $terminalState, $currentShift, $coherence, $terminalMode]) => ({
    clock: $clock,
    bandwidth: $bandwidth,
    awareness: $awareness,
    nature: $nature,
    feeds: $feeds,
    anomalies: $anomalies,
    terminalState: $terminalState,
    currentShift: $currentShift,
    coherence: $coherence,
    terminalMode: $terminalMode,
  })
);
