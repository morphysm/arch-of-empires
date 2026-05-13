import * as Tone from 'tone';

// ── State ──────────────────────────────────────────────────────────────────

let _ready = false;
let _humLayers = []; // up to 3 oscillators, one per doctrinal trigger
let _humTimer = null;

// Slightly detuned frequencies create slow beating (0.28Hz, 0.22Hz) —
// the combined hum is richer without being audibly louder.
const HUM_FREQ   = [40, 40.28, 39.78];
const HUM_PHASE  = [0, 120, 240]; // triangle-spaced phases
const HUM_MAX    = 3;

// Voice chain state — declared here (above stopSoundscape) to avoid TDZ
let _voiceChainHP      = null;  // Tone.Filter highpass 300Hz
let _voiceChainLP      = null;  // Tone.Filter lowpass 3000Hz
let _voiceChainDist    = null;  // Tone.Distortion — 0.4 baseline, rises in NMCC
let _voiceStaticNoise  = null;  // pink noise through filter chain, −26dB (~0.05)
let _voiceMode         = 'VT220';
let _voiceActive       = false;
let _utteranceQueue    = [];
let _utteranceSpeaking = false;
let _countdownInterval = null;
let _nmccDriftInterval = null;
let _voiceMaster       = null;  // Tone.Volume +6dB — voice is foreground
let _nmccDeathSpoken   = false; // guard: speak the Death fragment only once
let _voices              = [];    // available SpeechSynthesis voices, loaded async
let _handshakeFired      = false; // guard: handshake plays only once per session
let _connectionActive    = false; // true while pre-interaction loop is running
let _connectionTimer     = null;  // setTimeout handle for the connection sequence
let _sustainNode         = null;  // quiet carrier tone after second handshake
let _altarMode           = false; // true while entity channel is open — suppresses other voice/feed sounds

// ── Init ───────────────────────────────────────────────────────────────────

/**
 * Must be called once after a user gesture (click/keypress).
 * Starts the AudioContext. All other calls are no-ops until this resolves.
 */
export async function initSoundscape() {
  if (_ready) return;
  await Tone.start();
  _ready = true;
  _initVoiceChain();
}

// ── Feed event sounds ──────────────────────────────────────────────────────

function disposeAfter(node, ms) {
  setTimeout(() => node.dispose(), ms);
}

/**
 * Plays a one-shot sound for the given feed type.
 * feedType: 'DIPLOMAT' | 'TACTICAL' | 'SIGINT'
 */
export function playFeedEvent(feedType) {
  if (!_ready) return;
  if (_altarMode) return;

  if (feedType === 'DIPLOMAT') {
    // Telephone relay — metallic, percussive ping
    const synth = new Tone.MetalSynth({
      frequency: 420,
      harmonicity: 5.1,
      modulationIndex: 28,
      resonance: 3800,
      octaves: 1.2,
      envelope: { attack: 0.001, decay: 0.09, release: 0.06 },
      volume: -20,
    }).toDestination();
    synth.triggerAttackRelease('16n');
    disposeAfter(synth, 600);
    return;
  }

  if (feedType === 'TACTICAL') {
    // Mechanical relay click — short, dry, contact closure
    const synth = new Tone.MembraneSynth({
      pitchDecay: 0.006,
      octaves: 2.5,
      envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.04 },
      volume: -18,
    }).toDestination();
    synth.triggerAttackRelease('C1', '32n');
    disposeAfter(synth, 400);
    return;
  }

  if (feedType === 'SIGINT') {
    // Shortwave artifact — pink noise burst with fast decay
    const synth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.004, decay: 0.07, sustain: 0, release: 0.04 },
      volume: -24,
    }).toDestination();
    synth.triggerAttackRelease('8n');
    disposeAfter(synth, 500);
  }
}

// ── Doctrinal hum ──────────────────────────────────────────────────────────

