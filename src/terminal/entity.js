import { entityMode, entityLines } from '../core/store.js';
import { enterAltarMode, exitAltarMode } from '../audio/soundscape.js';

let _closeTimer = null;
let _lineTimers = [];

function clearEntityTimers() {
  _lineTimers.forEach(id => clearTimeout(id));
  _lineTimers = [];
  if (_closeTimer) {
    clearTimeout(_closeTimer);
    _closeTimer = null;
  }
}

// Call from scenarios to open the entity channel.
// lines: array of strings, each revealed after delayMs from the previous.
// holdMs: how long the channel stays open after the last line before closing.
export function openEntityChannel(lines, { delayMs = 2200, holdMs = 5000 } = {}) {
  clearEntityTimers();
  entityMode.set(true);
  entityLines.set([]);
  enterAltarMode();

  lines.forEach((line, i) => {
    const id = setTimeout(() => {
      entityLines.update(ls => [...ls, line]);
    }, i * delayMs);
    _lineTimers.push(id);
  });

  _closeTimer = setTimeout(() => {
    entityMode.set(false);
    entityLines.set([]);
    exitAltarMode();
    _closeTimer = null;
  }, lines.length * delayMs + holdMs);
}

export function closeEntityChannel() {
  clearEntityTimers();
  entityMode.set(false);
  entityLines.set([]);
  exitAltarMode();
}
