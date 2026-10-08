// GST state codes (the first two digits of a GSTIN) for Indian states and union territories.
// Used to decide intra- vs inter-state supply. Address.state is free text, so lookups accept the
// two-digit code, the usual abbreviation, or the name, case-insensitively.
export type GstState = { code: string; abbreviation: string; name: string; aliases?: string[] };

export const gstStates: GstState[] = [
  { code: "01", abbreviation: "JK", name: "Jammu and Kashmir" },
  { code: "02", abbreviation: "HP", name: "Himachal Pradesh" },
  { code: "03", abbreviation: "PB", name: "Punjab" },
  { code: "04", abbreviation: "CH", name: "Chandigarh" },
  { code: "05", abbreviation: "UK", name: "Uttarakhand", aliases: ["Uttaranchal", "UA"] },
  { code: "06", abbreviation: "HR", name: "Haryana" },
  { code: "07", abbreviation: "DL", name: "Delhi", aliases: ["NCT of Delhi", "New Delhi"] },
  { code: "08", abbreviation: "RJ", name: "Rajasthan" },
  { code: "09", abbreviation: "UP", name: "Uttar Pradesh" },
  { code: "10", abbreviation: "BR", name: "Bihar" },
  { code: "11", abbreviation: "SK", name: "Sikkim" },
  { code: "12", abbreviation: "AR", name: "Arunachal Pradesh" },
  { code: "13", abbreviation: "NL", name: "Nagaland" },
  { code: "14", abbreviation: "MN", name: "Manipur" },
  { code: "15", abbreviation: "MZ", name: "Mizoram" },
  { code: "16", abbreviation: "TR", name: "Tripura" },
  { code: "17", abbreviation: "ML", name: "Meghalaya" },
  { code: "18", abbreviation: "AS", name: "Assam" },
  { code: "19", abbreviation: "WB", name: "West Bengal" },
  { code: "20", abbreviation: "JH", name: "Jharkhand" },
  { code: "21", abbreviation: "OD", name: "Odisha", aliases: ["Orissa", "OR"] },
  { code: "22", abbreviation: "CG", name: "Chhattisgarh", aliases: ["CT"] },
  { code: "23", abbreviation: "MP", name: "Madhya Pradesh" },
  { code: "24", abbreviation: "GJ", name: "Gujarat" },
  {
    code: "26",
    abbreviation: "DN",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    // Merged in 2020; the old Daman and Diu code 25 now files under 26.
    aliases: ["Dadra and Nagar Haveli", "Daman and Diu", "DD", "25"],
  },
  { code: "27", abbreviation: "MH", name: "Maharashtra" },
  { code: "29", abbreviation: "KA", name: "Karnataka" },
  { code: "30", abbreviation: "GA", name: "Goa" },
  { code: "31", abbreviation: "LD", name: "Lakshadweep" },
  { code: "32", abbreviation: "KL", name: "Kerala" },
  { code: "33", abbreviation: "TN", name: "Tamil Nadu" },
  { code: "34", abbreviation: "PY", name: "Puducherry", aliases: ["Pondicherry"] },
  { code: "35", abbreviation: "AN", name: "Andaman and Nicobar Islands", aliases: ["Andaman and Nicobar"] },
  { code: "36", abbreviation: "TS", name: "Telangana", aliases: ["TG"] },
  { code: "37", abbreviation: "AP", name: "Andhra Pradesh" },
  { code: "38", abbreviation: "LA", name: "Ladakh" },
  { code: "97", abbreviation: "OT", name: "Other Territory" },
];

function key(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.\-_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const index = new Map<string, GstState>();
for (const state of gstStates) {
  for (const label of [state.code, state.abbreviation, state.name, ...(state.aliases ?? [])]) {
    index.set(key(label), state);
  }
}

// The state for a code ("29", "9"), abbreviation ("KA") or name ("karnataka"), or null.
export function resolveGstState(value: string | null | undefined): GstState | null {
  if (!value) {
    return null;
  }
  const normalised = key(value);
  const padded = /^\d$/.test(normalised) ? `0${normalised}` : normalised;
  return index.get(padded) ?? null;
}

export function gstStateByCode(code: string | null | undefined): GstState | null {
  return code ? (gstStates.find((state) => state.code === code) ?? null) : null;
}
