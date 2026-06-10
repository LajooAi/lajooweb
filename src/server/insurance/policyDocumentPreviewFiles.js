export const POLICY_DOCUMENT_PREVIEW_FILES = {
  takaful: {
    "product-disclosure-sheet": {
      fileName: "Takaful-Ikhlas-Private-Car-Product-Disclosure-Sheet.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/takaful-ikhlas/private-car/private-car-pds-en.pdf",
    },
    "policy-wording": {
      fileName: "Takaful-Ikhlas-Private-Car-Policy-Wording.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/takaful-ikhlas/private-car/private-car-certificate-en.pdf",
    },
  },
  tokio: {
    "product-disclosure-sheet": {
      fileName: "Tokio-Marine-Private-Car-Product-Disclosure-Sheet.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/tokio-marine/private-car/private-car-comprehensive-autopro-pds-en.pdf",
    },
    "policy-wording": {
      fileName: "Tokio-Marine-Private-Car-Policy-Wording.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/tokio-marine/private-car/private-car-comprehensive-autopro-policy-wording-en.pdf",
    },
  },
  etiqa: {
    "product-disclosure-sheet": {
      fileName: "Etiqa-Private-Car-Product-Disclosure-Sheet.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/etiqa/private-car/private-car-comprehensive-pds-en.pdf",
    },
    "policy-wording": {
      fileName: "Etiqa-Private-Car-Policy-Wording.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/etiqa/private-car/private-car-policy-wording-en.pdf",
    },
  },
  allianz: {
    "product-disclosure-sheet": {
      fileName: "Allianz-Private-Car-Product-Disclosure-Sheet.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/allianz/private-car/private-car-comprehensive-pds-en.pdf",
    },
    "policy-wording": {
      fileName: "Allianz-Private-Car-Policy-Wording.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/allianz/private-car/private-car-policy-wording-en.pdf",
    },
  },
  lonpac: {
    "product-disclosure-sheet": {
      fileName: "Lonpac-Private-Car-Product-Disclosure-Sheet.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/lonpac/private-car/private-car-comprehensive-pds-en.pdf",
    },
    "policy-wording": {
      fileName: "Lonpac-Private-Car-Policy-Wording.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/lonpac/private-car/private-car-comprehensive-policy-wording-en.pdf",
    },
  },
  msig: {
    "product-disclosure-sheet": {
      fileName: "MSIG-Private-Car-Product-Disclosure-Sheet.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/msig/private-car/private-car-comprehensive-pds-en.pdf",
    },
    "policy-wording": {
      fileName: "MSIG-Private-Car-Policy-Wording.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/msig/private-car/private-car-comprehensive-enhanced-policy-wording-en.pdf",
    },
  },
  generali: {
    "product-disclosure-sheet": {
      fileName: "Generali-Private-Car-Product-Disclosure-Sheet.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/generali/private-car/private-car-comprehensive-pds-en.pdf",
    },
    "policy-wording": {
      fileName: "Generali-Private-Car-Policy-Wording.pdf",
      sourceRelativePath: "knowledge/raw-pdfs/generali/private-car/private-car-comprehensive-policy-wording-en.pdf",
    },
  },
};

export function getPolicyDocumentPreviewFile(insurerKey, documentKey) {
  const safeInsurerKey = String(insurerKey || "").toLowerCase();
  const safeDocumentKey = String(documentKey || "").toLowerCase();
  return POLICY_DOCUMENT_PREVIEW_FILES[safeInsurerKey]?.[safeDocumentKey] || null;
}
