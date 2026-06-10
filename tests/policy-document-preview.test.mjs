import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  POLICY_DOCUMENT_PREVIEW_FILES,
  getPolicyDocumentPreviewFile,
} from "../src/server/insurance/policyDocumentPreviewFiles.js";
import {
  QUOTE_POLICY_DOCUMENT_TYPES,
  getQuotePolicyDocumentLinks,
} from "../src/lib/quotePolicyDocuments.js";

const insurerKeys = ["takaful", "tokio", "etiqa", "allianz", "lonpac", "msig", "generali"];
const documentKeys = QUOTE_POLICY_DOCUMENT_TYPES.map((document) => document.key);

test("quote document links use product disclosure sheet and policy wording labels", () => {
  assert.deepEqual(
    QUOTE_POLICY_DOCUMENT_TYPES.map((document) => document.label),
    ["Product Disclosure Sheet", "Policy Wording"]
  );

  const tokioLinks = getQuotePolicyDocumentLinks("tokio");
  assert.deepEqual(
    tokioLinks.map((link) => link.url),
    [
      "/api/policy-documents/tokio/product-disclosure-sheet",
      "/api/policy-documents/tokio/policy-wording",
    ]
  );
});

test("all quote-card policy document previews point to available PDFs", () => {
  for (const insurerKey of insurerKeys) {
    assert.ok(POLICY_DOCUMENT_PREVIEW_FILES[insurerKey], `${insurerKey} should have preview documents`);

    for (const documentKey of documentKeys) {
      const document = getPolicyDocumentPreviewFile(insurerKey, documentKey);
      assert.ok(document, `${insurerKey} ${documentKey} should be configured`);
      assert.match(document.fileName, /\.pdf$/i);
      assert.ok(
        fs.existsSync(path.resolve(process.cwd(), document.sourceRelativePath)),
        `${document.sourceRelativePath} should exist`
      );
    }
  }
});
