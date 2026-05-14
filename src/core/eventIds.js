const TRADITION_ALIASES = {
  'GITA':           'GITA',
  'BHAGAVAD GITA':  'GITA',
  'BHAGAVAD-GITA':  'GITA',
  'REVELATION':     'REVELATION',
  'REVELATIONS':    'REVELATION',
  'BIBLE':          'REVELATION',
  'MORPHYSM':       'MORPHYSM',
};

export function resolveTraditionAlias(rawTarget) {
  if (rawTarget == null) return null;
  return TRADITION_ALIASES[String(rawTarget).trim().toUpperCase()] ?? null;
}

/**
 * If rawTarget matches a tradition name or alias, returns the ID of the most
 * recent doctrinal event with that tradition from the feeds. Returns null if
 * rawTarget is not a tradition alias or no matching event is in the feeds.
 */
export function resolveTraditionTarget(rawTarget, feedsValue) {
  const tradition = resolveTraditionAlias(rawTarget);
  if (!tradition) return null;
  const all = [
    ...feedsValue.diplomat,
    ...feedsValue.tactical,
    ...feedsValue.sigint,
  ].filter(e => e.isDoctrinal && e.tradition === tradition);
  return all.length ? all[all.length - 1].id : null;
}

export function canonicalEventId(value) {
  if (value == null) return '';

  const compact = String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '-');

  const evt = compact.match(/^evt-?0*(\d+)$/);
  if (evt) return `evt-${String(Number(evt[1])).padStart(3, '0')}`;

  return compact;
}

export function joinTargetParts(parts) {
  return parts.filter(part => part != null && String(part).trim() !== '').join(' ');
}
