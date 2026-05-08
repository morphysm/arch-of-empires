const REGION_MAP = {
  // North America
  US: 'NAM', CA: 'NAM', MX: 'NAM', GT: 'NAM', BZ: 'NAM', HN: 'NAM',
  SV: 'NAM', NI: 'NAM', CR: 'NAM', PA: 'NAM', CU: 'NAM', JM: 'NAM',
  HT: 'NAM', DO: 'NAM', TT: 'NAM', BB: 'NAM', PR: 'NAM',
  // South America
  BR: 'SAM', AR: 'SAM', CL: 'SAM', CO: 'SAM', VE: 'SAM', PE: 'SAM',
  EC: 'SAM', BO: 'SAM', PY: 'SAM', UY: 'SAM', GY: 'SAM', SR: 'SAM',
  // Europe
  GB: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR',
  NL: 'EUR', BE: 'EUR', LU: 'EUR', CH: 'EUR', AT: 'EUR', SE: 'EUR',
  NO: 'EUR', DK: 'EUR', FI: 'EUR', IS: 'EUR', IE: 'EUR', PL: 'EUR',
  CZ: 'EUR', SK: 'EUR', HU: 'EUR', RO: 'EUR', BG: 'EUR', HR: 'EUR',
  SI: 'EUR', BA: 'EUR', RS: 'EUR', ME: 'EUR', MK: 'EUR', AL: 'EUR',
  GR: 'EUR', CY: 'EUR', MT: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR',
  UA: 'EUR', MD: 'EUR',
  // Africa
  ZA: 'AFR', NG: 'AFR', ET: 'AFR', KE: 'AFR', GH: 'AFR', TZ: 'AFR',
  UG: 'AFR', CM: 'AFR', CI: 'AFR', MZ: 'AFR', MG: 'AFR', AO: 'AFR',
  ZM: 'AFR', ZW: 'AFR', SN: 'AFR', ML: 'AFR', BF: 'AFR', TD: 'AFR',
  SD: 'AFR', SO: 'AFR', RW: 'AFR', BI: 'AFR', BJ: 'AFR', TG: 'AFR',
  GN: 'AFR', SL: 'AFR', LR: 'AFR', NA: 'AFR', GA: 'AFR', CG: 'AFR',
  CD: 'AFR', CF: 'AFR', LY: 'AFR', TN: 'AFR', DZ: 'AFR', MA: 'AFR',
  EG: 'AFR',
  // Middle East
  IR: 'MDE', IQ: 'MDE', SA: 'MDE', AE: 'MDE', IL: 'MDE', SY: 'MDE',
  JO: 'MDE', LB: 'MDE', KW: 'MDE', QA: 'MDE', BH: 'MDE', OM: 'MDE',
  YE: 'MDE', TR: 'MDE',
  // Russia / Central Asia
  RU: 'RUS', KZ: 'RUS', KG: 'RUS', TJ: 'RUS', TM: 'RUS', UZ: 'RUS',
  AZ: 'RUS', AM: 'RUS', GE: 'RUS', BY: 'RUS',
  // China / Taiwan
  CN: 'CHN', TW: 'CHN', HK: 'CHN', MO: 'CHN',
  // Asia
  JP: 'ASA', KR: 'ASA', IN: 'ASA', PK: 'ASA', BD: 'ASA', LK: 'ASA',
  NP: 'ASA', BT: 'ASA', MM: 'ASA', TH: 'ASA', VN: 'ASA', LA: 'ASA',
  KH: 'ASA', MY: 'ASA', SG: 'ASA', PH: 'ASA', ID: 'ASA', BN: 'ASA',
  MN: 'ASA', AF: 'ASA',
  // Oceania
  AU: 'OCE', NZ: 'OCE', FJ: 'OCE', PG: 'OCE', SB: 'OCE', VU: 'OCE',
};

// ASN org strings that indicate VPN, hosting, or datacenter traffic.
// ipapi.co returns org as "AS12345 Provider Name" — we check the lowercase string.
const VPN_PATTERNS = [
  'vpn', 'proxy', 'hosting', 'datacenter', 'data center', 'cloud',
  'nordvpn', 'expressvpn', 'mullvad', 'protonvpn', 'ipvanish',
  'surfshark', 'torguard', 'digitalocean', 'digital ocean',
  'linode', 'vultr', 'amazon', 'google', 'microsoft', 'cloudflare',
  'ovh', 'hetzner', 'm247', 'leaseweb', 'frantech', 'serverius',
  'choopa', 'quadranet', 'tzulo', 'buyvm', 'coresite',
];

export async function fetchPlayerLocation() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;

    const org = (data.org ?? '').toLowerCase();
    const isVPN = VPN_PATTERNS.some(p => org.includes(p));

    return {
      city: data.city ?? 'UNKNOWN',
      country: data.country_name ?? 'UNKNOWN',
      region: REGION_MAP[data.country_code] ?? null,
      isVPN,
    };
  } catch {
    return null;
  }
}