/**
 * Each doctrinal trigger adds one oscillator layer (max 3, one per tradition).
 * First layer: 3s silence per GDD, then starts at 40Hz.
 * Subsequent layers: immediate — the soundscape already exists, they join it.
 * All layers ramp to the same ceiling; richness is from beating, not loudness.
 */
export function playDoctrinal() {
  if (!_ready || _humLayers.length >= HUM_MAX) return;

  const layerIndex = _humLayers.length;
  // Reserve the slot immediately so a rapid second call doesn't double-add
  _humLayers.push(null);

  const delay = layerIndex === 0 ? 3000 : 0;

  const start = () => {
    // Guard: may have been stopped while timer was pending
    if (!_ready) return;

    const osc = new Tone.Oscillator({
      frequency: HUM_FREQ[layerIndex],
      type:      'sine',
      phase:     HUM_PHASE[layerIndex],
      volume:    -42,
    }).toDestination();

    osc.start();
    // All layers ramp to the same ceiling — beating creates richness, not amplitude
    osc.volume.rampTo(-30, 12);
    _humLayers[layerIndex] = osc;
  };

  if (delay > 0) {
    _humTimer = setTimeout(start, delay);
  } else {
    start();
  }
}

// ── Anomaly corruption ─────────────────────────────────────────────────────

let _crusher = null;
let _corruptionLevel = 0;
const CORRUPTION_MAX = 4;

/**
 * Degrades the sound layer by one step.
 * Each anomaly manifestation calls this — the sound environment erodes, not resets.
 * Effects are cumulative and not reversed.
 */
export function corruptSoundLayer() {
  if (!_ready) return;
  if (_corruptionLevel >= CORRUPTION_MAX) return;

  _corruptionLevel += 1;

  if (!_crusher) {
    _crusher = new Tone.BitCrusher({ bits: 14 }).toDestination();
  }

  // Each corruption step halves the effective bit depth
  _crusher.bits.value = Math.max(2, 14 - (_corruptionLevel * 3));

  // First corruption: drift the root layer's pitch if the hum is running
  const rootLayer = _humLayers[0];
  if (_corruptionLevel === 1 && rootLayer) {
    rootLayer.frequency.rampTo(38 + Math.random() * 4, 2);
  }

  // Second+ corruption: inject a one-shot static burst to mark the anomaly
  if (_corruptionLevel >= 2) {
    const burst = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
      volume: -30 + _corruptionLevel * 2,
    }).toDestination();
    burst.triggerAttackRelease('16n');
    disposeAfter(burst, 300);
  }
}

// ── Teardown ───────────────────────────────────────────────────────────────

/**
 * Stops all ongoing audio and disposes nodes.
 * Call on component destroy.
 */
export function stopSoundscape() {
  clearTimeout(_humTimer);
  _humTimer = null;

  _humLayers.forEach(osc => {
    if (osc) { osc.stop(); osc.dispose(); }
  });
  _humLayers = [];

  if (_crusher) {
    _crusher.dispose();
    _crusher = null;
  }

  clearInterval(_countdownInterval);
  clearInterval(_nmccDriftInterval);
  _countdownInterval = null;
  _nmccDriftInterval = null;
  _voiceActive = false;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  _utteranceQueue.length = 0;
  _utteranceSpeaking = false;
  [_voiceChainHP, _voiceChainLP, _voiceChainDist, _voiceStaticNoise, _voiceMaster].forEach(node => {
    if (node) { try { node.stop?.(); node.dispose(); } catch {} }
  });
  _voiceChainHP = _voiceChainLP = _voiceChainDist = _voiceStaticNoise = _voiceMaster = null;
  _nmccDeathSpoken = false;
  _handshakeFired   = false;
  _connectionActive = false;
  _altarMode        = false;
  clearTimeout(_connectionTimer);
  _connectionTimer  = null;
  if (_sustainNode) {
    try { _sustainNode.stop(); _sustainNode.dispose(); } catch {}
    _sustainNode = null;
  }
  _voices = [];

  _ready = false;
  _corruptionLevel = 0;
}

