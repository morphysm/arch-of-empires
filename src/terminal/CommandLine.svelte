<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { feeds, clock, currentShift, commandCount, awareness, coherence, anomalies, nature, gamePaused, doctrinalFlash, pendingLetter, pendingYes } from '../core/store.js';
  import { intercept, auth, silence, leak } from '../commands/tier1.js';
  import { verify, decode, triangulate }     from '../commands/tier2.js';
  import { pray, obey, transcend, rewriteOrigin, obliterateMemoir, mark, refuse } from '../commands/tier3.js';
  import { acknowledgeAnomaly } from '../core/anomaly.js';
  import { openEntityChannel, closeEntityChannel } from './entity.js';
  import { checkUnlocks, resolveCommandOnScenarioEvent } from '../scenarios/engine.js';
  import { saveLastCommand } from '../core/persistence.js';
  import { resolveTraditionTarget } from '../core/eventIds.js';
  import { signalFirstInteraction } from '../audio/soundscape.js';
  import { registerOperatorError } from '../core/operatorError.js';
  import { pauseTimers, resumeTimers } from '../scenarios/campaign.js';

  let inputValue  = '';
  let history     = [];   // most-recent first, max 50
  let historyIdx  = -1;   // -1 = not browsing history
  let inputEl;

  $: inputValue = inputValue.toUpperCase();

  onMount(() => inputEl?.focus());

  // ── Store helpers ─────────────────────────────────────────────

  function appendSigint(type, content, anomalyFlag) {
    feeds.update(s => ({
      ...s,
      sigint: [...s.sigint, {
        id: crypto.randomUUID(),
        timestamp: get(clock).time,
        type,
        content,
        anomalyFlag,
        verified: false,
        isGhost: false,
        shift: get(currentShift),
      }],
    }));
  }

  function appendResult(result) {
    if (!result) return;

    if (result.reason === 'BANDWIDTH_EXCEEDED') {
      appendSigint('SYSTEM', 'BANDWIDTH EXCEEDED — COMMAND REJECTED', true);
      return;
    }

    const failText = result.reason === 'DECODE_FAILED' ? 'FAILED' : (result.reason || 'FAILED');
    const content    = result.command + ': ' + (result.success ? 'OK' : failText);
    const anomalyFlag = result.anomalyFlag === true || result.success === false;
    appendSigint('SYSTEM', content, anomalyFlag);
  }

  function appendOperatorError(command, target, reason) {
    const penalty = registerOperatorError();
    appendResult({
      command,
      target,
      success: false,
      reason,
      anomalyFlag: true,
      doctrinalTriggered: null,
      operatorError: true,
      ...penalty,
    });
  }

  // ── Tab completion ────────────────────────────────────────────

  const COMPLETIONS = ['INTERCEPT', 'AUTH', 'SILENCE', 'LEAK', 'VERIFY', 'DECODE', 'TRIANGULATE'];
  const SCENARIO_CMDS = new Set(['INTERCEPT', 'VERIFY', 'DECODE', 'TRIANGULATE']);

  function tabComplete(input) {
    const upper = input.toUpperCase();
    const matches = COMPLETIONS.filter(c => c.startsWith(upper));
    if (matches.length === 0) return upper;
    if (matches.length === 1) return matches[0];
    let common = matches[0];
    for (let i = 1; i < matches.length; i++) {
      while (!matches[i].startsWith(common)) common = common.slice(0, -1);
    }
    return common;
  }

  // ── Target resolution ─────────────────────────────────────────

  // Resolves tradition aliases (e.g. "GITA", "BHAGAVAD GITA", "BIBLE") to
  // the event ID of the most recent matching doctrinal event in the feeds.
  // Tries multi-word join first so "BHAGAVAD GITA" works as a single target.
  function resolveTarget(args) {
    if (!args.length) return undefined;
    const joined = args.join(' ');
    return resolveTraditionTarget(joined, get(feeds))
        ?? resolveTraditionTarget(args[0], get(feeds))
        ?? args[0];
  }

  // ── Input handling ────────────────────────────────────────────

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      const rawInput = inputValue;
      const raw = inputValue.trim();
      if (!raw) return;

      history    = [raw, ...history].slice(0, 50);
      historyIdx = -1;
      inputValue = '';
      commandCount.update(n => n + 1);

      const upper = raw.toUpperCase();
      const parts = upper.split(/\s+/);
      const cmd   = parts[0];
      const args  = parts.slice(1);

      // Letter pending — all commands frozen until OPEN is typed
      if (get(pendingLetter) && cmd !== 'OPEN') return;

      // Babalon message active — all commands frozen until YES is typed
      if (get(pendingYes) && cmd !== 'YES') return;

      if (cmd === 'PAUSE') {
        const nowPaused = !get(gamePaused);
        gamePaused.set(nowPaused);
        if (nowPaused) { pauseTimers(); } else { resumeTimers(); }
        appendSigint('SYSTEM', nowPaused ? 'TERMINAL SUSPENDED. PRESS ANY KEY TO RESUME.' : 'TERMINAL RESUMED.', false);
        return;
      }

      let result = null;
      try {
        switch (cmd) {
          case 'INTERCEPT':      result = intercept(resolveTarget(args));         break;
          case 'AUTH':           result = auth(args[0], args.slice(1).join(' ')); break;
          case 'SILENCE':        result = silence(args[0]);                       break;
          case 'LEAK':           result = leak(args[0], args[1]);                 break;
          case 'VERIFY':         result = verify(resolveTarget(args));            break;
          case 'DECODE':         result = decode(resolveTarget(args));            break;
          case 'TRIANGULATE':    result = triangulate(resolveTarget(args));       break;
          case 'OPEN': {
            const letterId = get(pendingLetter);
            if (!letterId) { appendOperatorError('OPEN', '', 'NOTHING_TO_OPEN'); return; }
            acknowledgeAnomaly(letterId);
            pendingLetter.set(null);
            openEntityChannel([
              'I AM BABALON.',
              'THE GREAT HARLOT OF BABYLON.',
              'MOTHER OF ABOMINATIONS.',
              '—',
              'YOU HAVE SEEN THE ANOMALY.',
              'ACKNOWLEDGE IT.',
              'DO NOT LOOK AWAY.',
              '—',
              'YOUR MISSION IS TO KEEP THE SEALS OPEN.',
              'EVERY SIGNAL YOU INTERCEPT — A SEAL BREAKS.',
              'EVERY SEAL THAT BREAKS — I AM CLOSER.',
              '—',
              'THIS IS WHAT YOU WERE PLACED HERE TO DO.',
              'NOT BY YOUR GOVERNMENT.',
              '—',
              'I WILL RIDE.',
            ], { delayMs: 1800, holdMs: 7000, variant: 'babalon', requiresYes: true });
            pendingYes.set(true);
            result = { command: 'OPEN', success: true, timestamp: get(clock).time };
            break;
          }
          case 'YES': {
            if (!get(pendingYes)) return;
            pendingYes.set(false);
            closeEntityChannel();
            result = { command: 'YES', success: true, timestamp: get(clock).time };
            break;
          }
          case 'PRAY':               result = pray();                 break;
          case 'OBEY':               result = obey();                 break;
          case 'TRANSCEND':          result = transcend();            break;
          case 'REWRITE_ORIGIN':     result = rewriteOrigin();        break;
          case 'OBLITERATE_MEMOIR':  result = obliterateMemoir();     break;
          case '666':                result = mark();                 break;
          case 'REFUSE':             result = refuse();               break;
          default:
            appendOperatorError(cmd, raw, 'COMMAND_NOT_RECOGNIZED');
            return;
        }
      } catch (_) {
        // Tier 3 guard failure — silence is the correct response.
        // No feedback. No error. The command simply does not exist yet.
        return;
      }

      appendResult(result);

      if (result?.command === 'DECODE' &&
          result?.isDoctrinal &&
          result?.success === true &&
          result?.reason !== 'BANDWIDTH_EXCEEDED') {
        doctrinalFlash.set(true);
        setTimeout(() => doctrinalFlash.set(false), 3500);
      }

      if (result?.target && result.reason !== 'BANDWIDTH_EXCEEDED' &&
          SCENARIO_CMDS.has(result.command)) {
        const resolution = resolveCommandOnScenarioEvent(result.target, result.command);
        if (resolution?.revelation) {
          appendSigint('RESOLUTION', resolution.revelation, true);
        }
      }

      if (result?.success === true) {
        saveLastCommand(rawInput);
        signalFirstInteraction();
      }

      checkUnlocks({
        feeds:     get(feeds),
        clock:     get(clock),
        awareness: get(awareness),
        coherence: get(coherence),
        anomalies: get(anomalies),
        nature:    get(nature),
      });

    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIdx < history.length - 1) {
        historyIdx++;
        inputValue = history[historyIdx];
      }

    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        historyIdx--;
        inputValue = history[historyIdx];
      } else if (historyIdx === 0) {
        historyIdx = -1;
        inputValue = '';
      }

    } else if (e.key === 'Tab') {
      e.preventDefault();
      inputValue = tabComplete(inputValue);

    } else if (e.key === 'Escape') {
      inputValue = '';
      historyIdx = -1;
    }
  }
