import type { DataSourceProvider, FieldOption } from '../types';

export interface CountryMetadata {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  phonePattern: RegExp;
  postalPattern?: RegExp;
  placeholder: string;
}

export const COUNTRIES: readonly CountryMetadata[] = [
  {
    code: 'PK',
    name: 'Pakistan',
    dialCode: '+92',
    flag: '🇵🇰',
    phonePattern: /^(?:\+?92|0)?3\d{2}[-\s]?\d{7}$/,
    postalPattern: /^\d{5}$/,
    placeholder: '300 1234567',
  },
  {
    code: 'US',
    name: 'United States',
    dialCode: '+1',
    flag: '🇺🇸',
    phonePattern: /^(?:\+?1[-\s]?)?\(?[2-9]\d{2}\)?[-\s]?\d{3}[-\s]?\d{4}$/,
    postalPattern: /^\d{5}(?:-\d{4})?$/,
    placeholder: '(555) 123-4567',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    dialCode: '+44',
    flag: '🇬🇧',
    phonePattern: /^(?:\+?44|0)7\d{3}[-\s]?\d{6}$/,
    postalPattern: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
    placeholder: '7911 123456',
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    dialCode: '+971',
    flag: '🇦🇪',
    phonePattern: /^(?:\+?971|0)?5[024568]\d[-\s]?\d{6}$/,
    placeholder: '50 123 4567',
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    dialCode: '+966',
    flag: '🇸🇦',
    phonePattern: /^(?:\+?966|0)?5\d[-\s]?\d{7}$/,
    postalPattern: /^\d{5}(?:-\d{4})?$/,
    placeholder: '50 123 4567',
  },
  {
    code: 'CA',
    name: 'Canada',
    dialCode: '+1',
    flag: '🇨🇦',
    phonePattern: /^(?:\+?1[-\s]?)?\(?[2-9]\d{2}\)?[-\s]?\d{3}[-\s]?\d{4}$/,
    postalPattern: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
    placeholder: '(416) 555-0199',
  },
  {
    code: 'AU',
    name: 'Australia',
    dialCode: '+61',
    flag: '🇦🇺',
    phonePattern: /^(?:\+?61|0)?4\d{2}[-\s]?\d{3}[-\s]?\d{3}$/,
    postalPattern: /^\d{4}$/,
    placeholder: '412 345 678',
  },
  {
    code: 'DE',
    name: 'Germany',
    dialCode: '+49',
    flag: '🇩🇪',
    phonePattern: /^(?:\+?49|0)1[5-7]\d{7,9}$/,
    postalPattern: /^\d{5}$/,
    placeholder: '1512 3456789',
  },
  {
    code: 'FR',
    name: 'France',
    dialCode: '+33',
    flag: '🇫🇷',
    phonePattern: /^(?:\+?33|0)[67]\d{8}$/,
    postalPattern: /^\d{5}$/,
    placeholder: '6 12 34 56 78',
  },
  {
    code: 'IN',
    name: 'India',
    dialCode: '+91',
    flag: '🇮🇳',
    phonePattern: /^(?:\+?91|0)?[6-9]\d{9}$/,
    postalPattern: /^\d{6}$/,
    placeholder: '98765 43210',
  },
  {
    code: 'TR',
    name: 'Turkey',
    dialCode: '+90',
    flag: '🇹🇷',
    phonePattern: /^(?:\+?90|0)?5\d{9}$/,
    postalPattern: /^\d{5}$/,
    placeholder: '532 123 4567',
  },
  {
    code: 'MY',
    name: 'Malaysia',
    dialCode: '+60',
    flag: '🇲🇾',
    phonePattern: /^(?:\+?60|0)?1\d{8,9}$/,
    postalPattern: /^\d{5}$/,
    placeholder: '12 345 6789',
  },
  {
    code: 'SG',
    name: 'Singapore',
    dialCode: '+65',
    flag: '🇸🇬',
    phonePattern: /^(?:\+?65)?[89]\d{7}$/,
    postalPattern: /^\d{6}$/,
    placeholder: '8123 4567',
  },
];

export function getCountryByCode(code: string | undefined): CountryMetadata | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase();
  return COUNTRIES.find((c) => c.code === upper || c.dialCode === code);
}

export function getCountryOptions(allowedCodes?: readonly string[]): FieldOption[] {
  const list = allowedCodes?.length
    ? COUNTRIES.filter((c) => allowedCodes.map((a) => a.toUpperCase()).includes(c.code))
    : COUNTRIES;
  return list.map((c) => ({
    label: `${c.flag} ${c.name}`,
    value: c.code,
    flag: c.flag,
    description: c.dialCode,
    meta: { dialCode: c.dialCode, placeholder: c.placeholder },
  }));
}

export const STATES_BY_COUNTRY: Record<string, FieldOption[]> = {
  PK: [
    { label: 'Punjab', value: 'PB' },
    { label: 'Sindh', value: 'SD' },
    { label: 'Khyber Pakhtunkhwa', value: 'KP' },
    { label: 'Balochistan', value: 'BA' },
    { label: 'Islamabad Capital Territory', value: 'ICT' },
    { label: 'Gilgit-Baltistan', value: 'GB' },
    { label: 'Azad Jammu & Kashmir', value: 'AJK' },
  ],
  US: [
    { label: 'California', value: 'CA' },
    { label: 'New York', value: 'NY' },
    { label: 'Texas', value: 'TX' },
    { label: 'Washington', value: 'WA' },
    { label: 'Illinois', value: 'IL' },
    { label: 'Florida', value: 'FL' },
  ],
  GB: [
    { label: 'England', value: 'ENG' },
    { label: 'Scotland', value: 'SCT' },
    { label: 'Wales', value: 'WLS' },
    { label: 'Northern Ireland', value: 'NIR' },
  ],
  AE: [
    { label: 'Dubai', value: 'DXB' },
    { label: 'Abu Dhabi', value: 'AUH' },
    { label: 'Sharjah', value: 'SHJ' },
    { label: 'Ajman', value: 'AJM' },
  ],
  CA: [
    { label: 'Ontario', value: 'ON' },
    { label: 'British Columbia', value: 'BC' },
    { label: 'Quebec', value: 'QC' },
    { label: 'Alberta', value: 'AB' },
  ],
};

