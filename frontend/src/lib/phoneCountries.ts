/** ISO 3166-1 alpha-2 → ITU dial code (major markets + full referenceCountries coverage). */
export type PhoneCountryMeta = {
  iso2: string;
  name: string;
  dial: string;
};

export const PHONE_COUNTRIES: PhoneCountryMeta[] = [
  { iso2: "AF", name: "Afghanistan", dial: "93" },
  { iso2: "AL", name: "Albania", dial: "355" },
  { iso2: "DZ", name: "Algeria", dial: "213" },
  { iso2: "AR", name: "Argentina", dial: "54" },
  { iso2: "AU", name: "Australia", dial: "61" },
  { iso2: "AT", name: "Austria", dial: "43" },
  { iso2: "BD", name: "Bangladesh", dial: "880" },
  { iso2: "BE", name: "Belgium", dial: "32" },
  { iso2: "BR", name: "Brazil", dial: "55" },
  { iso2: "BG", name: "Bulgaria", dial: "359" },
  { iso2: "CA", name: "Canada", dial: "1" },
  { iso2: "CL", name: "Chile", dial: "56" },
  { iso2: "CN", name: "China", dial: "86" },
  { iso2: "CO", name: "Colombia", dial: "57" },
  { iso2: "HR", name: "Croatia", dial: "385" },
  { iso2: "CZ", name: "Czech Republic", dial: "420" },
  { iso2: "DK", name: "Denmark", dial: "45" },
  { iso2: "EG", name: "Egypt", dial: "20" },
  { iso2: "EE", name: "Estonia", dial: "372" },
  { iso2: "FI", name: "Finland", dial: "358" },
  { iso2: "FR", name: "France", dial: "33" },
  { iso2: "DE", name: "Germany", dial: "49" },
  { iso2: "GR", name: "Greece", dial: "30" },
  { iso2: "HK", name: "Hong Kong", dial: "852" },
  { iso2: "HU", name: "Hungary", dial: "36" },
  { iso2: "IS", name: "Iceland", dial: "354" },
  { iso2: "IN", name: "India", dial: "91" },
  { iso2: "ID", name: "Indonesia", dial: "62" },
  { iso2: "IE", name: "Ireland", dial: "353" },
  { iso2: "IL", name: "Israel", dial: "972" },
  { iso2: "IT", name: "Italy", dial: "39" },
  { iso2: "JP", name: "Japan", dial: "81" },
  { iso2: "KE", name: "Kenya", dial: "254" },
  { iso2: "KW", name: "Kuwait", dial: "965" },
  { iso2: "LV", name: "Latvia", dial: "371" },
  { iso2: "LT", name: "Lithuania", dial: "370" },
  { iso2: "LU", name: "Luxembourg", dial: "352" },
  { iso2: "MY", name: "Malaysia", dial: "60" },
  { iso2: "MX", name: "Mexico", dial: "52" },
  { iso2: "NL", name: "Netherlands", dial: "31" },
  { iso2: "NZ", name: "New Zealand", dial: "64" },
  { iso2: "NG", name: "Nigeria", dial: "234" },
  { iso2: "NO", name: "Norway", dial: "47" },
  { iso2: "PK", name: "Pakistan", dial: "92" },
  { iso2: "PH", name: "Philippines", dial: "63" },
  { iso2: "PL", name: "Poland", dial: "48" },
  { iso2: "PT", name: "Portugal", dial: "351" },
  { iso2: "QA", name: "Qatar", dial: "974" },
  { iso2: "RO", name: "Romania", dial: "40" },
  { iso2: "RU", name: "Russia", dial: "7" },
  { iso2: "SA", name: "Saudi Arabia", dial: "966" },
  { iso2: "SG", name: "Singapore", dial: "65" },
  { iso2: "ZA", name: "South Africa", dial: "27" },
  { iso2: "KR", name: "South Korea", dial: "82" },
  { iso2: "ES", name: "Spain", dial: "34" },
  { iso2: "LK", name: "Sri Lanka", dial: "94" },
  { iso2: "SE", name: "Sweden", dial: "46" },
  { iso2: "CH", name: "Switzerland", dial: "41" },
  { iso2: "TW", name: "Taiwan", dial: "886" },
  { iso2: "TH", name: "Thailand", dial: "66" },
  { iso2: "TR", name: "Turkey", dial: "90" },
  { iso2: "UA", name: "Ukraine", dial: "380" },
  { iso2: "AE", name: "United Arab Emirates", dial: "971" },
  { iso2: "GB", name: "United Kingdom", dial: "44" },
  { iso2: "US", name: "United States", dial: "1" },
  { iso2: "VN", name: "Vietnam", dial: "84" },
];

const byIso = new Map(PHONE_COUNTRIES.map((c) => [c.iso2, c]));
const byName = new Map(PHONE_COUNTRIES.map((c) => [c.name.toLowerCase(), c]));

/** Regional-indicator flag emoji from ISO-2 code. */
export function flagEmoji(iso2: string): string {
  const code = iso2.toUpperCase();
  if (code.length !== 2) return "🌐";
  return code.replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

export function getPhoneCountry(iso2: string): PhoneCountryMeta | undefined {
  return byIso.get(iso2.toUpperCase());
}

export function isoFromCountryName(countryName?: string): string | undefined {
  if (!countryName?.trim()) return undefined;
  const hit = byName.get(countryName.trim().toLowerCase());
  return hit?.iso2;
}

const DIAL_SORTED = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export function parsePhoneNumber(
  full: string | undefined,
  fallbackIso = "US"
): { iso2: string; national: string } {
  const trimmed = (full || "").trim();
  if (!trimmed) {
    return { iso2: fallbackIso, national: "" };
  }

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    for (const c of DIAL_SORTED) {
      if (digits.startsWith(c.dial)) {
        return { iso2: c.iso2, national: digits.slice(c.dial.length) };
      }
    }
    return { iso2: fallbackIso, national: digits };
  }

  const digits = trimmed.replace(/\D/g, "");
  return { iso2: fallbackIso, national: digits };
}

export function formatE164(iso2: string, nationalDigits: string): string {
  const meta = getPhoneCountry(iso2);
  const dial = meta?.dial || "";
  const national = nationalDigits.replace(/\D/g, "");
  if (!dial && !national) return "";
  if (!national) return "";
  return `+${dial}${national}`;
}

export function phoneCountrySelectOptions() {
  return PHONE_COUNTRIES.map((c) => ({
    value: c.iso2,
    label: `${flagEmoji(c.iso2)} +${c.dial} · ${c.name}`,
  }));
}