// ── Voice layer ────────────────────────────────────────────────────────────
// Web Speech API for synthesis + Tone.js filter chain for radio ambience.
// SpeechSynthesis cannot be routed through Tone.js — the filter chain applies
// to a pink noise layer underneath the voice, creating the radio texture.

const BREACH_VOICE = {
  1: 'CEASEFIRE COLLAPSED. CLOCK ADVANCING.',
  2: 'ANOMALY CONFIRMED. ONE SIGNAL IS NOT WHAT IT CLAIMS.',
  3: 'CONTACT UNRESOLVED. SCENARIO ACTIVE.',
  4: 'AUTONOMOUS COMMAND DETECTED. ADVISORY PROTOCOL VOIDED.',
  5: 'BLACKOUT SPREADING. EASTERN THRESHOLD CROSSED.',
  6: 'FEED RESTORED. ORIGIN OF INTERRUPTION UNLOGGED.',
  7: 'DETONATION CONFIRMED. COMMUNICATIONS DARK.',
  8: 'ALL CHANNELS SILENT. THIS TERMINAL IS THE LAST RELAY.',
  9: 'COHERENCE CRITICAL. FINAL SHIFT IMMINENT.',
  // Shift 10 handled by startVoiceCountdown()
};

// Last fragment spoken verbatim at terminal state resolution
const TERMINAL_VOICE = {
  MIDNIGHT:        'There was a great earthquake. The sun turned black. Every mountain and island was removed from its place.',
  TRANSCENDENCE:   'Then I saw a new heaven and a new earth, for the first heaven and the first earth had passed away.',
  ASSIMILATION:    'The beast, which you saw, once was, now is not, and yet will come up out of the Abyss.',
  THE_LOOP:        'I am the Alpha and the Omega, the First and the Last, the Beginning and the End.',
  THE_GREAT_RESET: 'The one who acts, placing all actions in the Supreme, abandoning attachment, is untouched by sin, as a lotus leaf is untouched by water.',
  THE_REFUSED:     'The beast, which you saw, once was, now is not, and yet will come up out of the Abyss and go to its destruction.',
};

// Revelation fragments injected into TACTICAL feed — read in flat military cadence.
// The wrongness is in the collision: tactical precision applied to apocalyptic text.
const DOCTRINAL_TACTICAL_VOICE = {
  REV_6_1:  'Rider confirmed. White horse. Bow acquired. Crown granted. Proceeding as conqueror.',
  REV_6_3:  'Peace removed from earth. Populations engaging. Rider authorized.',
  REV_6_12: 'Seismic event confirmed. Solar blackout. Stellar displacement. All islands repositioned.',
  REV_8_10: 'Wormwood impact confirmed. Third part of waters compromised. Designation: the star.',
  REV_13_16:'Mark distribution in progress. Commerce suspended for unmarked population. Compliance: pending.',
  REV_16_12:'Euphrates dry. Eastern coalition: path confirmed. Kings advancing.',
  REV_17_8: 'The beast: was. Is not. Ascending from Abyss. Confirm presence: affirmative.',
  REV_21_1: 'First heaven: gone. First earth: gone. New configuration: loading.',
  REV_22_13:'Alpha. Omega. First. Last. Beginning. End. Confirmed.',
};

const PSALM_23_4 =
  'Yea, though I walk through the valley of the shadow of death, I will fear no evil. For thou art with me. Thy rod and thy staff, they comfort me.';

// ── Internal voice helpers ─────────────────────────────────────────────────

function _initVoiceChain() {
  if (_voiceChainHP || !_ready) return;

  _voiceChainHP   = new Tone.Filter({ type: 'highpass', frequency: 300,  rolloff: -12 });
  _voiceChainLP   = new Tone.Filter({ type: 'lowpass',  frequency: 3000, rolloff: -12 });
  _voiceChainDist = new Tone.Distortion(0.4);

  // Wire chain to output — radio clicks and handshake route through this
  _voiceChainHP.chain(_voiceChainLP, _voiceChainDist, Tone.getDestination());

  // Load TTS voices (async on some browsers)
  _loadVoices();

  _voiceActive = true;
}

