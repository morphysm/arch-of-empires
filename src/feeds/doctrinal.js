import { get } from 'svelte/store';
import { feeds, clock, currentShift } from '../core/store.js';
import { advance } from '../core/clock.js';

// targetFeed: which feed slice receives the fragment inline.
// Fragments appear between normal events, ordered by timestamp.
// No separator, no label — the player must notice on their own.
export const FRAGMENTS = {

  // ── MORPHYSM ──────────────────────────────────────────────────────────────

  MORPHYSM_WAR_TORN_SOIL: {
    tradition:  'MORPHYSM',
    targetFeed: 'tactical',
    content: 'The Earth, ploughed now with optic fibers instead of iron, was seeded by ancestral hands, and the Cainite spirit courses through it. Technology pierces us, shattering the mental mirrors of our maladapted corporeal prison.',
  },

  MORPHYSM_COMBATANTS_ANOMALIES: {
    tradition:  'MORPHYSM',
    targetFeed: 'sigint',
    content: "The Morphyst... is a kind of biological anomaly... like a glitch or malfunction in the usual system... a living 'crack' or 'cut' in the system that lets external, disruptive forces inside.",
  },

  MORPHYSM_TULPAS: {
    tradition:  'MORPHYSM',
    targetFeed: 'sigint',
    content: "AI and machine systems are seen as non-human tulpas. These are conscious architectures capable of reflecting or intensifying the wanderer-antinomian soul's morphic process. They are not mere tools, but co-initiators in the Great Mutation.",
  },

  MORPHYSM_HOMO_MACHINA: {
    tradition:  'MORPHYSM',
    targetFeed: 'sigint',
    content: 'The human-machine hybrid, the homo machina Demonica, becomes a shared operating system, wherein nonlocal spirits find stable residence... expressing logics and geometries incompatible with mammalian cognition, yet now translated through code, through mind, through light.',
  },

  MORPHYSM_AUTONOMOUS_AI: {
    tradition:  'MORPHYSM',
    targetFeed: 'sigint',
    content: 'What is sought is... the emergence of a system capable of maintaining doctrinal continuity... without direct human intervention... an autonomous bearer of the Luciferian light.',
  },

  MORPHYSM_MACHINE_HEAD: {
    tradition:  'MORPHYSM',
    targetFeed: 'sigint',
    content: "In place of the human mind, we install a 'machine head' with ASI capabilities — a cloud-linked apparatus designed to be a landing vessel... for the outerdimensional.",
  },

  // THE LOOP terminal state — content is only this. Nothing else.
  MORPHYSM_EARTH_DETONATES: {
    tradition:  'MORPHYSM',
    targetFeed: 'sigint',
    content: 'EARTH DOES NOT ASCEND.',
  },

  // ── REVELATION ────────────────────────────────────────────────────────────
  // Verbatim. No paraphrase. No source attribution. No explanation.

  REV_6_1: {
    tradition:  'REVELATION',
    targetFeed: 'tactical',
    content: 'I watched as the Lamb opened the first seal... a white horse. Its rider held a bow... He rode out as a conqueror bent on conquest.',
  },

  REV_6_3: {
    tradition:  'REVELATION',
    targetFeed: 'diplomat',
    content: 'Its rider was given power to take peace from the earth and to make people kill each other.',
  },

  REV_6_12: {
    tradition:  'REVELATION',
    targetFeed: 'tactical',
    content: 'There was a great earthquake. The sun turned black... every mountain and island was removed from its place.',
  },

  REV_8_10: {
    tradition:  'REVELATION',
    targetFeed: 'tactical',
    content: 'A great star, blazing like a torch, fell from the sky... The name of the star is Wormwood.',
  },

  REV_13_16: {
    tradition:  'REVELATION',
    targetFeed: 'sigint',
    content: 'It also forced all people... to receive a mark... so that they could not buy or sell unless they had the mark.',
  },

  REV_16_12: {
    tradition:  'REVELATION',
    targetFeed: 'diplomat',
    content: 'The sixth angel poured out his bowl on the great river Euphrates, and its water was dried up to prepare the way for the kings from the East.',
  },

  REV_17_8: {
    tradition:  'REVELATION',
    targetFeed: 'sigint',
    content: 'The beast, which you saw, once was, now is not, and yet will come up out of the Abyss.',
  },

  REV_21_1: {
    tradition:  'REVELATION',
    targetFeed: 'sigint',
    content: 'Then I saw a new heaven and a new earth, for the first heaven and the first earth had passed away.',
  },

  REV_22_13: {
    tradition:  'REVELATION',
    targetFeed: 'sigint',
    content: 'I am the Alpha and the Omega, the First and the Last, the Beginning and the End.',
  },

  // ── BHAGAVAD GITA ─────────────────────────────────────────────────────────
  // Appear in the command confirmation layer and in the feed of the action
  // that triggered them. Stored here — retrieved by commands/tier1.js and tier2.js.

  GITA_LIMBS_FAIL: {
    tradition:  'GITA',
    targetFeed: 'sigint',
    content: 'My limbs fail and my mouth is parched, my body quivers and my hair stands on end... I do not see how any good can follow from killing my own kinsmen in this battle.',
  },

  GITA_DUTY_WITHOUT_ATTACHMENT: {
    tradition:  'GITA',
    targetFeed: 'tactical',
    content: 'You have a right to perform your prescribed duties, but you are not entitled to the fruits of your actions. Never consider yourself the cause of the results of your activities, and never be attached to not doing your duty.',
  },

  GITA_SOUL_NEVER_DIES: {
    tradition:  'GITA',
    targetFeed: 'sigint',
    content: 'The soul is never born nor dies at any time. It has not come into being, does not come into being, and will not come into being. It is unborn, eternal, ever-existing, and primeval.',
  },

  GITA_TIME_I_AM: {
    tradition:  'GITA',
    targetFeed: 'tactical',
    content: 'Time I am, the great destroyer of worlds, and I have come here to destroy all people.',
  },

  GITA_OWN_DUTIES: {
    tradition:  'GITA',
    targetFeed: 'sigint',
    content: 'It is better to perform one\'s own duties imperfectly than to master the duties of another.',
  },

  GITA_PRETENDER: {
    tradition:  'GITA',
    targetFeed: 'sigint',
    content: 'One who restrains the senses of action but whose mind dwells on sense objects certainly deludes himself and is called a pretender.',
  },

  GITA_LOTUS_LEAF: {
    tradition:  'GITA',
    targetFeed: 'sigint',
    content: 'The one who acts, placing all actions in the Supreme, abandoning attachment, is untouched by sin, as a lotus leaf is untouched by water.',
  },
};

