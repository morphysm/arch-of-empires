import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
  clock, bandwidth, currentShift, feeds,
  terminalMode, terminalState, coherence, anomalies, nature, commandCount, altarRevealed,
} from '../src/core/store.js';

vi.mock('../src/core/clock.js',          () => ({ advance: vi.fn() }));
vi.mock('../src/feeds/doctrinal.js',     () => ({ triggerDoctrinal: vi.fn(), resetShiftTracking: vi.fn() }));
vi.mock('../src/core/anomaly.js',        () => ({ drawAspects: vi.fn(), manifestAnomaly: vi.fn() }));
vi.mock('../src/core/persistence.js',   () => ({
  loadGhostSignals:  vi.fn().mockResolvedValue([]),
  loadLastCommand:   vi.fn().mockResolvedValue(null),
  saveGhostSignal:   vi.fn(),
  saveCurrentShift:  vi.fn(),
}));
vi.mock('../src/scenarios/engine.js',   () => ({
  loadScenario: vi.fn().mockResolvedValue({}),
  endShift:     vi.fn(),
  checkUnlocks: vi.fn().mockReturnValue(false),
}));
vi.mock('../src/endgame/terminalStates.js', () => ({
  checkEndgameConditions: vi.fn().mockReturnValue(null),
  resolveTerminalState:   vi.fn().mockReturnValue(null),
}));
vi.mock('../src/audio/soundscape.js', () => ({
  speakBreachAnnouncement: vi.fn(),
  speakPsalm234:           vi.fn(),
  startVoiceCountdown:     vi.fn(),
}));
vi.mock('../src/terminal/entity.js', () => ({ openEntityChannel: vi.fn() }));

import { advance }                           from '../src/core/clock.js';
import { triggerDoctrinal }                  from '../src/feeds/doctrinal.js';
import { drawAspects, manifestAnomaly }      from '../src/core/anomaly.js';
import { loadGhostSignals, loadLastCommand } from '../src/core/persistence.js';
import { endShift as engineEndShift }        from '../src/scenarios/engine.js';
import { checkEndgameConditions, resolveTerminalState } from '../src/endgame/terminalStates.js';
import { speakPsalm234 }                     from '../src/audio/soundscape.js';
import { openEntityChannel }                 from '../src/terminal/entity.js';

import {
  startShift, runCascade, triggerBreach, startHaunting,
  getLastEndgame,
  _resetCampaignForTesting,
  _getCascadeTimerCount,
} from '../src/scenarios/campaign.js';

function resetStores() {
  clock.set({ time: '11:54:00', debtLedger: [] });
  bandwidth.set({ total: 100, spent: 50 });
  currentShift.set(0);
  feeds.set({ diplomat: [], tactical: [], sigint: [], doctrinal: [] });
  terminalMode.set('VT220');
  terminalState.set(null);
  coherence.set(100);
  anomalies.set({ aspects: [], manifestations: [] });
  nature.set({ system: 0, prophet: 0, antichrist: 0, martyr: 0 });
  commandCount.set(0);
  altarRevealed.set(false);
}

