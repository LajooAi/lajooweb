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
    ],
  },
  {
    code: "sg",
    name: "Singapore",
    flag: "/icons/singapore-flag.svg",
    languages: [
      { code: "en", label: "EN (English)" },
      { code: "cn", label: "CN (Chinese 华语)" },
    ],
  },
];

export const DEFAULT_COUNTRY = "my";
export const DEFAULT_LANGUAGE_BY_COUNTRY = {
  my: "en",
  sg: "en",
};