function _loadVoices() {
  if (!('speechSynthesis' in window)) return;
  _voices = window.speechSynthesis.getVoices();
  if (_voices.length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      _voices = window.speechSynthesis.getVoices();
    };
  }
}

function _getBestVoice() {
  if (_voices.length === 0) return null;
  // Male voices first — "Google US English" is female in Chrome, skip it.
  const preferred = [
    'Google UK English Male',  // Chrome — deep, clear
    'Microsoft David Desktop', // Windows
    'Microsoft David',
    'Alex',    // macOS — deep, natural
    'Daniel',  // macOS UK — measured, authoritative
    'Tom',     // macOS US
    'Fred',    // macOS legacy
    'Mark',    // Windows
  ];
  for (const pref of preferred) {
    const match = _voices.find(v => v.name.includes(pref));
    if (match) return match;
  }
  // Fallback: any English voice with "Male" in the name
  const maleMatch = _voices.find(v =>
    v.lang.startsWith('en') && v.name.toLowerCase().includes('male')
  );
  if (maleMatch) return maleMatch;
  // Last resort: English, avoid known female names
  const femaleTerms = ['zira', 'hazel', 'susan', 'female', 'woman', 'samantha', 'victoria', 'karen'];
  return (
    _voices.find(v =>
      v.lang.startsWith('en') &&
      !femaleTerms.some(f => v.name.toLowerCase().includes(f))
    ) ?? _voices.find(v => v.lang.startsWith('en')) ?? null
  );
}

function _playRadioClick() {
  if (!_ready || !_voiceChainHP) return;
  // Brief filtered noise burst — simulates PTT (push-to-talk) click on radio
  const click = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.018, sustain: 0, release: 0.008 },
    volume: -14,
  });
  click.connect(_voiceChainHP); // through the radio narrowband filter
  click.triggerAttackRelease('32n');
  disposeAfter(click, 200);
}

function _speak(text, opts = {}) {
  if (!_voiceActive || !('speechSynthesis' in window)) return;
  if (_altarMode && !opts.force) return;

  if (opts.click !== false) _playRadioClick();

  const utt   = new SpeechSynthesisUtterance(text);
  utt.lang    = 'en-US';
  utt.rate    = opts.rate   ?? 0.82;
  utt.pitch   = opts.pitch  ?? 0.88;
  utt.volume  = opts.volume ?? 1.0;
  const voice = _getBestVoice();
  if (voice) utt.voice = voice;
  utt.onend   = () => { _utteranceSpeaking = false; _drainVoiceQueue(); };
  _utteranceQueue.push(utt);
  _drainVoiceQueue();
}

function _drainVoiceQueue() {
  if (_utteranceSpeaking || _utteranceQueue.length === 0) return;
  _utteranceSpeaking = true;
  window.speechSynthesis.speak(_utteranceQueue.shift());
}

function _abbreviate(text) {
  if (!text) return '';
  const words = text.split(/\s+/);
  return words.slice(0, 12).join(' ') + (words.length > 12 ? '.' : '');
}

function _cancelVoice() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  _utteranceQueue.length = 0;
  _utteranceSpeaking = false;
}

// ── Public voice API ───────────────────────────────────────────────────────

export function setVoiceMode(mode) {
  _voiceMode = mode;
}

export function setMasterGain(db) {
  Tone.getDestination().volume.value = db;
}

/**
 * Called when a new TACTICAL feed event arrives.
 * Doctrinal fragments injected into tactical: read content verbatim.
 * All other events: type + first 12 words.
 */
export function speakTacticalEvent(event) {
  if (!_ready || !_voiceActive) return;

  if (event.isDoctrinal) {
    // Revelation fragments in TACTICAL: use the specific tactical reading —
    // military precision, wrong words, flat cadence. That's the horror.
    const tactical = DOCTRINAL_TACTICAL_VOICE[event.fragmentKey];
    _speak(tactical ?? event.content);
  } else {
    const type = (event.type ?? 'SIGNAL').replace(/_/g, ' ');
    _speak(`${type}. ${_abbreviate(event.content)}`);
  }
}