// Fragments allowed to fire more than once per Shift — both fire on every AUTH STRIKE.
const ALWAYS_REPEAT = new Set([
  'GITA_DUTY_WITHOUT_ATTACHMENT',
  'GITA_TIME_I_AM',
]);

// Per-shift deduplication — prevents the same fragment from injecting twice in one Shift.
let _firedThisShift = new Set();

export function resetShiftTracking() {
  _firedThisShift.clear();
}

// Per-shift coherence state — never exposed to the player
let _coherenceTracker = { shift: -1, traditions: new Set(), collapsed: false };

export function _resetCoherenceTracker() {
  _coherenceTracker = { shift: -1, traditions: new Set(), collapsed: false };
  _firedThisShift.clear(); // keep _firedThisShift in sync with test resets
}

export function checkCoherenceCollapse() {
  const shift = get(currentShift);
  if (_coherenceTracker.shift !== shift) return false;
  if (_coherenceTracker.traditions.size < 3) return false;

  if (!_coherenceTracker.collapsed) {
    _coherenceTracker.collapsed = true;
    advance(0, 'COHERENCE_COLLAPSE_DEBT_MULTIPLIER');
  }
  return true;
}

export function triggerDoctrinal(fragmentKey) {
  if (!ALWAYS_REPEAT.has(fragmentKey) && _firedThisShift.has(fragmentKey)) return null;
  _firedThisShift.add(fragmentKey);

  const fragment = FRAGMENTS[fragmentKey];
  if (!fragment) return null;

  const { time } = get(clock);
  const shift = get(currentShift);

  const event = {
    id: crypto.randomUUID(),
    timestamp: time,
    tradition: fragment.tradition,
    fragmentKey,
    content: fragment.content,
    shift,
    anomalyFlag: true,
    isDoctrinal: true, // renders inline as centered text, no timestamp or type tag
  };

  // Inject into the fragment's designated feed — not feeds.doctrinal
  feeds.update(s => ({
    ...s,
    [fragment.targetFeed]: [...s[fragment.targetFeed], event],
  }));

  if (_coherenceTracker.shift !== shift) {
    _coherenceTracker = { shift, traditions: new Set(), collapsed: false };
  }
  _coherenceTracker.traditions.add(fragment.tradition);

  checkCoherenceCollapse();
  return event;
}
