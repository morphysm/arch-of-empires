<script>
  import { feeds, playerLocation } from '../core/store.js';

  // Regions with keyword patterns for origin/content matching.
  // Match is case-insensitive against event.origin and event.content.
  const REGIONS = [
    { code: 'NAM', label: 'N.AMERICA',  keywords: ['north america', 'united states', 'usa', 'canada', 'alaska', 'atlantic'] },
    { code: 'SAM', label: 'S.AMERICA',  keywords: ['south america', 'brazil', 'argentina', 'colombia', 'venezuela'] },
    { code: 'EUR', label: 'EUROPE',     keywords: ['europe', 'nato', 'north sea', 'baltic', 'uk', 'france', 'germany', 'norway'] },
    { code: 'AFR', label: 'AFRICA',     keywords: ['africa', 'sahara', 'egypt', 'nigeria', 'ethiopia', 'suez'] },
    { code: 'MDE', label: 'MIDEAST',    keywords: ['middle east', 'euphrates', 'iran', 'iraq', 'israel', 'syria', 'gulf', 'red sea', 'saudi'] },
    { code: 'RUS', label: 'RUSSIA',     keywords: ['russia', 'barents', 'siberia', 'moscow', 'soviet', 'ukraine', 'kursk', 'kola'] },
    { code: 'CHN', label: 'CHINA',      keywords: ['china', 'beijing', 'taiwan', 'east china', 'yellow sea'] },
    { code: 'ASA', label: 'ASIA',       keywords: ['asia', 'korea', 'japan', 'india', 'pakistan', 'southeast asia', 'vietnam'] },
    { code: 'OCE', label: 'OCEANIA',    keywords: ['oceania', 'australia', 'pacific', 'new zealand', 'philippines'] },
  ];

  // Map layout: 3 columns, row by row.
  // null = empty cell.
  const GRID = [
    ['NAM', 'EUR', 'RUS'],
    ['SAM', 'MDE', 'CHN'],
    ['AFR', null,  'ASA'],
    [null,  null,  'OCE'],
  ];

  function matches(event, keywords) {
    const haystack = ((event.origin ?? '') + ' ' + (event.content ?? '')).toLowerCase();
    return keywords.some(k => haystack.includes(k));
  }

  // Derive per-region status from tactical feed events.
  // Priority: DETONATED > STRUCK > ACTIVE > CLEAR
  function regionStatus(region, tacticalEvents) {
    const regionDef = REGIONS.find(r => r.code === region);
    if (!regionDef) return 'CLEAR';

    const relevant = tacticalEvents.filter(e => matches(e, regionDef.keywords));
    if (relevant.length === 0) return 'CLEAR';

    // Detonation: anomalyFlag + any type containing nuclear/detonation keywords
    const detonated = relevant.some(e =>
      e.anomalyFlag &&
      /detonat|nuclear|launch_confirmed|impact/i.test(e.type ?? '')
    );
    if (detonated) return 'DETONATED';

    // Struck: authorized strike order (event marked by auth result)
    const struck = relevant.some(e => e.authorized === true);
    if (struck) return 'STRUCK';

    // Active: any matching tactical event present
    return 'ACTIVE';
  }


</script>

<div class="worldmap">
  <div class="map-header">STRATEGIC OVERLAY</div>
  <div class="map-grid">
    {#each GRID as row}
      {#each row as code}
        <div class="map-cell">
          {#if code}
            {@const tactical = $feeds.tactical}
            {@const loc      = $playerLocation}
            {@const pRegion  = loc?.region ?? null}
            {@const pMark    = loc ? (loc.isVPN ? 'EVASIVE' : 'TRACKED') : null}
            {@const raw      = regionStatus(code, tactical)}
            {@const status   = code === pRegion && pMark ? pMark : raw}
            <span class="region-code" data-status={status}>{code}</span>
            <span class="region-status" data-status={status}>{status}</span>
          {/if}
        </div>
      {/each}
    {/each}
  </div>
</div>

<style>
  .worldmap {
    flex-shrink: 0;
    border-top: 1px solid var(--color-border);
    padding: 2px 8px 4px;
    font-size: 11px;
  }

  .map-header {
    color: var(--color-text-dim);
    font-weight: bold;
    letter-spacing: 0.1em;
    margin-bottom: 2px;
  }

  .map-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px 8px;
  }

  .map-cell {
    display: flex;
    gap: 1ch;
    align-items: baseline;
    white-space: nowrap;
    min-height: 1.4em;
  }

  .region-code {
    font-weight: bold;
    color: var(--color-text-dim);
    min-width: 3ch;
  }

  .region-status {
    font-size: 0.85em;
    letter-spacing: 0.04em;
  }

  /* Status colors */
  [data-status="CLEAR"]     { color: var(--color-text-dim); }
  [data-status="ACTIVE"]    { color: var(--color-text); font-weight: bold; }
  [data-status="STRUCK"]    { color: var(--color-alert); }
  [data-status="DETONATED"] { color: var(--color-text-corrupt); font-weight: bold; }
  [data-status="TRACKED"]   { color: var(--color-alert); font-weight: bold; }
  [data-status="EVASIVE"]   { color: var(--color-text-dim); animation: map-blink 1.4s step-end infinite; }

  @keyframes map-blink {
    50% { opacity: 0; }
  }
</style>
