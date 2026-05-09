import { get } from 'svelte/store';
import { feeds, clock, currentShift } from '../core/store.js';
import { triggerDoctrinal } from '../feeds/doctrinal.js';
import { saveGhostSignal } from '../core/persistence.js';

// ── Module-level registry ─────────────────────────────────────────────────────

const _scenarios      = new Map(); // id → scenario
const _pendingLayers  = [];        // { scenarioId, layerName, layer } — not yet unlocked
const _unlockedForbidden = new Map(); // `${scenarioId}:forbidden` → { event, remembers }

export function resetEngineState() {
  _scenarios.clear();
  _pendingLayers.length = 0;
  _unlockedForbidden.clear();
}

export const _resetEngineForTesting = resetEngineState;

// ── Internal helpers ──────────────────────────────────────────────────────────

// Stamps current clock time and shift onto a scenario event at the moment of push
function stampEvent(event) {
  return { ...event, timestamp: get(clock).time, shift: get(currentShift) };
}

function pushToFeed(feedName, event) {
  const key = feedName.toLowerCase();
  feeds.update(s => ({ ...s, [key]: [...s[key], event] }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadScenario(scenarioId, _inject = null) {
  const scenario = _inject
    ? _inject
    : (await import(`./library/${scenarioId}.js`)).default;

  // Use scenario.id as the canonical registry key — consistent with resolveLayer's lookup
  const id = scenario.id;
  _scenarios.set(id, scenario);

  // Surface layer fires immediately
  pushToFeed(scenario.layers.surface.feed, stampEvent(scenario.layers.surface.event));

  // Hidden and forbidden layers are registered as pending
  _pendingLayers.push({ scenarioId: id, layerName: 'hidden',    layer: scenario.layers.hidden });
  _pendingLayers.push({ scenarioId: id, layerName: 'forbidden', layer: scenario.layers.forbidden });
}

// Called after every command execution. Returns true if any layer unlocked.
export function checkUnlocks(state) {
  const toRemove = [];

  for (const entry of _pendingLayers) {
    const { scenarioId, layerName, layer } = entry;

    if (!layer.unlockCondition(state)) continue;

    if (layerName === 'forbidden') {
      // Forbidden layer: triggerDoctrinal handles the feed append
      triggerDoctrinal(layer.event.fragmentKey);

      // Track as unlocked-and-unresolved until resolveLayer or endShift clears it
      _unlockedForbidden.set(`${scenarioId}:forbidden`, {
        event: layer.event,
        remembers: layer.remembers ?? false,
      });
    } else {
      pushToFeed(layer.feed, stampEvent(layer.event));
    }

    toRemove.push(entry);
  }

  toRemove.forEach(e => {
    const idx = _pendingLayers.indexOf(e);
    if (idx !== -1) _pendingLayers.splice(idx, 1);
  });

  return toRemove.length > 0;
}

export function resolveLayer(scenarioId, layerName, command, target) {
  const scenario = _scenarios.get(scenarioId);
  if (!scenario) return { success: false, reason: 'SCENARIO_NOT_FOUND' };

  const layer = scenario.layers[layerName];
  if (!layer) return { success: false, reason: 'LAYER_NOT_FOUND' };

  const resolution = layer.resolution(command, target);

  // Forbidden layer resolved — no longer a ghost-signal candidate
  if (layerName === 'forbidden') {
    _unlockedForbidden.delete(`${scenarioId}:forbidden`);
  }

  return { scenarioId, layer: layerName, command, target, ...resolution };
}

// Called at Shift end. Unresolved forbidden layers with remembers: true become
// ghost signals — they appear in the next run's SIGINT feed, indistinguishable
// from live signals. The player will not know they are unresolved scenario debris.
export function endShift() {
  _unlockedForbidden.forEach(({ event, remembers }) => {
    if (remembers) {
      saveGhostSignal({ ...event, origin: 'UNRESOLVED_FORBIDDEN' });
    }
  });
  _pendingLayers.length = 0;
  _unlockedForbidden.clear();
}