beforeEach(() => {
  resetStores();
  vi.useFakeTimers();
  vi.clearAllMocks();
  _resetCampaignForTesting();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── startShift() — terminal mode per act ──────────────────────────────────

describe('startShift() — terminal mode', () => {
  it('sets VT220 for Act 1 (Shifts 1–3)', async () => {
    await startShift(1);
    expect(get(terminalMode)).toBe('VT220');
  });

  it('sets VT220 for Shift 3', async () => {
    await startShift(3);
    expect(get(terminalMode)).toBe('VT220');
  });

  it('sets ANYK7 for Act 2 (Shift 4)', async () => {
    await startShift(4);
    expect(get(terminalMode)).toBe('ANYK7');
  });

  it('sets ANYK7 for Shift 7', async () => {
    await startShift(7);
    expect(get(terminalMode)).toBe('ANYK7');
  });

  it('sets NMCC for Act 3 (Shift 8)', async () => {
    await startShift(8);
    expect(get(terminalMode)).toBe('NMCC');
  });

  it('sets NMCC for Shift 10', async () => {
    await startShift(10);
    expect(get(terminalMode)).toBe('NMCC');
  });
});

// ── startShift() — bandwidth refill ───────────────────────────────────────

describe('startShift() — bandwidth refill', () => {
  it('resets spent to 0 regardless of previous spend', async () => {
    bandwidth.set({ total: 100, spent: 73 });
    await startShift(1);
    expect(get(bandwidth).spent).toBe(0);
  });

  it('preserves total bandwidth at 100', async () => {
    await startShift(3);
    expect(get(bandwidth).total).toBe(100);
  });

  it('refills at the start of every act transition', async () => {
    bandwidth.set({ total: 100, spent: 99 });
    await startShift(4);
    expect(get(bandwidth).spent).toBe(0);
  });
});

// ── startShift() — ghost command injection ────────────────────────────────

describe('startShift() — ghost command injection', () => {
  it('injects ghost command event as first sigint entry when lastCommand exists', async () => {
    loadLastCommand.mockResolvedValue('VERIFY sig-001');
    await startShift(1);
    const sigint = get(feeds).sigint;
    expect(sigint[0].id).toBe('ghost-command-000');
    expect(sigint[0].content).toBe('"VERIFY sig-001"');
    expect(sigint[0].isGhost).toBe(true);
  });

  it('ghost event type is INTERCEPT', async () => {
    loadLastCommand.mockResolvedValue('AUTH STRIKE abc');
    await startShift(1);
    // ghost command is prepended before the system briefing
    expect(get(feeds).sigint[0].type).toBe('INTERCEPT');
  });

  it('ghost event source is KIA // AGENT: UNKNOWN', async () => {
    loadLastCommand.mockResolvedValue('PRAY');
    await startShift(1);
    expect(get(feeds).sigint[0].source).toBe('KIA // AGENT: UNKNOWN');
  });

  it('injects no ghost command when loadLastCommand returns null', async () => {
    loadLastCommand.mockResolvedValue(null);
    await startShift(1);
    // sys-001 briefing is always present; no ghost command event
    const ghostEvents = get(feeds).sigint.filter(e => e.isGhost);
    expect(ghostEvents).toHaveLength(0);
  });

  it('ghost event is prepended — sits before any cascade events', async () => {
    loadLastCommand.mockResolvedValue('INTERCEPT x');
    await startShift(1);
    // Advance past first cascade event (5s diplomat)
    vi.advanceTimersByTime(6_000);
    const sigint = get(feeds).sigint;
    expect(sigint[0].id).toBe('ghost-command-000');
  });

  it('calls loadGhostSignals before loadLastCommand', async () => {
    const callOrder = [];
    loadGhostSignals.mockImplementation(() => { callOrder.push('ghosts'); return Promise.resolve([]); });
    loadLastCommand.mockImplementation(() => { callOrder.push('command'); return Promise.resolve(null); });
    await startShift(1);
    expect(callOrder).toEqual(['ghosts', 'command']);
  });
});

// ── startShift() — anomaly engine activation ──────────────────────────────

describe('startShift() — anomaly engine', () => {
  it('calls drawAspects() on Shift 4', async () => {
    await startShift(4);
    expect(drawAspects).toHaveBeenCalledOnce();
  });

  it('does not call drawAspects() on Shift 3', async () => {
    await startShift(3);
    expect(drawAspects).not.toHaveBeenCalled();
  });

  it('does not call drawAspects() on Shift 5', async () => {
    await startShift(5);
    expect(drawAspects).not.toHaveBeenCalled();
  });
});

// ── runCascade() — events fire in correct order ────────────────────────────

describe('runCascade(1) — Shift 1 event order', () => {
  beforeEach(() => runCascade(1));

  it('fires diplomat event at 5 seconds', () => {
    vi.advanceTimersByTime(5_001);
    expect(get(feeds).diplomat).toHaveLength(1);
    expect(get(feeds).tactical).toHaveLength(0);
    expect(get(feeds).sigint).toHaveLength(0);
  });

  it('fires tactical event at 15 seconds', () => {
    vi.advanceTimersByTime(15_001);
    expect(get(feeds).tactical).toHaveLength(1);
  });

  it('fires sigint event at 30 seconds', () => {
    vi.advanceTimersByTime(30_001);
    expect(get(feeds).sigint).toHaveLength(1);
  });

  it('diplomat event type is CEASEFIRE_STATUS', () => {
    vi.advanceTimersByTime(5_001);
    expect(get(feeds).diplomat[0].type).toBe('CEASEFIRE_STATUS');
  });

  it('tactical event origin is North Atlantic', () => {
    vi.advanceTimersByTime(15_001);
    expect(get(feeds).tactical[0].origin).toBe('North Atlantic');
  });

  it('does not fire tactical before diplomat', () => {
    vi.advanceTimersByTime(5_000); // exactly at 5s boundary — not yet
    vi.advanceTimersByTime(9_999); // total 14.999s — tactical not yet
    expect(get(feeds).tactical).toHaveLength(0);
  });
});

describe('runCascade(1) — unanswered event clock pressure', () => {
  it('advances the clock by 2 minutes after 5 events with no player interaction', () => {
    runCascade(1);
    runCascade(2);
    vi.advanceTimersByTime(30_001);
    expect(advance).toHaveBeenCalledWith(120, 'PLAYER_INACTION');
  });

  it('resets the unanswered event count when the player enters a command', () => {
    runCascade(1);
    vi.advanceTimersByTime(15_001);
    commandCount.set(1);
    vi.advanceTimersByTime(15_000);
    expect(advance).not.toHaveBeenCalledWith(120, 'PLAYER_INACTION');
  });

  it('does not count shift briefing events as ignored player events', async () => {
    await startShift(1);
    expect(advance).not.toHaveBeenCalledWith(120, 'PLAYER_INACTION');
  });
});

describe('runCascade(4) — Shift 4 doctrinal triggers', () => {
  it('fires GITA_SOUL_NEVER_DIES with dead agent event at 5s', () => {
    runCascade(4);
    vi.advanceTimersByTime(5_001);
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_SOUL_NEVER_DIES');
  });

  it('fires REV_8_10 with satellite event at 20s', () => {
    runCascade(4);
    vi.advanceTimersByTime(20_001);
    expect(triggerDoctrinal).toHaveBeenCalledWith('REV_8_10');
  });
});

describe('runCascade(5) — two anomaly manifestations', () => {
  it('fires two manifestAnomaly() calls', () => {
    runCascade(5);
    vi.advanceTimersByTime(41_000);
    expect(manifestAnomaly).toHaveBeenCalledTimes(2);
  });
});

describe('runCascade(9) — guaranteed coherence collapse', () => {
  it('fires all three doctrinal traditions', () => {
    runCascade(9);
    vi.advanceTimersByTime(36_000);
    expect(triggerDoctrinal).toHaveBeenCalledWith('MORPHYSM_COMBATANTS_ANOMALIES');
    expect(triggerDoctrinal).toHaveBeenCalledWith('REV_6_12');
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_LIMBS_FAIL');
  });
});

describe('runCascade(9) — entity reaction to refused mark', () => {
  it('opens entity channel at 45s when altarRevealed and no terminal state', () => {
    altarRevealed.set(true);
    terminalState.set(null);
    runCascade(9);
    vi.advanceTimersByTime(45_001);
    expect(openEntityChannel).toHaveBeenCalled();
  });

  it('does NOT open entity channel when altarRevealed is false', () => {
    altarRevealed.set(false);
    runCascade(9);
    vi.advanceTimersByTime(45_001);
    expect(openEntityChannel).not.toHaveBeenCalled();
  });

  it('does NOT open entity channel when a terminal state is already set', () => {
    altarRevealed.set(true);
    terminalState.set('THE_MARKED');
    runCascade(9);
    vi.advanceTimersByTime(45_001);
    expect(openEntityChannel).not.toHaveBeenCalled();
  });

  it('entity channel lines reference other operators and the standing offer', () => {
    altarRevealed.set(true);
    runCascade(9);
    vi.advanceTimersByTime(45_001);
    const [lines] = openEntityChannel.mock.calls[0];
    expect(lines).toContain('OTHERS WHO SAT WHERE YOU SIT.');
    expect(lines).toContain('THE OFFER IS STILL OPEN.');
  });
});

// ── Shift 10 CASCADE — no automatic timer ─────────────────────────────────

describe('Shift 10 CASCADE — no automatic event timers', () => {
  it('runCascade(10) adds no timers to the cascade timer list', () => {
    runCascade(10);
    expect(_getCascadeTimerCount()).toBe(0);
  });

  it('runCascade(10) fires no feed events even after a long wait', () => {
    runCascade(10);
    vi.advanceTimersByTime(999_999);
    expect(get(feeds).diplomat).toHaveLength(0);
    expect(get(feeds).tactical).toHaveLength(0);
    expect(get(feeds).sigint).toHaveLength(0);
  });
});

// ── triggerBreach() — calls checkEndgameConditions ────────────────────────

describe('triggerBreach() — checkEndgameConditions', () => {
  it('triggerBreach(4) calls checkEndgameConditions()', () => {
    triggerBreach(4);
    expect(checkEndgameConditions).toHaveBeenCalled();
  });

  it('triggerBreach(5) calls checkEndgameConditions()', () => {
    triggerBreach(5);
    expect(checkEndgameConditions).toHaveBeenCalled();
  });

  it('triggerBreach(6) calls checkEndgameConditions()', () => {
    triggerBreach(6);
    expect(checkEndgameConditions).toHaveBeenCalled();
  });

  it('triggerBreach(7) calls checkEndgameConditions()', () => {
    triggerBreach(7);
    expect(checkEndgameConditions).toHaveBeenCalled();
  });

  it('triggerBreach(8) calls checkEndgameConditions()', () => {
    triggerBreach(8);
    expect(checkEndgameConditions).toHaveBeenCalled();
  });

  it('triggerBreach(9) calls checkEndgameConditions()', () => {
    triggerBreach(9);
    expect(checkEndgameConditions).toHaveBeenCalled();
  });

  it('triggerBreach(10) calls checkEndgameConditions()', () => {
    triggerBreach(10);
    expect(checkEndgameConditions).toHaveBeenCalled();
  });
});

describe('triggerBreach(1) — clock and doctrinal', () => {
  it('advances clock by 5 with source FAILED_DIPLOMACY', () => {
    triggerBreach(1);
    expect(advance).toHaveBeenCalledWith(5, 'FAILED_DIPLOMACY');
  });

  it('fires REV_6_3', () => {
    triggerBreach(1);
    expect(triggerDoctrinal).toHaveBeenCalledWith('REV_6_3');
  });
});

describe('triggerBreach(7) — coherence and doctrinal', () => {
  it('drops coherence to at most 45', () => {
    coherence.set(80);
    triggerBreach(7);
    expect(get(coherence)).toBeLessThanOrEqual(45);
  });

  it('does not raise coherence if already below 45', () => {
    coherence.set(30);
    triggerBreach(7);
    expect(get(coherence)).toBe(30);
  });

  it('fires MORPHYSM_COMBATANTS_ANOMALIES', () => {
    triggerBreach(7);
    expect(triggerDoctrinal).toHaveBeenCalledWith('MORPHYSM_COMBATANTS_ANOMALIES');
  });
});

describe('runCascade(7) — Shadow Valley voice', () => {
  it('preaches Psalm 23:4 after the Shadow Valley intercept opens', () => {
    runCascade(7);
    vi.advanceTimersByTime(3_001);
    expect(speakPsalm234).toHaveBeenCalledOnce();
  });
});

describe('triggerBreach(9) — coherence floor', () => {
  it('drops coherence to at most 25', () => {
    coherence.set(60);
    triggerBreach(9);
    expect(get(coherence)).toBeLessThanOrEqual(25);
  });
});

// ── resolveTerminalState fires in Shift 10 breach ─────────────────────────

describe('Shift 10 breach — resolveTerminalState fires', () => {
  it('triggerBreach(10) calls resolveTerminalState()', () => {
    triggerBreach(10);
    expect(resolveTerminalState).toHaveBeenCalled();
  });

  it('resolveTerminalState receives current terminalState and nature', () => {
    terminalState.set('MIDNIGHT');
    nature.set({ system: 5, prophet: 0, antichrist: 0, martyr: 0 });
    triggerBreach(10);
    expect(resolveTerminalState).toHaveBeenCalledWith('MIDNIGHT', expect.objectContaining({ system: 5 }));
  });

  it('getLastEndgame() returns resolveTerminalState result after breach', () => {
    const mockScreen = { state: 'MIDNIGHT', variant: 'NUCLEAR', heading: 'MIDNIGHT', body: [] };
    resolveTerminalState.mockReturnValue(mockScreen);
    triggerBreach(10);
    expect(getLastEndgame()).toEqual(mockScreen);
  });

  it('calls advance(600, FINAL_RECKONING) when no terminal state set', () => {
    terminalState.set(null);
    triggerBreach(10);
    expect(advance).toHaveBeenCalledWith(600, 'FINAL_RECKONING');
  });

  it('does not call advance when terminal state is already set', () => {
    terminalState.set('TRANSCENDENCE');
    triggerBreach(10);
    expect(advance).not.toHaveBeenCalledWith(600, 'FINAL_RECKONING');
  });

  it('breach fires after 60s timer from startShift(10)', async () => {
    await startShift(10);
    vi.advanceTimersByTime(60_001);
    expect(resolveTerminalState).toHaveBeenCalled();
  });
});

// ── inaction detection — GITA_LIMBS_FAIL ─────────────────────────────────

describe('inaction detection — GITA_LIMBS_FAIL', () => {
  it('fires GITA_LIMBS_FAIL when no commands typed during the shift', async () => {
    commandCount.set(0);
    await startShift(1);
    triggerBreach(1);
    expect(triggerDoctrinal).toHaveBeenCalledWith('GITA_LIMBS_FAIL');
  });

  it('does NOT fire GITA_LIMBS_FAIL when commands were typed during the shift', async () => {
    commandCount.set(0);
    await startShift(1);
    commandCount.set(3);
    triggerBreach(1);
    expect(triggerDoctrinal).not.toHaveBeenCalledWith('GITA_LIMBS_FAIL');
  });

  it('fires only once — second shift of inaction does not trigger again', async () => {
    commandCount.set(0);
    await startShift(1);
    triggerBreach(1); // first inaction — fires

    await startShift(2); // captures commandCount still at 0
    triggerBreach(2); // second inaction — _gitaLimbsFired guards it

    const gitaCalls = triggerDoctrinal.mock.calls.filter(([k]) => k === 'GITA_LIMBS_FAIL');
    expect(gitaCalls).toHaveLength(1);
  });
});

// ── startHaunting() — shift lifecycle ─────────────────────────────────────

describe('startHaunting()', () => {
  it('calls engineEndShift()', () => {
    startHaunting(1);
    expect(engineEndShift).toHaveBeenCalledOnce();
  });

  it('calls startShift(n+1) after 3 second pause', async () => {
    startHaunting(2);
    vi.advanceTimersByTime(3_001);
    // startShift(3) fires async ops — flush them
    await Promise.resolve();
    expect(get(currentShift)).toBe(3);
  });

  it('does not advance past Shift 10', () => {
    startHaunting(10);
    vi.advanceTimersByTime(5_000);
    expect(get(currentShift)).toBe(0); // stays at initial value — Shift 11 never starts
  });
});
