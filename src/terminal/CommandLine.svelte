<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { feeds, clock, currentShift, commandCount, awareness, coherence, anomalies, nature } from '../core/store.js';
  import { intercept, auth, silence, leak } from '../commands/tier1.js';
  import { verify, decode, triangulate }     from '../commands/tier2.js';
  import { pray, obey, transcend, rewriteOrigin, obliterateMemoir, mark, refuse } from '../commands/tier3.js';
  import { checkUnlocks } from '../scenarios/engine.js';
  import { saveLastCommand } from '../core/persistence.js';
  import { signalFirstInteraction } from '../audio/soundscape.js';
  import { registerOperatorError } from '../core/operatorError.js';

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

    const content    = result.command + ': ' + (result.success ? 'OK' : (result.reason || 'FAILED'));
    const anomalyFlag = result.anomalyFlag === true || result.doctrinalTriggered != null;
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

      let result = null;
      try {
        switch (cmd) {
          case 'INTERCEPT':      result = intercept(args[0]);         break;
          case 'AUTH':           result = auth(args[0], args.slice(1).join(' ')); break;
          case 'SILENCE':        result = silence(args[0]);           break;
          case 'LEAK':           result = leak(args[0], args[1]);     break;
          case 'VERIFY':         result = verify(args[0]);            break;
          case 'DECODE':         result = decode(args[0]);            break;
          case 'TRIANGULATE':    result = triangulate(args[0]);       break;
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