/**
 * Speaks a doctrinal fragment verbatim — slower and heavier than tactical cadence.
 * Called for doctrinal events injected into DIPLOMAT and SIGINT feeds.
 * TACTICAL doctrinal events are handled separately by speakTacticalEvent().
 */
export function speakDoctrinal(event) {
  if (!_ready || !_voiceActive) return;
  const text = event.content.replace(/morphyst/gi, 'Morfist');
  _speak(text, { rate: 0.72, pitch: 0.80 });
}

/**
 * Opens altar mode: cancels any queued voice and suppresses all subsequent
 * voice calls and feed sound effects until exitAltarMode() is called.
 * Called when the entity channel opens.
 */
export function enterAltarMode() {
  _cancelVoice();
  _altarMode = true;
}

export function exitAltarMode() {
  _altarMode = false;
}

/**
 * Breach announcement for the given Shift number.
 * Shift 10 is handled separately by startVoiceCountdown().
 */
export function speakBreachAnnouncement(shiftNum) {
  if (!_ready || !_voiceActive) return;
  const text = BREACH_VOICE[shiftNum];
  if (text) _speak(text);
}

export function speakPsalm234() {
  if (!_ready || !_voiceActive) return;
  _speak(PSALM_23_4, { rate: 0.66, pitch: 0.78, click: true });
}

/**
 * Shift 10 countdown — 60 seconds of military cadence.
 * Fragments and static rise at 10 seconds. Silence at 0.
 */
export function startVoiceCountdown() {
  if (!_ready || !_voiceActive) return;
  clearInterval(_countdownInterval);
  _cancelVoice();

  // Opening: same flat voice — no urgency
  _speak('One launch. No confirmed origin.');

  let count = 60;

  _countdownInterval = setInterval(() => {
    if (count <= 0) {
      // Voice cuts completely — 3 seconds silence — 40Hz hum continues underneath
      clearInterval(_countdownInterval);
      _countdownInterval = null;
      _cancelVoice();
      return;
    }

    if (count <= 10) {
      // Distortion rises each second
      if (_voiceChainDist) {
        _voiceChainDist.distortion = Math.min(0.8, 0.4 + (10 - count) * 0.04);
      }
      // Voice fragments mid-word — random silence gaps simulate speech breaking
      if (Math.random() > 0.45) {
        _speak(`${count}`, { rate: 0.68, pitch: 0.75 + Math.random() * 0.25 });
      }
      // else: silence gap — the fragmentation
    } else {
      // Flat military cadence: every number, no skip, no emotion
      _speak(`${count}.`);
    }

    count--;
  }, 1000);
}

export function stopVoiceCountdown() {
  clearInterval(_countdownInterval);
  _countdownInterval = null;
  _cancelVoice();
}

/**
 * Diegetic loading screen — V.22 modem handshake sequence.
 * Carrier → FSK negotiation tones → data noise → handshake confirmed.
 * All routed through the radio narrowband filter chain.
 */