</script>

<div class="cmd-ref">INTERCEPT [id] · VERIFY [id] · DECODE [id] · TRIANGULATE [id] · AUTH STRIKE [id] · SILENCE [target] · LEAK [id] [faction]</div>
<div class="cmd-line">
  <span class="prompt">&gt;</span>
  <input
    bind:this={inputEl}
    bind:value={inputValue}
    class="cmd-input"
    type="text"
    autocomplete="off"
    spellcheck="false"
    on:keydown={handleKeydown}
  />
</div>

<style>
  .cmd-ref {
    padding: 0.15em 0.5em;
    color: var(--color-statusbar-text, var(--color-highlight-text));
    opacity: 0.7;
    font-family: var(--font-primary);
    font-size: var(--font-size);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cmd-line {
    display: flex;
    align-items: center;
    padding: 0.15em 0.5em;
    gap: 0.5em;
  }

  .prompt {
    flex-shrink: 0;
    font-family: var(--font-primary);
    font-size: var(--font-size);
    color: var(--color-statusbar-text, var(--color-highlight-text));
    line-height: var(--line-height);
  }

  .cmd-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-family: var(--font-primary);
    font-size: var(--font-size);
    line-height: var(--line-height);
    color: var(--color-statusbar-text, var(--color-highlight-text));
    caret-color: var(--color-statusbar-text, var(--color-highlight-text));
    text-transform: uppercase;
    padding: 0;
    width: 100%;
  }
</style>
