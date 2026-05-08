import { entityMode, entityLines } from '../core/store.js';

let _closeTimer = null;

// Call from scenarios to open the entity channel.
// lines: array of strings, each revealed after delayMs from the previous.
// holdMs: how long the channel stays open after the last line before closing.
export function openEntityChannel(lines, { delayMs = 2200, holdMs = 5000 } = {}) {
  if (_closeTimer) clearTimeout(_closeTimer);
  entityMode.set(true);
  entityLines.set([]);

  lines.forEach((line, i) => {
    setTimeout(() => entityLines.update(ls => [...ls, line]), i * delayMs);
  });

  _closeTimer = setTimeout(() => {
    entityMode.set(false);
    entityLines.set([]);
    _closeTimer = null;
  }, lines.length * delayMs + holdMs);
}

export function closeEntityChannel() {
  if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
  entityMode.set(false);
  entityLines.set([]);
}