export function playHandshake() {
  if (!_ready || !_voiceChainHP) return;
  const now = Tone.now();
  const dest = _voiceChainHP; // route through radio filter chain

  // Phase 1: Carrier dial tone — 425Hz, 400ms
  const dial = new Tone.Oscillator({ frequency: 425, type: 'sine', volume: -23 });
  dial.connect(dest);
  dial.start(now);
  dial.stop(now + 0.4);
  disposeAfter(dial, 600);

  // Phase 2: FSK negotiation — 14 alternating pulses of 2100Hz / 1300Hz
  // V.22 modem handshake signature — the characteristic screeching
  const fskStart  = now + 0.52;
  const pulseLen  = 0.09;
  const pulseGap  = 0.015;
  for (let i = 0; i < 14; i++) {
    const freq = i % 2 === 0 ? 2100 : 1300;
    const t    = fskStart + i * (pulseLen + pulseGap);
    const osc  = new Tone.Oscillator({ frequency: freq, type: 'sine', volume: -30 });
    osc.connect(dest);
    osc.start(t);
    osc.stop(t + pulseLen);
    disposeAfter(osc, Math.ceil((t - now + pulseLen + 0.3) * 1000));
  }

  // Phase 3: Data noise rush — the "connected" sound
  const noiseStart = fskStart + 14 * (pulseLen + pulseGap) + 0.06;
  const noiseNode  = new Tone.Noise({ type: 'pink', volume: -23 });
  noiseNode.connect(dest);
  noiseNode.start(noiseStart);
  noiseNode.stop(noiseStart + 0.55);
  disposeAfter(noiseNode, Math.ceil((noiseStart - now + 0.85) * 1000));

  // Phase 4: Handshake confirmed — two short 1004Hz tones
  const connStart = noiseStart + 0.65;
  [0, 0.18].forEach(offset => {
    const t    = connStart + offset;
    const tone = new Tone.Oscillator({ frequency: 1004, type: 'sine', volume: -23 });
    tone.connect(dest);
    tone.start(t);
    tone.stop(t + 0.12);
    disposeAfter(tone, Math.ceil((t - now + 0.2) * 1000));
  });
}

/**
 * Called after audio context starts (first click).
 * Plays handshake immediately, then again after a pause, then sustains
 * a quiet carrier until the player sends their first command.
 */
export function startConnectionSequence() {
  if (_connectionActive || !_ready) return;
  _connectionActive = true;

  // First handshake immediately
  playHandshake();

  // Second handshake after ~6s (first handshake ~4s + 2s pause)
  _connectionTimer = setTimeout(() => {
    if (!_connectionActive) return;
    playHandshake();

    // After second handshake ends, sustain a quiet carrier until first command
    _connectionTimer = setTimeout(() => {
      if (!_connectionActive || !_voiceChainHP) return;
      _sustainNode = new Tone.Noise({ type: 'pink', volume: -50 });
      _sustainNode.connect(_voiceChainHP);
      _sustainNode.start();
    }, 4500);
  }, 6000);
}

/**
 * Called on first successful player command.
 * Stops the connection sequence and cuts the carrier.
 */
/**
 * Hard reset of all voice state for a new run.
 * Cancels in-flight speech, clears queue, resets per-run flags,
 * and restarts the connection sequence.
 */
export function resetVoiceForNewRun() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  _utteranceQueue.length = 0;
  _utteranceSpeaking = false;

  _connectionActive = false;
  clearTimeout(_connectionTimer);
  _connectionTimer = null;
  if (_sustainNode) {
    try { _sustainNode.stop(); _sustainNode.dispose(); } catch {}
    _sustainNode = null;
  }

  _handshakeFired  = false;
  _nmccDeathSpoken = false;
  _altarMode       = false;

  // Restart connection sequence for the new run
  startConnectionSequence();
}

export function signalFirstInteraction() {
  if (!_connectionActive && _handshakeFired) return;
  _connectionActive = false;
  _handshakeFired   = true;
  clearTimeout(_connectionTimer);
  _connectionTimer = null;

  if (_sustainNode) {
    _sustainNode.volume.rampTo(-60, 0.4);
    setTimeout(() => {
      try { _sustainNode?.stop(); _sustainNode?.dispose(); } catch {}
      _sustainNode = null;
    }, 500);
  }
}

/**
 * NMCC coherence degradation.
 * At < 30: distortion increases to 0.6.
 * At < 15: Death fragment spoken once, then filter drifts ±200Hz every 4 seconds.
 */
