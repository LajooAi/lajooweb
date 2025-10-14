// src/lib/localeConfig.js

export const COUNTRIES = [
  {
    code: "my",
    name: "Malaysia",
    flag: "/icons/malaysia-flag.svg",
    languages: [
      { code: "en", label: "EN (English)" },
      { code: "bm", label: "BM (Bahasa Melayu)" },
      { code: "cn", label: "CN (Chinese 华语)" },
      { code: "tm", label: "TM (Tamil)" },
    ],
  },
  {
    code: "sg",
    name: "Singapore",
    flag: "/icons/singapore-flag.svg",
    // Same language list as Malaysia (you can customize later)
    languages: [
      { code: "en", label: "EN (English)" },
      { code: "bm", label: "BM (Bahasa Melayu)" },
      { code: "cn", label: "CN (Chinese 华语)" },
      { code: "tm", label: "TM (Tamil)" },
    ],
  },
  // add more countries here later (e.g., "tw")
];

export const DEFAULT_COUNTRY = "my";

export const DEFAULT_LANGUAGE_BY_COUNTRY = {
  my: "en",
  sg: "en",
  // tw: "zh", etc.
};