export const CITIES_BY_STATE: Record<string, FieldOption[]> = {
  PB: [
    { label: 'Lahore', value: 'Lahore' },
    { label: 'Rawalpindi', value: 'Rawalpindi' },
    { label: 'Faisalabad', value: 'Faisalabad' },
    { label: 'Multan', value: 'Multan' },
    { label: 'Gujranwala', value: 'Gujranwala' },
    { label: 'Sialkot', value: 'Sialkot' },
  ],
  ICT: [{ label: 'Islamabad', value: 'Islamabad' }],
  SD: [
    { label: 'Karachi', value: 'Karachi' },
    { label: 'Hyderabad', value: 'Hyderabad' },
    { label: 'Sukkur', value: 'Sukkur' },
  ],
  KP: [
    { label: 'Peshawar', value: 'Peshawar' },
    { label: 'Abbottabad', value: 'Abbottabad' },
    { label: 'Mardan', value: 'Mardan' },
  ],
  BA: [
    { label: 'Quetta', value: 'Quetta' },
    { label: 'Gwadar', value: 'Gwadar' },
  ],
  CA: [
    { label: 'San Francisco', value: 'San Francisco' },
    { label: 'Los Angeles', value: 'Los Angeles' },
    { label: 'San Diego', value: 'San Diego' },
  ],
  NY: [
    { label: 'New York City', value: 'New York City' },
    { label: 'Buffalo', value: 'Buffalo' },
  ],
  TX: [
    { label: 'Austin', value: 'Austin' },
    { label: 'Dallas', value: 'Dallas' },
    { label: 'Houston', value: 'Houston' },
  ],
  ENG: [
    { label: 'London', value: 'London' },
    { label: 'Manchester', value: 'Manchester' },
    { label: 'Birmingham', value: 'Birmingham' },
  ],
  DXB: [{ label: 'Dubai', value: 'Dubai' }],
  AUH: [{ label: 'Abu Dhabi', value: 'Abu Dhabi' }],
  ON: [
    { label: 'Toronto', value: 'Toronto' },
    { label: 'Ottawa', value: 'Ottawa' },
  ],
};

export const COMMON_TIMEZONES: FieldOption[] = [
  { label: 'Asia/Karachi (PKT, UTC+05:00)', value: 'Asia/Karachi' },
  { label: 'Asia/Dubai (GST, UTC+04:00)', value: 'Asia/Dubai' },
  { label: 'Asia/Riyadh (AST, UTC+03:00)', value: 'Asia/Riyadh' },
  { label: 'Europe/London (GMT/BST)', value: 'Europe/London' },
  { label: 'Europe/Berlin (CET/CEST)', value: 'Europe/Berlin' },
  { label: 'America/New_York (ET)', value: 'America/New_York' },
  { label: 'America/Chicago (CT)', value: 'America/Chicago' },
  { label: 'America/Los_Angeles (PT)', value: 'America/Los_Angeles' },
  { label: 'Asia/Singapore (SGT, UTC+08:00)', value: 'Asia/Singapore' },
  { label: 'Asia/Tokyo (JST, UTC+09:00)', value: 'Asia/Tokyo' },
  { label: 'Australia/Sydney (AET)', value: 'Australia/Sydney' },
  { label: 'UTC (Coordinated Universal Time)', value: 'UTC' },
];

export const MONTHS_OPTIONS: FieldOption[] = [
  { label: 'January', value: '01' },
  { label: 'February', value: '02' },
  { label: 'March', value: '03' },
  { label: 'April', value: '04' },
  { label: 'May', value: '05' },
  { label: 'June', value: '06' },
  { label: 'July', value: '07' },
  { label: 'August', value: '08' },
  { label: 'September', value: '09' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

/**
 * Built-in data sources registered out-of-the-box so country -> state -> city
 * and common timezones work immediately without boilerplate.
 */
export const BUILT_IN_DATA_SOURCES: Record<string, DataSourceProvider> = {
  countries: ({ query }) => {
    const all = getCountryOptions();
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        String(o.value).toLowerCase().includes(q) ||
        (o.description ?? '').toLowerCase().includes(q)
    );
  },
  statesByCountry: ({ dependencies, query }) => {
    const country = String(dependencies.country ?? Object.values(dependencies)[0] ?? '').toUpperCase();
    const list = STATES_BY_COUNTRY[country] ?? [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter((o) => o.label.toLowerCase().includes(q));
  },
  citiesByState: ({ dependencies, query }) => {
    const state = String(
      dependencies.state ?? dependencies.province ?? Object.values(dependencies).pop() ?? ''
    );
    const list = CITIES_BY_STATE[state] ?? [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter((o) => o.label.toLowerCase().includes(q));
  },
  timezones: ({ query }) => {
    if (!query) return COMMON_TIMEZONES;
    const q = query.toLowerCase();
    return COMMON_TIMEZONES.filter(
      (tz) => tz.label.toLowerCase().includes(q) || String(tz.value).toLowerCase().includes(q)
    );
  },
};
