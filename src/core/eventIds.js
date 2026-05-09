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