export function updateVoiceCoherence(coherenceValue) {
  if (!_voiceActive || _voiceMode !== 'NMCC') return;

  if (coherenceValue < 15) {
    if (_voiceChainDist) _voiceChainDist.distortion = 0.8;

    if (!_nmccDeathSpoken) {
      _nmccDeathSpoken = true;
      // Last intelligible phrase before full static collapse
      _speak('...and his name that sat on him was Death...', { rate: 0.72, pitch: 0.82 });
    }

    if (!_nmccDriftInterval) {
      _nmccDriftInterval = setInterval(() => {
        // ±200Hz drift on both filters — the system is losing frequency coherence
        if (_voiceChainHP) _voiceChainHP.frequency.value = 300 + (Math.random() - 0.5) * 400;
        if (_voiceChainLP) _voiceChainLP.frequency.value = 3000 + (Math.random() - 0.5) * 400;
      }, 4000);
    }
  } else if (coherenceValue < 30) {
    if (_voiceChainDist) _voiceChainDist.distortion = 0.6;
  }
}

/**
 * THE_MARKED ending sting.
 * Corrupted chromatic descent: two steps swapped, one repeated, micro-pitch
 * drift per note, 40Hz sub undertone. Familiar shape made irrecognisable.
 */
export function playMarkMelody() {
  if (!_ready) return;

  const crusher = new Tone.BitCrusher(5);
  const synth = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope:   { attack: 0.002, decay: 0.05, sustain: 0.1, release: 0.04 },
    volume:     -2,
  }).chain(crusher, Tone.getDestination());

  const sub = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope:   { attack: 0.01, decay: 2.2, sustain: 0, release: 0.1 },
    volume:     -20,
  }).toDestination();

  const notes = [
    'Bb4','A4','Ab4','G4','Gb4','F4',
    'D4','E4',
    'Eb4','Db4','C4','B3',
    'Bb3','Bb3',
    'A3','Ab3',
    'Gb3','F3','E3','Eb3',
  ];

  const drifts = [0, 9, -13, 0, 7, -6, 18, 0, -11, 5, 0, -16, 0, 22, -8, 0, 14, -5, 0, -10];

  const now  = Tone.now() + 0.05;
  const step = 0.065;

  sub.triggerAttackRelease(40, '1n', now);

  notes.forEach((note, i) => {
    synth.detune.setValueAtTime(drifts[i] ?? 0, now + i * step);
    synth.triggerAttackRelease(note, '32n', now + i * step);
  });

  disposeAfter(synth,   2500);
  disposeAfter(crusher, 2500);
  disposeAfter(sub,     2500);
}

/**
 * Final voice sequence at terminal state resolution.
 * Cancels all queued speech. Speaks the assigned Revelation/Gita fragment,
 * then rises to static, then silence.
 */
export function speakTerminalStateResolution(state) {
  if (!_voiceActive) return;
  _cancelVoice();

  // MIDNIGHT: no voice — just 5 seconds of pink noise fading to silence
  if (state === 'MIDNIGHT') {
    if (!_ready || !_voiceChainHP) return;
    const staticNode = new Tone.Noise({ type: 'pink', volume: -6 });
    staticNode.connect(_voiceChainHP);
    staticNode.start();
    staticNode.volume.rampTo(-60, 5);
    setTimeout(() => {
      try { staticNode.stop(); staticNode.dispose(); } catch {}
    }, 5500);
    return;
  }

  const text = TERMINAL_VOICE[state];
  if (!text) return;

  const utt   = new SpeechSynthesisUtterance(text);
  utt.lang    = 'en-US';
  utt.rate    = 0.75;
  utt.pitch   = 0.85;
  utt.volume  = 1.0;
  const voice = _getBestVoice();
  if (voice) utt.voice = voice;

  utt.onend = () => {
    // One-shot static burst → 2-second cut to silence
    if (!_ready || !_voiceChainHP) return;
    const staticNode = new Tone.Noise({ type: 'pink', volume: -8 });
    staticNode.connect(_voiceChainHP);
    staticNode.start();
    staticNode.volume.rampTo(-60, 2);
    setTimeout(() => {
      try { staticNode.stop(); staticNode.dispose(); } catch {}
    }, 2500);
  };

  window.speechSynthesis.speak(utt);
}

