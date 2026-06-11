"use client";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import EqualWidthTitle from "@/components/EqualWidthTitle";
import { getQuotePolicyDocumentLinks } from "@/lib/quotePolicyDocuments";

// Strict HTML sanitization schema - only allow safe tags needed for formatting
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'u', // underline for totals
    'span', // inline styling (e.g. divider opacity)
  ],
  attributes: {
    ...defaultSchema.attributes,
    // Only allow safe attributes, no event handlers
    '*': [...(defaultSchema.attributes['*'] || []), 'className', 'style'],
    'span': ['style'],
    'a': ['href', 'target', 'rel', 'download'],
    'img': ['src', 'alt'],
  },
  // Block all protocols except safe ones
  protocols: {
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https', '/'],
  },
};

const createId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random()}`;

const createBrowserSessionId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? `chat_${crypto.randomUUID()}`
    : `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const flattenNodeText = (node) => {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenNodeText).join("");
  if (typeof node === "object" && node.props?.children !== undefined) {
    return flattenNodeText(node.props.children);
  }
  return "";
};

const STAGE_STEP_LABELS = {
  "vehicle info": { step: "1", total: "6", title: "Vehicle info" },
  "choose insurer": { step: "2", total: "6", title: "Choose insurer" },
  "add-ons": { step: "3", total: "6", title: "Add-ons" },
  "road tax": { step: "4", total: "6", title: "Road tax" },
  "your details": { step: "5", total: "6", title: "Your details" },
  payment: { step: "6", total: "6", title: "Payment" },
};

function ChatStepIndicator({ stage }) {
  const parsed = STAGE_STEP_LABELS[String(stage || "").toLowerCase()];
  if (!parsed) return null;

  return (
    <p className="chat-step-indicator">
      <span className="chat-step-count">Step {parsed.step} of {parsed.total}</span>
      <span className="chat-step-separator" aria-hidden="true"> · </span>
      <span className="chat-step-title">{parsed.title}</span>
    </p>
  );
}

const simpleStageHeadingRegexSource = String.raw`(?:vehicle info|choose insurer|add-ons|road tax|your details|payment)`;
const oldStepIndicatorRegexSource = String.raw`step\s*(\d+)\s*of\s*(\d+)\s*[—-]\s*(.+)`;
const stepIndicatorRegex = new RegExp(String.raw`^(?:${oldStepIndicatorRegexSource}|${simpleStageHeadingRegexSource})$`, "i");
const isStepIndicator = (text) => stepIndicatorRegex.test(text.trim().replace(/\*/g, ""));
const parseStepIndicator = (text) => {
  const normalized = text.trim().replace(/\*/g, "");
  const match = normalized.match(new RegExp(String.raw`^${oldStepIndicatorRegexSource}$`, "i"));
  if (match) {
    const knownLabel = STAGE_STEP_LABELS[match[3].trim().toLowerCase()];
    return {
      step: match[1],
      total: match[2],
      title: knownLabel?.title || match[3],
    };
  }
  if (new RegExp(String.raw`^${simpleStageHeadingRegexSource}$`, "i").test(normalized)) {
    return STAGE_STEP_LABELS[normalized.toLowerCase()] || { step: null, total: null, title: normalized };
  }
  return null;
};
const isSummaryTitleLine = (text) => /^summary$/i.test(text.trim()) || /^✓\s*renewal summary\b/i.test(text.trim());
const isSummaryDividerLine = (text) => /^[\-_─—–]{8,}$/.test(text.trim());
const isSummaryTotalLine = (text) => /^(?:💰\s*)?total:\s*rm\s*\d[\d,]*/i.test(text.trim());
const quoteMoneyRegexSource = String.raw`[\d,]+(?:\.\d{2})?`;
const quoteBlockRegex = new RegExp(String.raw`<span[^>]*>\s*<img\s+src="([^"]+)"\s+alt="([^"]+)"[^>]*\/>\s*<strong>([^<]+)<\/strong>\s*—\s*<strong>RM\s*(${quoteMoneyRegexSource})<\/strong>\s*<\/span>\s*\n<span[^>]*>Sum Insured:\s*RM\s*(${quoteMoneyRegexSource})<\/span>\s*\n([\s\S]*?)\n<span[^>]*>~~RM\s*(${quoteMoneyRegexSource})~~\s*→\s*RM\s*(${quoteMoneyRegexSource})(?:\s*\(([^)]*)\))?<\/span>`, "g");
const summarySectionRegex = /(?:^|\n)\s*(?:<span[^>]*>\s*)?(?:\*{0,2})?✓?\s*renewal summary(?:\*{0,2})?[^\n]*(?:<\/span>)?[\s\S]*?(?:\n\s*(?:\*{0,2})?(?:💰\s*)?total:?(?:\*{0,2})?\s*(?:&nbsp;)?\s*(?:<u>)?\s*rm[^\n]*)/i;
const addOnsHeadingRegexSource = String.raw`(?:(?:\*{0,2})?step\s+(?:\*{0,2})?3(?:\*{0,2})?\s+of\s+(?:\*{0,2})?6(?:\*{0,2})?\s*[—-]\s*add-ons(?:\*{0,2})?|(?:\*{0,2})?add-ons(?:\*{0,2})?)`;
const roadTaxHeadingRegexSource = String.raw`(?:(?:\*{0,2})?step\s+(?:\*{0,2})?4(?:\*{0,2})?\s+of\s+(?:\*{0,2})?6(?:\*{0,2})?\s*[—-]\s*road tax(?:\*{0,2})?|(?:\*{0,2})?road tax(?:\*{0,2})?)`;
const paymentHeadingRegexSource = String.raw`(?:(?:\*{0,2})?step\s+(?:\*{0,2})?6(?:\*{0,2})?\s+of\s+(?:\*{0,2})?6(?:\*{0,2})?\s*[—-]\s*payment(?:\*{0,2})?|(?:\*{0,2})?payment(?:\*{0,2})?)`;
const addOnsHeadingRegex = new RegExp(String.raw`(?:^|\n)\s*${addOnsHeadingRegexSource}\s*\n+`, "i");
const roadTaxHeadingRegex = new RegExp(String.raw`(?:^|\n)\s*${roadTaxHeadingRegexSource}\s*\n+`, "i");
const paymentHeadingRegex = new RegExp(String.raw`(?:^|\n)\s*${paymentHeadingRegexSource}\s*\n+`, "i");
const addOnsHeadingSignalRegex = new RegExp(addOnsHeadingRegexSource, "i");
const roadTaxHeadingSignalRegex = new RegExp(roadTaxHeadingRegexSource, "i");
const paymentHeadingSignalRegex = new RegExp(paymentHeadingRegexSource, "i");
const postAddOnsHeadingSignalRegex = new RegExp(String.raw`(?:${roadTaxHeadingRegexSource}|(?:\*{0,2})?your details(?:\*{0,2})?|${paymentHeadingRegexSource})`, "i");
const addOnsSectionRegex = new RegExp(String.raw`(?:^|\n)\s*${addOnsHeadingRegexSource}\s*\n+[\s\S]*?(?:\n\s*based on your situation,[^\n]*reply skip\.?)`, "i");
const roadTaxSectionRegex = new RegExp(String.raw`(?:^|\n)\s*${roadTaxHeadingRegexSource}\s*\n+[\s\S]*?(?:printed road tax is only for Foreign ID or Company vehicles\.?)`, "i");
const paymentSectionRegex = new RegExp(String.raw`(?:^|\n)\s*${paymentHeadingRegexSource}\s*\n+[\s\S]*?(?:policy documents and payment receipt will be sent to your WhatsApp and email\.?)`, "i");
const WINDSCREEN_PREMIUM_RATE = 0.15;
const EMPTY_ARRAY = Object.freeze([]);

const getQuoteSelectionText = (insurerName = "") => {
  const lower = insurerName.toLowerCase();
  if (lower.includes("takaful")) return "Takaful";
  if (lower.includes("tokio")) return "Tokio Marine";
  if (lower.includes("etiqa")) return "Etiqa";
  if (lower.includes("allianz")) return "Allianz";
  if (lower.includes("lonpac")) return "Lonpac";
  if (lower.includes("msig")) return "MSIG";
  if (lower.includes("generali")) return "Generali";
  return insurerName;
};

const getQuoteDisplayName = (insurerName = "") => {
  const lower = insurerName.toLowerCase();
  if (lower.includes("takaful")) return "Takaful Ikhlas Insurance";
  if (lower.includes("tokio")) return "Tokio Marine Insurance";
  if (lower.includes("etiqa")) return "Etiqa Insurance";
  if (lower.includes("allianz")) return "Allianz Insurance";
  if (lower.includes("lonpac")) return "Lonpac Insurance";
  if (lower.includes("msig")) return "MSIG Insurance";
  if (lower.includes("generali")) return "Generali Insurance";
  return insurerName;
};

const getShortInsurerName = (insurerName = "") => {
  const lower = insurerName.toLowerCase();
  if (lower.includes("takaful")) return "Takaful";
  if (lower.includes("tokio")) return "Tokio";
  if (lower.includes("etiqa")) return "Etiqa";
  if (lower.includes("allianz")) return "Allianz";
  if (lower.includes("lonpac")) return "Lonpac";
  if (lower.includes("msig")) return "MSIG";
  if (lower.includes("generali")) return "Generali";
  return insurerName.split(/\s+/)[0] || "current";
};

const getInsurerKey = (insurerName = "") => {
  const lower = insurerName.toLowerCase();
  if (lower.includes("takaful")) return "takaful";
  if (lower.includes("tokio")) return "tokio";
  if (lower.includes("etiqa")) return "etiqa";
  if (lower.includes("allianz")) return "allianz";
  if (lower.includes("lonpac")) return "lonpac";
  if (lower.includes("msig")) return "msig";
  if (lower.includes("generali")) return "generali";
  return "default";
};

const formatQuoteMoney = (value = "") => {
  const numeric = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return String(value || "-");
  return numeric.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatWholeMoney = (value = "") => {
  const numeric = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return String(value || "-");
  return numeric.toLocaleString("en-MY", {
    maximumFractionDigits: 0,
  });
};

const canUsePhysicalRoadTax = (state = null) =>
  state?.ownerIdType === "foreign_id" || state?.ownerIdType === "company_reg";

const buildRoadTaxCardFallback = (state = null) => {
  const physicalAvailable = canUsePhysicalRoadTax(state);

  return {
    defaultOptionId: "12month-digital",
    physicalAvailable,
    options: [
      {
        id: "12month-digital",
        label: "12 months digital road tax",
        description: "Updates instantly in MYJPJ app",
        price: 90,
        available: true,
        message: "12 months digital road tax",
      },
      {
        id: "12month-physical",
        label: "12 months physical + delivery",
        description: physicalAvailable
          ? "MYJPJ app and delivered to you"
          : "Only for Foreign ID or Company Vehicles",
        price: physicalAvailable ? 100 : null,
        available: physicalAvailable,
        unavailableLabel: physicalAvailable ? null : "Not available",
        message: "12 months physical + delivery",
      },
      {
        id: "none",
        label: "No, just insurance",
        price: null,
        available: true,
        message: "No, just insurance",
      },
    ],
  };
};

const hasSummarySignal = (content = "") =>
  /renewal summary|policy (?:effective|period):|sum insured:|cover type:|add-ons:|road tax:|(?:💰\s*)?total:/i.test(content);

const parseAssistantSummaryPresentation = (content = "", summaryCard = null) => {
  if (!summaryCard || !hasSummarySignal(content)) return null;
  const match = content.match(summarySectionRegex);
  if (!match) return null;

  const rawMatch = match[0] || "";
  const leadingNewline = rawMatch.startsWith("\n") ? 1 : 0;
  const summaryStart = match.index + leadingNewline;
  const summaryEnd = match.index + rawMatch.length;

  return {
    before: content.slice(0, summaryStart).trim(),
    summary: summaryCard,
    after: content.slice(summaryEnd).trim(),
  };
};

const parseAssistantAddOnsPresentation = (content = "", addOnsCard = null) => {
  if (!addOnsCard || !addOnsHeadingSignalRegex.test(content)) return null;
  const match = content.match(addOnsSectionRegex);
  if (!match) return null;

  const rawMatch = match[0] || "";
  const leadingNewline = rawMatch.startsWith("\n") ? 1 : 0;
  const addOnsStart = match.index + leadingNewline;
  const addOnsEnd = match.index + rawMatch.length;

  return {
    before: content.slice(0, addOnsStart).trim(),
    addOns: addOnsCard,
    after: content.slice(addOnsEnd).trim(),
  };
};

const parseAssistantRoadTaxPresentation = (content = "", roadTaxCard = null) => {
  if (!roadTaxCard || !roadTaxHeadingSignalRegex.test(content)) return null;
  const match = content.match(roadTaxSectionRegex);
  if (!match) return null;

  const rawMatch = match[0] || "";
  const leadingNewline = rawMatch.startsWith("\n") ? 1 : 0;
  const roadTaxStart = match.index + leadingNewline;
  const roadTaxEnd = match.index + rawMatch.length;

  return {
    before: content.slice(0, roadTaxStart).trim(),
    roadTax: roadTaxCard,
    after: content.slice(roadTaxEnd).trim(),
  };
};

const parseAssistantPaymentPresentation = (content = "", paymentCard = null) => {
  if (!paymentCard || !paymentHeadingSignalRegex.test(content)) return null;
  const match = content.match(paymentSectionRegex);
  if (!match) return null;

  const rawMatch = match[0] || "";
  const leadingNewline = rawMatch.startsWith("\n") ? 1 : 0;
  const paymentStart = match.index + leadingNewline;
  const paymentEnd = match.index + rawMatch.length;

  return {
    before: content.slice(0, paymentStart).trim(),
    payment: paymentCard,
    after: content.slice(paymentEnd).trim(),
  };
};

const withSummaryDisplayState = (summary, followingContent = "") => {
  if (!summary) return null;
  const hasReachedPostAddOnsStep =
    /step\s+(?:\*{0,2})?[4-6](?:\*{0,2})?\s+of\s+(?:\*{0,2})?6/i.test(followingContent) ||
    postAddOnsHeadingSignalRegex.test(followingContent);
  return {
    ...summary,
    addOnsConfirmed: !!summary.addOnsConfirmed || hasReachedPostAddOnsStep,
  };
};

function AssistantSummaryCard({ summary }) {
  if (!summary) return null;

  const addOns = Array.isArray(summary.addOns) ? summary.addOns : [];
  const hasAddOns = addOns.length > 0;
  const hasConfirmedNoAddOns = !hasAddOns && summary.addOnsConfirmed;

  return (
    <article className="assistant-summary-card" aria-label="Renewal summary">
      <header className="assistant-summary-header">
        {summary.logoUrl && (
          <Image
            src={summary.logoUrl}
            alt={summary.insurerName || "Insurer"}
            width={42}
            height={42}
            className="assistant-summary-logo"
          />
        )}
        <div className="assistant-summary-heading">
          <h3>{summary.insurerName}</h3>
          <p>{summary.vehicleLine}</p>
        </div>
      </header>

      <div className="assistant-summary-meta">
        <p>
          <strong>Sum insured : </strong>
          <span>RM {formatWholeMoney(summary.sumInsured)}</span>
        </p>
        <p>
          <strong>Policy Period : </strong>
          <span>{summary.policyPeriod}</span>
        </p>
        <p>
          <strong>Cover Type : </strong>
          <span>{summary.coverType}</span>
        </p>
      </div>

      <div className="assistant-summary-divider" />

      <section className="assistant-summary-section">
        <h4>{summary.insuranceTitle || "Insurance"}</h4>
        <div className="assistant-summary-line">
          <span>{summary.premiumDescription}</span>
          <strong>RM {formatQuoteMoney(summary.insurancePrice)}</strong>
        </div>
      </section>

      <section className="assistant-summary-section">
        <h4>Add-ons</h4>
        {hasAddOns ? (
          addOns.map((addOn) => (
            <div className="assistant-summary-line" key={`${addOn.name}-${addOn.price}`}>
              <span>{addOn.name}</span>
              <strong>RM {formatQuoteMoney(addOn.price)}</strong>
            </div>
          ))
        ) : (
          <div className="assistant-summary-line">
            <span className={hasConfirmedNoAddOns ? undefined : "assistant-summary-not-selected"}>
              {hasConfirmedNoAddOns ? "None" : "Not selected yet"}
            </span>
            <strong>RM 0.00</strong>
          </div>
        )}
      </section>

      <section className="assistant-summary-section">
        <h4>Tax</h4>
        <div className="assistant-summary-line">
          <span>{summary.taxDescription}</span>
          <strong>RM {formatQuoteMoney(summary.taxPrice)}</strong>
        </div>
      </section>

      <section className="assistant-summary-section">
        <h4>Road Tax</h4>
        <div className="assistant-summary-line">
          <span
            className={
              !summary.roadTaxSelected
                ? `assistant-summary-not-selected${summary.roadTaxConfirmed ? " is-muted" : ""}`
                : undefined
            }
          >
            {summary.roadTaxDescription || "Not selected yet"}
          </span>
          <strong>RM {formatQuoteMoney(summary.roadTaxPrice)}</strong>
        </div>
      </section>

      <div className="assistant-summary-divider assistant-summary-divider-total" />

      <div className="assistant-summary-total">
        <span>Grand Total</span>
        <strong>RM {formatQuoteMoney(summary.total)}</strong>
      </div>
    </article>
  );
}

const parseMoneyInput = (value) => {
  const numeric = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeFlowStep = (step = "") =>
  String(step || "").toLowerCase().replace(/[\s-]+/g, "_");

const getAddOnsCommitMode = (step = "") => {
  const normalizedStep = normalizeFlowStep(step);
  if (normalizedStep === "payment") return "payment";
  if (["roadtax", "road_tax", "personal_details", "otp", "success"].includes(normalizedStep)) {
    return "update";
  }
  return "confirm";
};

const getAddOnsCommitLabel = (commitMode = "confirm") => {
  if (commitMode === "payment") return "Update total";
  if (commitMode === "update") return "Update add-ons";
  return "Confirm";
};

const formatAddOnsListForReply = (labels = []) => {
  const items = labels.filter(Boolean);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

const formatAddOnsUserReply = (labels = [], options = {}) => {
  const selectedList = formatAddOnsListForReply(labels);
  if (!selectedList) return "";

  const commitMode = options.commitMode || "confirm";
  if (commitMode === "payment") return `Update add-ons to only ${selectedList} and update total`;
  if (commitMode === "update") return `Update add-ons to only ${selectedList}`;

  return `Add ${selectedList}`;
};

const formatAddOnsSkipReply = (commitMode = "confirm") =>
  commitMode === "confirm" ? "skip add-ons" : "change add-ons to skip all";

const normalizeRoadTaxReply = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getRoadTaxOptionAliases = (option = {}, context = {}) => {
  const aliases = [option.id, option.label, option.message].filter(Boolean);

  if (option.id === "12month-digital") {
    aliases.push("12 months digital", "digital road tax");
    if (!context.hasDeliveredRoadTaxChoice) {
      aliases.push("yes", "ok");
    }
  }

  if (option.id === "12month-physical") {
    aliases.push("12 months physical delivery", "physical road tax", "physical delivery");
  }

  if (option.id === "none") {
    aliases.push("no road tax", "no just insurance", "just insurance");
  }

  return aliases.map(normalizeRoadTaxReply).filter(Boolean);
};

const getSelectedRoadTaxOptionIdFromState = (state = null, options = []) => {
  const selectedRoadTax = state?.selectedRoadTax;
  if (!selectedRoadTax || options.length === 0) return null;

  const explicitId = normalizeRoadTaxReply(selectedRoadTax.id || selectedRoadTax.optionId || "");
  const selectedText = normalizeRoadTaxReply(
    [
      selectedRoadTax.id,
      selectedRoadTax.optionId,
      selectedRoadTax.name,
      selectedRoadTax.label,
      selectedRoadTax.message,
    ].filter(Boolean).join(" ")
  );

  const selectedOption = options.find((option) => {
    if (explicitId && normalizeRoadTaxReply(option.id) === explicitId) return true;

    const aliases = getRoadTaxOptionAliases(option);
    return aliases.some((alias) =>
      selectedText === alias || (alias.length > 3 && selectedText.includes(alias))
    );
  });

  return selectedOption?.available ? selectedOption.id : null;
};

const getSelectedRoadTaxOptionId = (messages = [], assistantIndex = -1, roadTaxCard = null, state = null) => {
  const options = Array.isArray(roadTaxCard?.options) ? roadTaxCard.options : [];
  if (assistantIndex < 0 || options.length === 0) return null;

  const selectedFromState = getSelectedRoadTaxOptionIdFromState(state, options);
  if (selectedFromState) return selectedFromState;

  const nextUserMessage = messages.slice(assistantIndex + 1).find((message) => message?.role === "user");
  const userReply = normalizeRoadTaxReply(nextUserMessage?.content || "");
  if (!userReply) return null;
  const hasDeliveredRoadTaxChoice = options.some((option) => option.id === "12month-physical" && option.available);

  const selectedOption = options.find((option) =>
    getRoadTaxOptionAliases(option, { hasDeliveredRoadTaxChoice }).some((alias) =>
      userReply === alias || (alias.length > 3 && userReply.includes(alias))
    )
  );

  return selectedOption?.available ? selectedOption.id : null;
};

const normalizeAddOnReply = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isNegatedAddOnAlias = (normalizedReply = "", alias = "") =>
  [
    `no ${alias}`,
    `not ${alias}`,
    `without ${alias}`,
    `dont need ${alias}`,
    `do not need ${alias}`,
  ].some((phrase) => normalizedReply.includes(phrase));

const getAddOnOptionAliases = (option = {}) => {
  const aliases = [option.id, option.name].filter(Boolean);

  switch (option.id) {
    case "windscreen":
      aliases.push("windscreen coverage", "glass coverage");
      break;
    case "flood":
      aliases.push("special perils", "flood", "inclusion of special perils");
      break;
    case "ehailing":
      aliases.push("e hailing", "e hailing grab", "grab", "ride sharing");
      break;
    case "all_drivers":
      aliases.push("all drivers", "additional drivers");
      break;
    case "legal_liability_passengers":
      aliases.push("legal liability", "legal liability to passengers");
      break;
    case "lltp_negligence":
      aliases.push("lltp", "negligence acts");
      break;
    case "strike_riot":
      aliases.push("strike riot", "civil commotion", "riot");
      break;
    case "betterment_waiver":
      aliases.push("betterment", "betterment waiver");
      break;
    case "ncd_relief":
      aliases.push("ncd relief", "current year ncd relief");
      break;
    case "body_painting":
      aliases.push("body painting", "full vehicle body painting");
      break;
    case "personal_accident":
      aliases.push("personal accident", "personal accident for all");
      break;
    default:
      break;
  }

  return aliases.map(normalizeAddOnReply).filter(Boolean);
};

const sortAddOnIdsByOptionOrder = (ids = [], options = []) => {
  const wanted = new Set(ids.filter(Boolean));
  return options.map((option) => option.id).filter((id) => wanted.has(id));
};

const getWindscreenCoverageFromStructuredAddOns = (addOns = []) => {
  for (const addOn of addOns) {
    const id = String(addOn?.id || "").toLowerCase();
    const label = String([addOn?.name, addOn?.shortName, addOn?.summaryName].filter(Boolean).join(" "));
    const normalizedLabel = normalizeAddOnReply(label);
    const isWindscreen = id === "windscreen" || normalizedLabel.includes("windscreen");
    if (!isWindscreen) continue;

    const explicitCoverage = Number(addOn?.coverageAmount || addOn?.coverage || 0);
    if (Number.isFinite(explicitCoverage) && explicitCoverage > 0) return explicitCoverage;

    const amountMatch = label.match(/\brm\s*([\d,]+(?:\.\d{1,2})?)\b/i);
    if (amountMatch) {
      const parsedAmount = Number(amountMatch[1].replace(/,/g, ""));
      if (Number.isFinite(parsedAmount) && parsedAmount > 0) return parsedAmount;
    }
  }

  return null;
};

const getSelectedIdsFromStructuredAddOns = (addOns = [], options = []) => {
  if (!Array.isArray(addOns) || addOns.length === 0 || options.length === 0) return [];

  const selectedIds = new Set();
  for (const addOn of addOns) {
    const explicitId = String(addOn?.id || "").toLowerCase();
    if (options.some((option) => option.id === explicitId)) {
      selectedIds.add(explicitId);
      continue;
    }

    const normalizedLabel = normalizeAddOnReply(
      [addOn?.name, addOn?.shortName, addOn?.summaryName].filter(Boolean).join(" ")
    );
    if (!normalizedLabel) continue;

    const matchedOption = options.find((option) =>
      getAddOnOptionAliases(option).some((alias) =>
        alias.length > 2 &&
        (normalizedLabel === alias || normalizedLabel.includes(alias))
      )
    );

    if (matchedOption?.id) selectedIds.add(matchedOption.id);
  }

  return sortAddOnIdsByOptionOrder([...selectedIds], options);
};

const getLatestConfirmedAddOnState = (messages = [], assistantIndex = -1, addOnsCard = null) => {
  const options = Array.isArray(addOnsCard?.options) ? addOnsCard.options : [];
  if (assistantIndex < 0 || options.length === 0) return null;

  for (let index = messages.length - 1; index >= assistantIndex; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;

    const summaryAddOns = Array.isArray(message.summaryCard?.addOns)
      ? message.summaryCard.addOns
      : null;
    if (summaryAddOns && summaryAddOns.length > 0) {
      const ids = getSelectedIdsFromStructuredAddOns(summaryAddOns, options);
      if (ids.length > 0) {
        return {
          ids,
          windscreenCoverage: getWindscreenCoverageFromStructuredAddOns(summaryAddOns),
        };
      }
    }

    if (summaryAddOns && summaryAddOns.length === 0 && message.summaryCard?.addOnsConfirmed) {
      return { ids: [], windscreenCoverage: null };
    }

    const cardSelectedIds = Array.isArray(message.addOnsCard?.selectedIds)
      ? sortAddOnIdsByOptionOrder(message.addOnsCard.selectedIds, options)
      : [];
    if (cardSelectedIds.length > 0) {
      return {
        ids: cardSelectedIds,
        windscreenCoverage: Number(message.addOnsCard?.defaultWindscreenCoverage || 0) || null,
      };
    }
  }

  return null;
};

const getSelectedAddOnIdsFromUserReply = (messages = [], assistantIndex = -1, addOnsCard = null) => {
  const options = Array.isArray(addOnsCard?.options) ? addOnsCard.options : [];
  if (assistantIndex < 0 || options.length === 0) return null;

  const nextUserMessage = messages.slice(assistantIndex + 1).find((message) => message?.role === "user");
  if (!nextUserMessage) return null;

  const rawReply = String(nextUserMessage.content || "");
  const normalizedReply = normalizeAddOnReply(rawReply);
  if (!normalizedReply) return null;
  if (/\bskip(?: add ons?)?\b/.test(normalizedReply)) return [];
  if (isAddOnQuestionReply(rawReply, normalizedReply)) return null;

  const replyWithoutMoney = rawReply.replace(/\brm\s*\d[\d,]*(?:\.\d+)?\b/gi, " ");
  const selectedNumbers = new Set(
    Array.from(replyWithoutMoney.matchAll(/\b\d{1,2}\b/g), (match) => Number(match[0]))
  );

  return options
    .filter((option) => {
      if (selectedNumbers.has(Number(option.number))) return true;

      return getAddOnOptionAliases(option).some((alias) =>
        alias.length > 2 &&
        !isNegatedAddOnAlias(normalizedReply, alias) &&
        (normalizedReply === alias || normalizedReply.includes(alias))
      );
    })
    .map((option) => option.id);
};

const getSelectedAddOnDisplayState = (messages = [], assistantIndex = -1, addOnsCard = null) => {
  const latestConfirmedState = getLatestConfirmedAddOnState(messages, assistantIndex, addOnsCard);
  if (latestConfirmedState) return latestConfirmedState;

  const ids = getSelectedAddOnIdsFromUserReply(messages, assistantIndex, addOnsCard);
  return Array.isArray(ids)
    ? { ids, windscreenCoverage: Number(addOnsCard?.defaultWindscreenCoverage || 0) || null }
    : null;
};

const isAddOnQuestionReply = (rawReply = "", normalizedReply = "") => {
  const raw = String(rawReply || "");
  const normalized = normalizedReply || normalizeAddOnReply(raw);
  if (!normalized) return false;

  const startsAsQuestion = /^(what|why|how|when|where|which|do i|should i|can you explain|explain|tell me|does|will|is it|are there)\b/.test(normalized);
  const asksAdvice = /\b(recommend|recommendation|advice|advise|which one|best option|worth it)\b/.test(normalized);
  const asksMeaning = /\b(what is|what does|meaning|mean|cover|coverage|covered|benefit|need it)\b/.test(normalized);
  const explicitSelectionQuestion = /^(can you|could you|please)\s+(add|select|include|put|choose)\b/.test(normalized);
  const explicitSelection = /\b(add|select|choose|tick|confirm|include|want|go with|put|use|proceed|yes|ok|okay|only|please add)\b/.test(normalized);

  if (startsAsQuestion && !explicitSelectionQuestion) return true;
  if (asksAdvice) return true;
  if (raw.includes("?") && asksMeaning && !explicitSelection) return true;

  return false;
};

function AddOnInfoButton({ label, number, info, activeInfoId, setActiveInfoId, id }) {
  const isOpen = activeInfoId === id;
  const tooltipId = `addon-info-${id}`;

  return (
    <span className="assistant-addons-info-wrap">
      <button
        type="button"
        className="assistant-addons-info"
        aria-label={`About ${label}`}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? tooltipId : undefined}
        onClick={() => setActiveInfoId(isOpen ? null : id)}
      >
        i
      </button>
      {isOpen && (
        <span className="assistant-addons-tooltip" id={tooltipId} role="tooltip">
          <span className="assistant-addons-tooltip-title">
            {number}. {label}
          </span>
          <span className="assistant-addons-tooltip-description">{info}</span>
        </span>
      )}
    </span>
  );
}

function AssistantAddOnsSelector({
  addOnsCard,
  onConfirm,
  onSkip,
  selectedOptionIds = null,
  selectedWindscreenCoverage = null,
  commitMode = "confirm",
}) {
  const options = Array.isArray(addOnsCard?.options) ? addOnsCard.options : EMPTY_ARRAY;
  const initialSelected = Array.isArray(addOnsCard?.selectedIds) ? addOnsCard.selectedIds : EMPTY_ARRAY;
  const defaultCoverage = Number(addOnsCard?.defaultWindscreenCoverage ?? 0);
  const controlledWindscreenCoverage = Number(selectedWindscreenCoverage ?? 0);
  const initialWindscreenCoverage =
    controlledWindscreenCoverage > 0 ? controlledWindscreenCoverage : defaultCoverage;
  const syncedSelectedIds = useMemo(
    () => sortAddOnIdsByOptionOrder(
      Array.isArray(selectedOptionIds) ? selectedOptionIds : initialSelected,
      options
    ),
    [initialSelected, options, selectedOptionIds]
  );
  const [selectedIds, setSelectedIds] = useState(syncedSelectedIds);
  const [windscreenCoverageInput, setWindscreenCoverageInput] = useState(formatQuoteMoney(initialWindscreenCoverage));
  const [activeInfoId, setActiveInfoId] = useState(null);

  useEffect(() => {
    setSelectedIds(syncedSelectedIds);
  }, [syncedSelectedIds]);

  useEffect(() => {
    setWindscreenCoverageInput(formatQuoteMoney(initialWindscreenCoverage));
  }, [initialWindscreenCoverage]);

  useEffect(() => {
    if (!activeInfoId || typeof document === "undefined") return undefined;

    const handleOutsidePointerDown = (event) => {
      const target = event.target;
      if (target?.closest?.(".assistant-addons-info-wrap")) return;
      setActiveInfoId(null);
    };

    const outsideEvents = ["pointerdown", "mousedown", "touchstart", "click"];
    outsideEvents.forEach((eventName) => {
      document.addEventListener(eventName, handleOutsidePointerDown, true);
    });
    return () => {
      outsideEvents.forEach((eventName) => {
        document.removeEventListener(eventName, handleOutsidePointerDown, true);
      });
    };
  }, [activeInfoId]);

  const windscreenCoverage = Math.max(0, parseMoneyInput(windscreenCoverageInput));
  const windscreenPrice = windscreenCoverage * WINDSCREEN_PREMIUM_RATE;
  const displayedSelectedIds = sortAddOnIdsByOptionOrder(selectedIds, options);
  const hasSelection = displayedSelectedIds.length > 0;
  const confirmLabel = getAddOnsCommitLabel(commitMode);

  const toggleAddOn = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? sortAddOnIdsByOptionOrder(prev.filter((item) => item !== id), options)
        : sortAddOnIdsByOptionOrder([...prev, id], options)
    );
  };

  const handleCoverageBlur = () => {
    const coverage = parseMoneyInput(windscreenCoverageInput) || defaultCoverage;
    setWindscreenCoverageInput(formatQuoteMoney(coverage));
  };

  const handleConfirm = () => {
    if (!hasSelection) return;
    onConfirm?.({
      selectedIds: displayedSelectedIds,
      options,
      windscreenCoverage,
      commitMode,
    });
  };

  return (
    <section className="assistant-addons-card" aria-label="Add-ons selection">
      <p className="assistant-addons-title">
        Would you like some <strong>add-ons</strong> ?
      </p>

      <div className="assistant-addons-list">
        {options.map((option) => {
          const isSelected = displayedSelectedIds.includes(option.id);
          const isWindscreen = option.hasCoverageInput;
          const price = isWindscreen ? windscreenPrice : Number(option.price || 0);

          return (
            <div className="assistant-addons-row" key={option.id}>
              <div className={`assistant-addons-left${isSelected ? " is-selected" : ""}`}>
                <span className="assistant-addons-number">{option.number}.</span>
                <span className="assistant-addons-name">{option.name}</span>
                {isWindscreen && (
                  <span className="assistant-addons-coverage">
                    <span>RM</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={windscreenCoverageInput}
                      aria-label="Windscreen coverage amount"
                      onChange={(event) => setWindscreenCoverageInput(event.target.value)}
                      onBlur={handleCoverageBlur}
                    />
                  </span>
                )}
                {option.recommended && (
                  <span className="assistant-addons-star" aria-hidden="true">★</span>
                )}
                <AddOnInfoButton
                  id={option.id}
                  label={option.name}
                  number={option.number}
                  info={option.info}
                  activeInfoId={activeInfoId}
                  setActiveInfoId={setActiveInfoId}
                />
              </div>

              <strong className={`assistant-addons-price${isSelected ? " is-selected" : ""}`}>
                RM {formatQuoteMoney(price)}
              </strong>

              <button
                type="button"
                className={`assistant-addons-check${isSelected ? " is-selected" : ""}`}
                aria-label={`${isSelected ? "Remove" : "Select"} ${option.name}`}
                aria-pressed={isSelected}
                onClick={() => toggleAddOn(option.id)}
              >
                {isSelected && <span aria-hidden="true">✓</span>}
              </button>
            </div>
          );
        })}
      </div>

      <div className="assistant-addons-actions">
        <button type="button" className="assistant-addons-skip" onClick={() => onSkip?.({ commitMode })}>
          Skip &gt;&gt;
        </button>
        <button
          type="button"
          className={`assistant-addons-confirm${hasSelection ? " is-active" : ""}`}
          disabled={!hasSelection}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </button>
      </div>

      <div className="assistant-addons-help">
        <p>Which would you like ? You can either skip or :</p>
        <ul>
          <li>Tick the boxes above to select.</li>
          <li>Type 1, 2, 3, 8 to select.</li>
          <li>Simply tell me which you want.</li>
        </ul>
        <p>Or ask me for recommendations.</p>
      </div>
    </section>
  );
}

function AssistantRoadTaxSelector({ roadTaxCard, onSelect, selectedOptionId = null }) {
  const options = Array.isArray(roadTaxCard?.options) ? roadTaxCard.options : [];
  const hasUnavailablePhysicalOption = options.some((option) => option.id === "12month-physical" && !option.available);
  const visibleOptions = hasUnavailablePhysicalOption
    ? [
        ...options.filter((option) => option.id !== "12month-physical"),
        ...options.filter((option) => option.id === "12month-physical"),
      ]
    : options;

  return (
    <section className="assistant-roadtax-card" aria-label="Road tax selection">
      <p className="assistant-roadtax-question">
        Would you like to renew <strong>road tax</strong> together ?
      </p>

      <div className="assistant-roadtax-options">
        {visibleOptions.map((option) => {
          const isActive = option.available && option.id === selectedOptionId;
          const isNone = option.id === "none";
          const disabled = !option.available;

          return (
            <button
              type="button"
              key={option.id}
              className={`assistant-roadtax-option${isActive ? " is-active" : ""}${disabled ? " is-disabled" : ""}${isNone ? " is-none" : ""}`}
              disabled={disabled}
              aria-label={option.unavailableLabel ? `${option.label}. ${option.unavailableLabel}` : option.label}
              onClick={() => !disabled && onSelect?.(option)}
            >
              {!disabled && (
                <span className="assistant-roadtax-radio" aria-hidden="true">
                  {isActive && <span>✓</span>}
                </span>
              )}

              <span className="assistant-roadtax-copy">
                {isNone ? (
                  <span className="assistant-roadtax-title">
                    <strong>No,</strong> just insurance
                  </span>
                ) : (
                  <>
                    <span className="assistant-roadtax-title">{option.label}</span>
                    {option.description && (
                      <span className="assistant-roadtax-description">{option.description}</span>
                    )}
                  </>
                )}
              </span>

              {option.unavailableLabel ? (
                <span className="assistant-roadtax-badge">{option.unavailableLabel}</span>
              ) : Number.isFinite(Number(option.price)) && !isNone ? (
                <strong className="assistant-roadtax-price">RM {formatWholeMoney(option.price)}</strong>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AssistantPaymentCard({ paymentCard, sessionKey }) {
  if (!paymentCard?.href) return null;

  const hrefWithSession = !/[?&]session=/.test(paymentCard.href)
    ? `${paymentCard.href}${paymentCard.href.includes("?") ? "&" : "?"}session=${encodeURIComponent(sessionKey)}`
    : paymentCard.href;
  const icons = paymentCard.icons || {};

  return (
    <section className="assistant-payment-card" aria-label="Payment checkout">
      <div className="assistant-payment-intro">
        <p className="assistant-payment-review">
          Please review your quotation before payment.
        </p>
        <p>If anything needs to be changed, let me know.</p>
      </div>

      <div className="assistant-payment-methods">
        <Image src={icons.card || "/icons/payment-card.svg"} alt="" width={28} height={28} aria-hidden="true" />
        <span>Credit/Debit card, FPX, E-Wallet, Buy Now Pay Later, and Credit Card Instalments.</span>
      </div>

      <a
        className="assistant-payment-button"
        href={hrefWithSession}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Image src={icons.lock || "/icons/payment-lock.svg"} alt="" width={34} height={34} aria-hidden="true" />
        <span>Pay securely - RM {formatQuoteMoney(paymentCard.total)}</span>
      </a>

      <div className="assistant-payment-secure">
        <Image src={icons.guard || "/icons/payment-shield.svg"} alt="" width={24} height={24} aria-hidden="true" />
        <span>Payment opens in a secure checkout page.</span>
      </div>

      <p className="assistant-payment-after">
        After successful payment, your policy documents and payment receipt will be sent to your WhatsApp and email.
      </p>
    </section>
  );
}

function AssistantPaymentSuccessCard({ paymentSuccessCard }) {
  if (!paymentSuccessCard?.paymentId) return null;
  const documents = Array.isArray(paymentSuccessCard.documents) ? paymentSuccessCard.documents : [];

  return (
    <section className="assistant-payment-success-card" aria-label="Payment successful">
      <div className="assistant-payment-success-panel">
        <Image
          src={paymentSuccessCard.icon || "/icons/payment-success-check.svg"}
          alt=""
          width={62}
          height={62}
          aria-hidden="true"
          className="assistant-payment-success-icon"
        />

        <div className="assistant-payment-success-copy">
          <h3>Payment Successful</h3>
          <p>Your renewal is now done.</p>

          <div className="assistant-payment-success-table">
            <div className="assistant-payment-success-row">
              <strong>Paid</strong>
              <span className="assistant-payment-success-amount">RM {formatQuoteMoney(paymentSuccessCard.total)}</span>
            </div>
            <div className="assistant-payment-success-row">
              <strong>Reference</strong>
              <span>{paymentSuccessCard.paymentId}</span>
            </div>
            <div className="assistant-payment-success-row">
              <strong>Status</strong>
              <span>Completed</span>
            </div>
          </div>
        </div>
      </div>

      <div className="assistant-payment-documents">
        <p>The <strong>documents</strong> were sent to your WhatsApp and email. You can also download copies here.</p>

        <div className="assistant-payment-document-list">
          {documents.map((document) => (
            <a
              key={document.href}
              className="assistant-payment-document-link"
              href={document.href}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <span className="assistant-payment-pdf-icon" aria-hidden="true">PDF</span>
              <span>{document.label}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M12 4V19M5 12L12 19L19 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ))}
        </div>
      </div>

      <p className="assistant-payment-success-after">
        Your coverage starts immediately. Thank you and drive safe.
      </p>
    </section>
  );
}

const quoteDetailBenefits = {
  default: [
    "Comprehensive own damage protection",
    "Third-party liability protection",
    "Optional add-ons can be included before payment",
  ],
  takaful: [
    "Comprehensive own damage protection",
    "Third-party liability protection",
    "Optional windscreen and flood add-ons available",
  ],
  etiqa: [
    "Comprehensive own damage protection",
    "Third-party liability protection",
    "Optional road tax renewal can be added",
  ],
  allianz: [
    "Comprehensive own damage protection",
    "Third-party liability protection",
    "Optional windscreen and special perils add-ons available",
  ],
};

const parseAssistantQuotePresentation = (content = "") => {
  const isNormalQuoteList =
    /great,\s*here'?s what we have/i.test(content) &&
    /which option would you like to go with/i.test(content);
  const isSwitchConfirmation =
    /here is how it looks/i.test(content) &&
    /confirm switch to/i.test(content) &&
    /\bkeep\b/i.test(content);

  if (
    !isNormalQuoteList &&
    !isSwitchConfirmation
  ) {
    return null;
  }

  quoteBlockRegex.lastIndex = 0;
  const quotes = [];
  let firstQuoteStart = -1;
  let lastQuoteEnd = -1;
  let match;

  while ((match = quoteBlockRegex.exec(content)) !== null) {
    if (firstQuoteStart === -1) firstQuoteStart = match.index;
    lastQuoteEnd = quoteBlockRegex.lastIndex;

    const [, logoUrl, logoAlt, insurer, finalPrice, sumInsured, featuresBlock, basePrice, priceAfter, ncdText] = match;
    const features = [...featuresBlock.matchAll(/<span[^>]*>\s*✓\s*([^<]+)<\/span>/g)]
      .map((featureMatch) => featureMatch[1].trim())
      .filter(Boolean);
    const ncdPercent = (ncdText || "").match(/[\d.]+%/)?.[0] || "";

    const displayName = getQuoteDisplayName(insurer);
    const quote = {
      id: getInsurerKey(insurer),
      insurer: displayName,
      logoUrl,
      logoAlt,
      finalPrice,
      sumInsured,
      features,
      basePrice,
      priceAfter,
      ncdPercent,
      selectionText: getQuoteSelectionText(insurer),
    };

    if (isSwitchConfirmation) {
      if (quotes.length === 0) {
        quote.ctaLabel = "Confirm Switch";
        quote.selectionText = `confirm switch to ${displayName}`;
      } else if (quotes.length === 1) {
        quote.ctaLabel = `Keep ${getShortInsurerName(displayName)}`;
        quote.selectionText = "keep current";
      }
    }

    quotes.push(quote);
  }

  if (quotes.length < 2 || firstQuoteStart === -1 || lastQuoteEnd === -1) {
    return null;
  }

  return {
    before: content.slice(0, firstQuoteStart).trim(),
    quotes,
    after: content.slice(lastQuoteEnd).trim(),
  };
};

function AssistantQuoteCards({ quotes = [], onSelectQuote }) {
  const [expandedQuotes, setExpandedQuotes] = useState({});
  const [pdfModal, setPdfModal] = useState(null);

  useEffect(() => {
    if (!pdfModal) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setPdfModal(null);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [pdfModal]);

  const toggleQuoteDetails = (quoteKey) => {
    setExpandedQuotes((prev) => ({
      ...prev,
      [quoteKey]: !prev[quoteKey],
    }));
  };

  return (
    <>
      <div className="assistant-quote-card-stack" aria-label="Insurance quote options">
        {quotes.map((quote) => {
          const quoteKey = quote.id || quote.insurer;
          const isExpanded = !!expandedQuotes[quoteKey];
          const detailBenefits = quoteDetailBenefits[quote.id] || quoteDetailBenefits.default;
          const quoteDocumentLinks = getQuotePolicyDocumentLinks(quote.id);

          return (
            <article className="assistant-quote-card" key={quoteKey}>
              <div className="assistant-quote-main">
                <h3 className="assistant-quote-title">{quote.insurer}</h3>
                <p className="assistant-quote-line assistant-quote-sum">
                  <span>Sum Insured : </span>
                  <span>RM {quote.sumInsured}</span>
                </p>
                {quote.features.map((feature) => (
                  <p className="assistant-quote-feature" key={`${quote.id}-${feature}`}>
                    <span className="assistant-quote-check" aria-hidden="true">✓</span>
                    <span>{feature}</span>
                  </p>
                ))}
                <button
                  type="button"
                  className="assistant-quote-view-details"
                  aria-expanded={isExpanded}
                  onClick={() => toggleQuoteDetails(quoteKey)}
                >
                  <span>{isExpanded ? "Hide details" : "View details"}</span>
                  <span className="assistant-quote-view-arrow" aria-hidden="true">
                    {isExpanded ? "˄" : "˅"}
                  </span>
                </button>
                {isExpanded && (
                  <div className="assistant-quote-details">
                    <div className="assistant-quote-detail-benefits" aria-label={`${quote.insurer} additional benefits`}>
                      {detailBenefits.map((benefit) => (
                        <p className="assistant-quote-detail-benefit" key={`${quoteKey}-${benefit}`}>
                          <span className="assistant-quote-check" aria-hidden="true">✓</span>
                          <span>{benefit}</span>
                        </p>
                      ))}
                    </div>
                    <div className="assistant-quote-doc-links" aria-label={`${quote.insurer} policy documents`}>
                      {quoteDocumentLinks.map((documentLink) => (
                        <button
                          type="button"
                          className="assistant-quote-doc-link"
                          key={`${quoteKey}-${documentLink.label}`}
                          onClick={() =>
                            setPdfModal({
                              title: `${quote.insurer} ${documentLink.label}`,
                              url: documentLink.url,
                            })
                          }
                        >
                          {documentLink.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="assistant-quote-line assistant-quote-base-price">
                  <s>RM {formatQuoteMoney(quote.basePrice)}</s>
                  {quote.ncdPercent && <span>(NCD {quote.ncdPercent})</span>}
                </p>
                <p className="assistant-quote-final-price">
                  RM {formatQuoteMoney(quote.priceAfter || quote.finalPrice)}
                </p>
              </div>

              <div className="assistant-quote-side">
                {quote.logoUrl && (
                  <Image
                    src={quote.logoUrl}
                    alt={quote.logoAlt || quote.insurer}
                    width={112}
                    height={72}
                    className="assistant-quote-logo"
                    data-insurer={quote.id}
                  />
                )}
                <button
                  type="button"
                  className="assistant-quote-select"
                  onClick={() => onSelectQuote?.(quote)}
                  disabled={!onSelectQuote}
                >
                  {quote.ctaLabel || "Select"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {pdfModal && (
        <div className="assistant-pdf-modal-backdrop" role="presentation" onClick={() => setPdfModal(null)}>
          <div
            className="assistant-pdf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-pdf-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="assistant-pdf-modal-header">
              <h3 id="assistant-pdf-modal-title">{pdfModal.title}</h3>
              <button type="button" className="assistant-pdf-modal-close" onClick={() => setPdfModal(null)}>
                Close
              </button>
            </div>
            <iframe className="assistant-pdf-frame" src={pdfModal.url} title={pdfModal.title} />
            <p className="assistant-pdf-note">Policy document preview from LAJOO insurer PDF library. Please review the final issued policy documents before payment.</p>
          </div>
        </div>
      )}
    </>
  );
}

const HERO_INSURER_LOGOS = [
  { id: "allianz", name: "Allianz", src: "/partners/allianz.svg" },
  { id: "tokio", name: "Tokio Marine", src: "/partners/tokio-marine.svg" },
  { id: "etiqa", name: "Etiqa", src: "/partners/etiqa.svg" },
  { id: "takaful", name: "Takaful", src: "/partners/takaful.svg" },
  { id: "lonpac", name: "Lonpac", src: "/partners/lonpac.svg" },
  { id: "msig", name: "MSIG", src: "/partners/msig.svg" },
  { id: "generali", name: "Generali", src: "/partners/generali.svg" },
];

function HeroTypeIcon({ src, alt, fallback }) {
  const [failedToLoad, setFailedToLoad] = useState(false);

  if (failedToLoad) {
    return <span className="home-hero-type-fallback" aria-hidden>{fallback}</span>;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={220}
      height={220}
      sizes="(min-width: 1024px) 178px, 100px"
      quality={100}
      className="home-hero-type-img"
      onError={() => setFailedToLoad(true)}
    />
  );
}

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTurnAnchoring, setIsTurnAnchoring] = useState(false);
  const [anchorSpacerPx, setAnchorSpacerPx] = useState(0);
  const [heroInsurerLoopWidth, setHeroInsurerLoopWidth] = useState(0);
  const [heroInsurerAnimationSeed, setHeroInsurerAnimationSeed] = useState(0);
  const threadRef = useRef(null);
  const homeMainRef = useRef(null);
  const heroInsurerGroupRef = useRef(null);
  const inputRef = useRef(null);
  const addButtonRef = useRef(null);
  const addMenuRef = useRef(null);
  const takePhotoInputRef = useRef(null);
  const addPhotosInputRef = useRef(null);
  const attachPdfInputRef = useRef(null);
  const scrollToUserMessageRef = useRef(false);
  const pendingScrollRef = useRef(null); // Store pending scroll ID in ref
  const anchorSpacerPxRef = useRef(0);
  const anchorStableCountRef = useRef(0);
  const anchorHoldUntilRef = useRef(0);
  const keepTurnAnchoredRef = useRef(false);
  const userInterruptedAnchoringRef = useRef(false);
  const lastRequestRef = useRef(null); // Store last request for retry
  const conversationStateRef = useRef(null); // Public server-state mirror for UI fallbacks only
  const generatedSessionRef = useRef(null);
  const processedPaymentsRef = useRef(new Set()); // Avoid duplicate payment success messages
  const searchParams = useSearchParams();
  if (!generatedSessionRef.current) {
    generatedSessionRef.current = createBrowserSessionId();
  }
  const sessionKey = searchParams.get("session") || generatedSessionRef.current;
  const paymentStatus = searchParams.get("payment");
  const params = useParams();
  const country = (params?.country || "my").toLowerCase();

  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (hasMessages) {
      setHeroInsurerLoopWidth(0);
      return undefined;
    }

    let cancelled = false;
    let resizeObserver = null;
    let firstFrame = 0;
    let secondFrame = 0;

    const updateLoopWidth = () => {
      if (cancelled) return;
      const group = heroInsurerGroupRef.current;
      if (!group) return;

      const nextWidth = group.getBoundingClientRect().width;
      if (nextWidth <= 0) return;

      setHeroInsurerLoopWidth((previousWidth) =>
        Math.abs(previousWidth - nextWidth) > 0.5 ? nextWidth : previousWidth
      );
    };

    const attachObserver = () => {
      const group = heroInsurerGroupRef.current;
      if (!group || typeof ResizeObserver === "undefined") return;

      resizeObserver = new ResizeObserver(updateLoopWidth);
      resizeObserver.observe(group);
    };

    setHeroInsurerAnimationSeed((seed) => seed + 1);

    firstFrame = requestAnimationFrame(() => {
      updateLoopWidth();
      attachObserver();
      secondFrame = requestAnimationFrame(updateLoopWidth);
    });

    return () => {
      cancelled = true;
      if (firstFrame) cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      resizeObserver?.disconnect();
    };
  }, [hasMessages, sessionKey]);

  const USER_MESSAGE_TOP_OFFSET = 4;
  const MAX_USER_ANCHOR_ATTEMPTS = 120;

  const stopTurnAnchoring = useCallback((clearSpacer = true) => {
    setIsTurnAnchoring(false);
    pendingScrollRef.current = null;
    scrollToUserMessageRef.current = false;
    anchorStableCountRef.current = 0;
    anchorHoldUntilRef.current = 0;
    if (clearSpacer) {
      keepTurnAnchoredRef.current = false;
    }
    if (clearSpacer) {
      setAnchorSpacerPx(0);
      anchorSpacerPxRef.current = 0;
    }
  }, []);

  const resetHomePosition = useCallback(() => {
    if (hasMessages) return;

    requestAnimationFrame(() => {
      if (homeMainRef.current) {
        homeMainRef.current.scrollTop = 0;
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [hasMessages]);

  // Check if user has scrolled up
  const handleScroll = useCallback(() => {
    if (!threadRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = threadRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  }, []);

  const interruptTurnAnchoring = useCallback(() => {
    if (!isStreaming || !pendingScrollRef.current) return;

    userInterruptedAnchoringRef.current = true;
    stopTurnAnchoring(false);
  }, [isStreaming, stopTurnAnchoring]);

  const handleWheel = useCallback((event) => {
    if (Math.abs(event.deltaY) < 1) return;
    interruptTurnAnchoring();
  }, [interruptTurnAnchoring]);

  const handleTouchMove = useCallback(() => {
    interruptTurnAnchoring();
  }, [interruptTurnAnchoring]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  // Execute the scroll to user message
  const executeScrollToUserMessage = useCallback((messageId) => {
    const container = threadRef.current;
    const userMessageEl = document.getElementById(`msg-${messageId}`);

    if (!container || !userMessageEl) return false;

    // Use rect delta relative to the actual scroll container (more reliable on mobile Safari).
    const containerRect = container.getBoundingClientRect();
    const messageRect = userMessageEl.getBoundingClientRect();
    const deltaToTarget = messageRect.top - containerRect.top - USER_MESSAGE_TOP_OFFSET;
    const targetScrollTop = Math.max(0, container.scrollTop + deltaToTarget);
    const spacerEl = container.querySelector(".chat-anchor-spacer");
    const currentSpacer = spacerEl
      ? spacerEl.getBoundingClientRect().height
      : anchorSpacerPxRef.current;
    const scrollHeightWithoutSpacer = Math.max(0, container.scrollHeight - currentSpacer);
    const maxScrollTopWithoutSpacer = scrollHeightWithoutSpacer - container.clientHeight;

    // Add only the temporary spacer still needed to make the latest user turn
    // reachable at the top. As the assistant response grows, this shrinks back.
    const neededExtra = Math.max(0, targetScrollTop - maxScrollTopWithoutSpacer);
    const desiredSpacer = Math.ceil(Math.min(neededExtra, container.clientHeight * 2.5));
    if (Math.abs(desiredSpacer - currentSpacer) > 2) {
      anchorSpacerPxRef.current = desiredSpacer;
      setAnchorSpacerPx(desiredSpacer);
    }

    const maxScrollTop = Math.max(
      0,
      scrollHeightWithoutSpacer + desiredSpacer - container.clientHeight
    );
    const boundedScrollTop = Math.min(maxScrollTop, targetScrollTop);

    if (Math.abs(container.scrollTop - boundedScrollTop) > 0.5) {
      container.scrollTop = boundedScrollTop;
    }
    setShowScrollButton(false);

    // Reached only when the user bubble is visually anchored near top.
    const topAfterScroll =
      userMessageEl.getBoundingClientRect().top - container.getBoundingClientRect().top;
    const reachedTop = Math.abs(topAfterScroll - USER_MESSAGE_TOP_OFFSET) <= 3;

    return reachedTop;
  }, [USER_MESSAGE_TOP_OFFSET]);

  // Watch for messages changes and execute pending scroll
  useEffect(() => {
    if (!pendingScrollRef.current) return;

    let cancelled = false;
    let timerId;
    scrollToUserMessageRef.current = true;

    const attemptScroll = (attempts = 0) => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (!pendingScrollRef.current) return;

        const success = executeScrollToUserMessage(pendingScrollRef.current);

        if (success) {
          anchorStableCountRef.current += 1;
        } else {
          anchorStableCountRef.current = 0;
        }

        const holdElapsed = Date.now() >= anchorHoldUntilRef.current;
        const stableEnough =
          success && holdElapsed && anchorStableCountRef.current >= 2;

        if (stableEnough) {
          if (!isStreaming) {
            stopTurnAnchoring(false);
            return;
          }

          // Keep re-aligning throughout the active turn so streamed content and
          // viewport changes cannot pull the latest user message down.
          timerId = setTimeout(() => attemptScroll(attempts + 1), 90);
          return;
        }

        // Keep nudging for the whole turn; release is handled in stream `finally`.
        const reachedAttemptLimit = !isStreaming && !success && attempts >= MAX_USER_ANCHOR_ATTEMPTS;
        if (reachedAttemptLimit) {
          stopTurnAnchoring(true);
          return;
        }

        timerId = setTimeout(() => attemptScroll(attempts + 1), isStreaming ? 60 : 50);
      });
    };

    attemptScroll();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [
    messages,
    isStreaming,
    executeScrollToUserMessage,
    MAX_USER_ANCHOR_ATTEMPTS,
    stopTurnAnchoring,
  ]);

  // Mobile viewport can resize when keyboard/browser chrome changes. Re-anchor current turn.
  useEffect(() => {
    if (!hasMessages) return;

    const handleViewportShift = () => {
      if (!pendingScrollRef.current) return;
      executeScrollToUserMessage(pendingScrollRef.current);
    };

    window.addEventListener("resize", handleViewportShift);
    window.addEventListener("orientationchange", handleViewportShift);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", handleViewportShift);
    viewport?.addEventListener("scroll", handleViewportShift);

    return () => {
      window.removeEventListener("resize", handleViewportShift);
      window.removeEventListener("orientationchange", handleViewportShift);
      viewport?.removeEventListener("resize", handleViewportShift);
      viewport?.removeEventListener("scroll", handleViewportShift);
    };
  }, [hasMessages, executeScrollToUserMessage]);

  // Auto-scroll during streaming to keep AI response visible
  // This effect is DISABLED while scrolling to user message
  useEffect(() => {
    // Skip if we're scrolling to user message
    if (scrollToUserMessageRef.current) return;
    // Keep user bubble pinned at top for anchored turns (ChatGPT-like behavior)
    if (keepTurnAnchoredRef.current) return;
    if (!threadRef.current || !isStreaming) return;

    const timeoutId = setTimeout(() => {
      if (scrollToUserMessageRef.current || !threadRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = threadRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;

      if (isNearBottom) {
        threadRef.current.scrollTo({
          top: threadRef.current.scrollHeight,
          behavior: "smooth",
        });
        setShowScrollButton(false);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [messages, isStreaming]);

  const triggerAttachmentPicker = useCallback((pickerType) => {
    setIsAddMenuOpen(false);

    if (pickerType === "camera") {
      takePhotoInputRef.current?.click();
      return;
    }
    if (pickerType === "photos") {
      addPhotosInputRef.current?.click();
      return;
    }
    if (pickerType === "pdf") {
      attachPdfInputRef.current?.click();
    }
  }, []);

  const handleAttachmentSelection = useCallback((event) => {
    // Picker is functional now; attachment transport can be wired to backend later.
    if (event.target.files?.length) {
      event.target.value = "";
    }
  }, []);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    // Check if user wants to restart/new chat
    const isRestartCommand = /^(restart|start over|new chat|mula semula|clear)$/i.test(text);
    if (isRestartCommand) {
      setInputText("");
      if (inputRef.current) inputRef.current.style.height = 'auto';
      clearChat();
      return;
    }

    // Check if user wants to retry
    const isRetryCommand = /^(retry|try again|cuba lagi)$/i.test(text);
    if (isRetryCommand && lastRequestRef.current) {
      setInputText("");
      if (inputRef.current) inputRef.current.style.height = 'auto';
      await handleRetry();
      return;
    }

    const userMessage = { id: createId(), role: "user", content: text };
    const history = [...messages, userMessage];
    const assistantId = createId();

    // Store request for potential retry
    lastRequestRef.current = { history, assistantId };

    // Set pending scroll BEFORE updating messages
    pendingScrollRef.current = userMessage.id;
    scrollToUserMessageRef.current = true;
    keepTurnAnchoredRef.current = true;
    userInterruptedAnchoringRef.current = false;
    setIsTurnAnchoring(true);
    anchorSpacerPxRef.current = 0;
    setAnchorSpacerPx(0);
    anchorStableCountRef.current = 0;
    anchorHoldUntilRef.current = Date.now() + 280;

    setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
    setInputText("");
    setError(null);
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';

    await streamReply(history, assistantId);
  };

  const handleRetry = async () => {
    if (!lastRequestRef.current || isStreaming) return;

    const { history } = lastRequestRef.current;
    const newAssistantId = createId();

    // Update the stored request with new assistant ID
    lastRequestRef.current.assistantId = newAssistantId;

    // Remove the last failed assistant message and add a new one
    setMessages((prev) => {
      const filtered = prev.filter((msg) => msg.role !== "assistant" || msg.content !== "");
      // Remove the last assistant message if it was an error
      const lastMsg = filtered[filtered.length - 1];
      if (lastMsg?.role === "assistant" && lastMsg.content.includes("try again")) {
        filtered.pop();
      }
      return [...filtered, { id: newAssistantId, role: "assistant", content: "" }];
    });

    setError(null);
    await streamReply(history, newAssistantId);
  };

  // Clear chat and start fresh
  const clearChat = () => {
    setMessages([]);
    setInputText("");
    setError(null);
    stopTurnAnchoring(true);
    userInterruptedAnchoringRef.current = false;
    conversationStateRef.current = null;
    localStorage.removeItem(`lajoo_chat_${sessionKey}`);
    void fetch("/api/chat/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionKey }),
    }).catch(() => {});
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  // Load saved conversation from the server session when needed.
  // Browser storage should not hold sensitive renewal state or full chat data.
  useEffect(() => {
    let cancelled = false;
    const pendingPaymentSuccess = localStorage.getItem("lajoo_payment_success");
    const navEntries = performance?.getEntriesByType?.("navigation");
    const navType = navEntries?.[0]?.type;
    const isHardLoad = navType === "navigate" || navType === "reload";
    const isPaymentReturn = paymentStatus === "success" || !!pendingPaymentSuccess;

    if (isHardLoad && !isPaymentReturn) {
      localStorage.removeItem(`lajoo_chat_${sessionKey}`);
      conversationStateRef.current = null;
      void fetch("/api/chat/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionKey }),
      }).catch(() => {});
      setMessages([]);
      setInputText("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      return undefined;
    }

    const restoreServerSession = async () => {
      try {
        const response = await fetch(`/api/chat/session?sessionId=${encodeURIComponent(sessionKey)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;

        conversationStateRef.current = data?.state || null;
        if (Array.isArray(data?.messages) && data.messages.length > 0) {
          const restoredMessages = data.messages.map((message) => ({
            id: createId(),
            role: message.role,
            content: message.content || "",
            summaryCard: message.summaryCard || null,
            addOnsCard: message.addOnsCard || null,
            roadTaxCard: message.roadTaxCard || null,
            paymentCard: message.paymentCard || null,
            paymentSuccessCard: message.paymentSuccessCard || null,
          }));
          setMessages(restoredMessages);
          return;
        }

        setMessages([]);
      } catch (e) {
        console.error('Error loading server chat session:', e);
      }
    };

    restoreServerSession();
    setInputText("");
    if (inputRef.current) inputRef.current.style.height = 'auto';

    return () => {
      cancelled = true;
    };
  }, [sessionKey, paymentStatus]);

  // Listen for payment success from payment tab via localStorage
  useEffect(() => {
    const formatMoney = (value) => {
      const n = Number(value);
      return Number.isFinite(n)
        ? n.toLocaleString("en-MY", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : "0.00";
    };

    const showPaymentSuccess = (data) => {
      if (!data || !data.paymentId) return;
      if (processedPaymentsRef.current.has(data.paymentId)) return;
      processedPaymentsRef.current.add(data.paymentId);

      const paymentSuccessCard = {
        paymentId: data.paymentId,
        total: Number(data.total || 0),
        icon: "/icons/payment-success-check.svg",
        documents: [
          {
            label: "Insurance Cover Note",
            href: `/documents/cover-note-${data.paymentId}.pdf`,
          },
          {
            label: "Insurance Policy",
            href: `/documents/policy-${data.paymentId}.pdf`,
          },
          ...(Number(data.roadtax) > 0
            ? [{
                label: "Road Tax Receipt",
                href: `/documents/roadtax-${data.paymentId}.pdf`,
              }]
            : []),
        ],
      };

      setMessages(prev => {
        const alreadyShown = prev.some(
          (msg) => msg.role === "assistant" && msg.paymentSuccessCard?.paymentId === data.paymentId
        );
        if (alreadyShown) return prev;

        const paymentMessageIndex = [...prev]
          .map((msg, index) => ({ msg, index }))
          .reverse()
          .find(({ msg }) => (
            msg.role === "assistant" &&
            (
              msg.paymentCard ||
              /step\s+(?:\*{0,2})?6(?:\*{0,2})?\s+of\s+(?:\*{0,2})?6(?:\*{0,2})?\s*[—-]\s*payment/i.test(msg.content || "") ||
              /\/payment\/[^)\s]+/i.test(msg.content || "")
            )
          ))?.index;

        if (paymentMessageIndex !== undefined) {
          return prev.map((msg, index) => (
            index === paymentMessageIndex
              ? {
                  ...msg,
                  paymentSuccessCard,
                }
              : msg
          ));
        }

        return [
          ...prev,
          {
            id: createId(),
            role: "assistant",
            content: `Payment Successful\n\nPaid RM ${formatMoney(data.total)}\nReference ${data.paymentId}\nStatus Completed`,
            paymentSuccessCard,
          },
        ];
      });

      // Scroll to the updated paid section after payment status returns.
      setTimeout(() => {
        if (threadRef.current) {
          threadRef.current.scrollTo({
            top: threadRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      }, 100);
    };

    const consumePaymentSuccess = (raw) => {
      if (!raw) return false;
      try {
        const paymentData = JSON.parse(raw);
        if (paymentData?.type === "PAYMENT_SUCCESS" && paymentData?.data) {
          showPaymentSuccess(paymentData.data);
          return true;
        }
      } catch (e) {
        console.error("Error parsing payment success data:", e);
      }
      return false;
    };

    const processStoredPaymentSuccess = () => {
      const stored = localStorage.getItem("lajoo_payment_success");
      if (!stored) return;
      consumePaymentSuccess(stored);
      localStorage.removeItem("lajoo_payment_success");
    };

    // Listen for localStorage changes (from payment tab)
    const handleStorageChange = (event) => {
      if (event.key === 'lajoo_payment_success' && event.newValue) {
        consumePaymentSuccess(event.newValue);
        localStorage.removeItem("lajoo_payment_success");
      }
    };

    // Also check on focus (in case the user returns later).
    const handleFocus = () => {
      processStoredPaymentSuccess();
    };

    // Catch success key on initial mount as well.
    processStoredPaymentSuccess();

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const streamReply = async (history, assistantId) => {
    setIsStreaming(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionKey,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!response.ok || !response.body) throw new Error("Our chat service is unavailable right now.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let shouldStopStream = false;

      const handleSseEvent = (eventText) => {
        if (!eventText || !eventText.startsWith("data:")) return;
        const payload = eventText.slice(5).trim();
        if (!payload || payload === "[DONE]") return;

        let data = null;
        try {
          data = JSON.parse(payload);
        } catch {
          // Ignore malformed payloads instead of crashing the chat stream.
          return;
        }

        if (data.type === "chunk" && data.content) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, content: msg.content + data.content } : msg
            )
          );
        } else if (data.type === "error") {
          const rawError = data.message || "Something went wrong.";
          const userMessage = /OPENAI_API_KEY/i.test(rawError)
            ? "LAJOO is not configured yet. Please set a valid OPENAI API key and restart your app."
            : rawError;
          setError(rawError);
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: userMessage } : msg))
          );
          shouldStopStream = true;
        } else if (data.type === "done" && data.reply) {
          // Clean any remaining markers from the response
          const cleanedReply = data.reply
            .replace(/\[SHOW_QUOTES\]/g, "")
            .replace(/\[SHOW_ADDONS\]/g, "")
            .replace(/\[SHOW_ROADTAX\]/g, "")
            .replace(/\[SHOW_PERSONAL_FORM\]/g, "")
            .replace(/\[SHOW_OTP\]/g, "")
            .replace(/\[SHOW_PAYMENT\]/g, "")
            .replace(/\[SHOW_SUCCESS\]/g, "")
            .trim();

          setMessages((prev) =>
            prev.map((msg) => (
              msg.id === assistantId
                ? {
                    ...msg,
                    content: cleanedReply,
                    summaryCard: data.summaryCard || null,
                    addOnsCard: data.addOnsCard || null,
                    roadTaxCard: data.roadTaxCard || null,
                    paymentCard: data.paymentCard || null,
                  }
                : msg
            ))
          );

          // Keep a public server-state mirror only for UI fallback rendering.
          if (data.state) {
            conversationStateRef.current = data.state;
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        sseBuffer += decoder.decode(value, { stream: true });
        const completeEvents = sseBuffer.split("\n\n");
        sseBuffer = completeEvents.pop() || "";
        completeEvents.filter(Boolean).forEach(handleSseEvent);
        if (shouldStopStream) break;
      }

      // Flush any decoder remainder and process any final complete SSE event.
      if (!shouldStopStream) {
        sseBuffer += decoder.decode();
        const finalEvents = sseBuffer.split("\n\n").filter(Boolean);
        finalEvents.forEach(handleSseEvent);
      }
    } catch (err) {
      console.error(err);
      const rawError = err.message || "Unable to reach LAJOO.";
      const userMessage = /OPENAI_API_KEY/i.test(rawError)
        ? "LAJOO is not configured yet. Please set a valid OPENAI API key and restart your app."
        : "Sorry, I could not reach our insurer partner. Please try again.";
      setError(rawError);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: userMessage }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
      requestAnimationFrame(() => {
        const messageId = pendingScrollRef.current;

        if (!messageId) {
          stopTurnAnchoring(userInterruptedAnchoringRef.current);
          userInterruptedAnchoringRef.current = false;
          return;
        }

        // Final alignment pass once the stream is complete.
        const aligned = executeScrollToUserMessage(messageId);
        if (aligned) {
          // Release the lock but keep only the spacer still required for the
          // latest user turn to remain anchored near the top.
          stopTurnAnchoring(false);
          userInterruptedAnchoringRef.current = false;
          return;
        }

        requestAnimationFrame(() => {
          if (pendingScrollRef.current) {
            executeScrollToUserMessage(pendingScrollRef.current);
          }
          stopTurnAnchoring(false);
          userInterruptedAnchoringRef.current = false;
        });
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickStart = (text) => {
    if (isStreaming) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage = { id: createId(), role: "user", content: trimmed };
    const history = [...messages, userMessage];
    const assistantId = createId();

    // Set pending scroll BEFORE updating messages
    pendingScrollRef.current = userMessage.id;
    scrollToUserMessageRef.current = true;
    keepTurnAnchoredRef.current = true;
    userInterruptedAnchoringRef.current = false;
    setIsTurnAnchoring(true);
    anchorSpacerPxRef.current = 0;
    setAnchorSpacerPx(0);
    anchorStableCountRef.current = 0;
    anchorHoldUntilRef.current = Date.now() + 280;

    setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
    setInputText("");
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';
    streamReply(history, assistantId);
  };

  const handleQuoteCardSelect = (quote) => {
    const selectionText = quote?.selectionText || quote?.insurer || "";
    if (!selectionText.trim()) return;
    handleQuickStart(selectionText);
  };

  const handleAddOnsConfirm = ({ selectedIds = [], options = [], windscreenCoverage = 0, commitMode }) => {
    if (!selectedIds.length) return;
    const resolvedCommitMode = commitMode || getAddOnsCommitMode(conversationStateRef.current?.step);
    const selectedLabels = options
      .filter((option) => selectedIds.includes(option.id))
      .map((option) => {
        if (option.hasCoverageInput) {
          return windscreenCoverage > 0
            ? `Windscreen coverage RM ${formatQuoteMoney(windscreenCoverage)}`
            : "Windscreen";
        }
        return option.name;
      });

    if (selectedLabels.length > 0) {
      handleQuickStart(formatAddOnsUserReply(selectedLabels, { commitMode: resolvedCommitMode }));
    }
  };

  const handleAddOnsSkip = ({ commitMode } = {}) => {
    const resolvedCommitMode = commitMode || getAddOnsCommitMode(conversationStateRef.current?.step);
    handleQuickStart(formatAddOnsSkipReply(resolvedCommitMode));
  };

  const handleRoadTaxSelect = (option) => {
    if (!option?.available || !option.message) return;
    handleQuickStart(option.message);
  };

  const markdownComponents = {
    a: ({ href, children, node, ...anchorProps }) => {
      const isMailtoLink = typeof href === "string" && /^mailto:/i.test(href);
      if (isMailtoLink) {
        return <span className={anchorProps.className}>{children}</span>;
      }
      // Open payment links in new tab
      const isPaymentLink = href && href.includes('/payment/');
      const isDocumentPdfLink = typeof href === "string" && /\/documents\/.+\.pdf(?:\?.*)?$/i.test(href);
      const isContactSupportLink = typeof href === "string" && /\/contact-us\/?(?:[?#].*)?$/i.test(href);
      const shouldOpenNewTab =
        isPaymentLink || isDocumentPdfLink || isContactSupportLink || anchorProps.target === "_blank";
      const shouldDownload = isDocumentPdfLink || anchorProps.download !== undefined;
      const hrefWithSession =
        isPaymentLink && href && !/[?&]session=/.test(href)
          ? `${href}${href.includes("?") ? "&" : "?"}session=${encodeURIComponent(sessionKey)}`
          : href;
      const paymentButtonStyle = isPaymentLink
        ? {
            display: "inline-block",
            background: "#0062ff",
            color: "#ffffff",
            textDecoration: "none",
            padding: "10px 18px",
            borderRadius: "999px",
            fontSize: "1.05em",
            fontWeight: 700,
            lineHeight: 1.2,
          }
        : undefined;
      const mergedClassName = [
        anchorProps.className,
        isPaymentLink ? "payment-cta" : null,
      ].filter(Boolean).join(" ");
      return (
        <a
          {...anchorProps}
          className={mergedClassName || undefined}
          href={hrefWithSession}
          target={shouldOpenNewTab ? "_blank" : (anchorProps.target || "_self")}
          rel={shouldOpenNewTab ? (anchorProps.rel || "noopener noreferrer") : anchorProps.rel}
          download={shouldDownload ? (typeof anchorProps.download === "string" ? anchorProps.download : "") : undefined}
          style={paymentButtonStyle || anchorProps.style}
        >
          {children}
        </a>
      );
    },
    p: ({ children, className }) => {
      const text = flattenNodeText(children).trim();
      if (isStepIndicator(text)) {
        const parsed = parseStepIndicator(text);
        if (parsed) {
          return (
            <p className="chat-step-indicator">
              {parsed.step && parsed.total ? (
                <span className="chat-step-count">Step {parsed.step} of {parsed.total}</span>
              ) : null}
              {parsed.step && parsed.total ? (
                <span className="chat-step-separator" aria-hidden="true"> · </span>
              ) : null}
              <span className="chat-step-title">{parsed.title}</span>
            </p>
          );
        }
        return <p className="chat-step-indicator">{children}</p>;
      }
      if (isSummaryTitleLine(text)) {
        return <p className="summary-title">{children}</p>;
      }
      if (isSummaryDividerLine(text)) {
        return <p className="summary-divider">{children}</p>;
      }
      if (isSummaryTotalLine(text)) {
        return <p className="summary-total">{children}</p>;
      }
      return <p className={className}>{children}</p>;
    },
  };

  useEffect(() => {
    if (!hasMessages) {
      resetHomePosition();
    }
  }, [hasMessages, resetHomePosition]);

  useEffect(() => {
    const bodyClass = "home-route";
    document.body.classList.add(bodyClass);
    return () => {
      document.body.classList.remove(bodyClass);
    };
  }, []);

  useEffect(() => {
    if (!isAddMenuOpen) return;

    const handleOutsidePress = (event) => {
      const target = event.target;
      if (addMenuRef.current?.contains(target) || addButtonRef.current?.contains(target)) {
        return;
      }
      setIsAddMenuOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsAddMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handleOutsidePress);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handleOutsidePress);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isAddMenuOpen]);

  const latestAssistantMessage = hasMessages
    ? [...messages].reverse().find((message) => message?.role === "assistant")
    : null;
  const shouldTightenTerminalPaymentSpacing = Boolean(
    latestAssistantMessage?.paymentCard ||
    latestAssistantMessage?.paymentSuccessCard ||
    /step\s+(?:\*{0,2})?6(?:\*{0,2})?\s+of\s+(?:\*{0,2})?6(?:\*{0,2})?\s*[—-]\s*payment/i.test(latestAssistantMessage?.content || "") ||
    /\/payment\//i.test(latestAssistantMessage?.content || "")
  );
  const chatFeedClassName = [
    "chat-feed",
    isTurnAnchoring ? "chat-feed-anchor-turn" : null,
    shouldTightenTerminalPaymentSpacing ? "chat-feed-terminal-payment" : null,
  ].filter(Boolean).join(" ");

  return (
    <>
      <Head>
        <title>Renew Insurance In Minutes With LAJOO</title>
      </Head>
      <div className={`home-page-shell ${hasMessages ? "is-chatting" : "is-home"}`}>
        <main ref={homeMainRef} className={`hero home-main ${hasMessages ? "hero-chatting" : ""}`}>
          {!hasMessages && (
            <div className="hero-content home-hero">
              <EqualWidthTitle
                className="home-hero-title"
                lineClassName="home-hero-title-line"
                secondaryLineClassName="home-hero-title-line-second"
                primaryText="Renew insurance"
                secondaryText="in one simple AI chat."
              />

              <div className="home-hero-types" role="group" aria-label="Insurance type">
                <div className="home-hero-type-option">
                  <HeroTypeIcon
                    src="/images/home-car-insurance.png"
                    alt="Car insurance"
                    fallback="🚗"
                  />
                  <button
                    type="button"
                    className="home-hero-type-chip"
                    onClick={() => handleQuickStart("Renew car insurance")}
                  >
                    Car Insurance
                  </button>
                </div>

                <div className="home-hero-type-option">
                  <HeroTypeIcon
                    src="/images/home-motor-insurance-cropped.png"
                    alt="Motor insurance"
                    fallback="🛵"
                  />
                  <button
                    type="button"
                    className="home-hero-type-chip"
                    onClick={() => handleQuickStart("Renew motor insurance")}
                  >
                    Motor Insurance
                  </button>
                </div>
              </div>

              <div className="home-hero-insurers" aria-label="Trusted insurers">
                <div
                  key={`home-hero-insurers-track-${heroInsurerAnimationSeed}-${Math.round(heroInsurerLoopWidth)}`}
                  className={`home-hero-insurers-track${heroInsurerLoopWidth ? " is-ready" : ""}`}
                  style={
                    heroInsurerLoopWidth
                      ? { "--home-hero-insurers-loop-width": `${heroInsurerLoopWidth}px` }
                      : undefined
                  }
                >
                  {Array.from({ length: 3 }).map((_, groupIdx) => (
                    <div
                      key={`insurer-group-${groupIdx}`}
                      className="home-hero-insurers-group"
                      aria-hidden={groupIdx > 0}
                      ref={groupIdx === 0 ? heroInsurerGroupRef : undefined}
                    >
                      {HERO_INSURER_LOGOS.map((insurer) => (
                        <span
                          key={`${groupIdx}-${insurer.id}`}
                          className="home-hero-insurer-logo-wrap"
                          data-insurer={insurer.id}
                        >
                          <Image
                            src={insurer.src}
                            alt={insurer.name}
                            width={132}
                            height={42}
                            className="home-hero-insurer-logo"
                          />
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {hasMessages && (
            <div
              className="chat-container"
              ref={threadRef}
              onScroll={handleScroll}
              onWheel={handleWheel}
              onTouchMove={handleTouchMove}
            >
              <div className={chatFeedClassName}>
                {messages.map((msg, messageIndex) => {
                  // Clean markers from displayed content
                  const cleanedContent = (msg.content || "")
                    .replace(/\[SHOW_QUOTES\]/g, "")
                    .replace(/\[SHOW_ADDONS\]/g, "")
                    .replace(/\[SHOW_ROADTAX\]/g, "")
                    .replace(/\[SHOW_PERSONAL_FORM\]/g, "")
                    .replace(/\[SHOW_OTP\]/g, "")
                    .replace(/\[SHOW_PAYMENT\]/g, "")
                    .replace(/\[SHOW_SUCCESS\]/g, "")
                    .replace(/Found your vehicle!\s*🚗/g, "Found your vehicle!")
                    .replace(/<span style="display:block;font-size:18px;font-weight:800">([^<]+)<\/span>/g, '<span style="display:block;font-size:18px;font-weight:800;color:#000000">$1</span>')
                    .replace(/<span style="display:block;font-size:18px;font-weight:800;color:#0062ff">([^<]+)<\/span>/g, '<span style="display:block;font-size:18px;font-weight:800;color:#000000">$1</span>')
                    .replace(/<span style="display:block;font-weight:400">(20\d{2} [^<]+\(Auto-[^<]+\))<\/span>/g, '<span style="display:block;font-weight:700">$1</span>')
                    .replace(/<span style="display:block;font-weight:400">(Policy Effective :|Policy Period :|Market Value :|Owner IC :|Coverage Type:|No Claim Discount \(NCD\):) ([^<]+)<\/span>/g, '<span style="display:block;font-weight:400"><strong>$1</strong> $2</span>')
                    .replace(/<strong>Policy Effective :<\/strong>/g, '<strong>Policy Period :</strong>')
                    .replace(/<span style="display:block;height:0;border-top:1px solid #e5e7eb;margin:10px 0 9px"><\/span>/g, '<span style="display:block;height:0;width:350px;max-width:100%;border-top:1px solid #e5e7eb;margin:5px 0 7px"></span>')
                    .replace(/<br\s*\/?>\s*(?=<span style="display:block;font-weight:400"><strong>Policy (?:Effective|Period) :<\/strong>)/g, '<span style="display:block;height:0;width:350px;max-width:100%;border-top:1px solid #e5e7eb;margin:5px 0 7px"></span>\n')
                    .replace(/(\d{6}-\d{2}-)\*{4}/g, "$1&bull;&bull;&bull;&bull;")
                    .trim();
                  const quotePresentation =
                    msg.role === "assistant"
                      ? parseAssistantQuotePresentation(cleanedContent)
                      : null;
                  const summaryPresentation =
                    msg.role === "assistant"
                      ? parseAssistantSummaryPresentation(cleanedContent, msg.summaryCard)
                      : null;
                  const addOnsPresentation =
                    msg.role === "assistant"
                      ? parseAssistantAddOnsPresentation(cleanedContent, msg.addOnsCard)
                      : null;
                  const roadTaxPresentation =
                    msg.role === "assistant"
                      ? parseAssistantRoadTaxPresentation(
                          cleanedContent,
                          msg.roadTaxCard || buildRoadTaxCardFallback(conversationStateRef.current)
                        )
                      : null;
                  const paymentPresentation =
                    msg.role === "assistant"
                      ? parseAssistantPaymentPresentation(cleanedContent, msg.paymentCard)
                      : null;

                  return (
                    <div key={msg.id} id={`msg-${msg.id}`} className={`chat-row ${msg.role}`}>
                      <div className="chat-content">
                        {msg.paymentSuccessCard && !summaryPresentation && !paymentPresentation ? (
                          <AssistantPaymentSuccessCard paymentSuccessCard={msg.paymentSuccessCard} />
                        ) : quotePresentation ? (
                          <>
                            {quotePresentation.before && (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                components={markdownComponents}
                              >
                                {quotePresentation.before}
                              </ReactMarkdown>
                            )}
                            <AssistantQuoteCards
                              quotes={quotePresentation.quotes}
                              onSelectQuote={isStreaming ? undefined : handleQuoteCardSelect}
                            />
                            {quotePresentation.after && (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                components={markdownComponents}
                              >
                                {quotePresentation.after}
                              </ReactMarkdown>
                            )}
                          </>
                        ) : summaryPresentation ? (
                          <>
                            {summaryPresentation.before && (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                components={markdownComponents}
                              >
                                {summaryPresentation.before}
                              </ReactMarkdown>
                            )}
                            <AssistantSummaryCard
                              summary={withSummaryDisplayState(summaryPresentation.summary, summaryPresentation.after)}
                            />
                            {(() => {
                              const nestedAddOnsPresentation = parseAssistantAddOnsPresentation(
                                summaryPresentation.after,
                                msg.addOnsCard
                              );
                              const nestedRoadTaxPresentation = parseAssistantRoadTaxPresentation(
                                summaryPresentation.after,
                                msg.roadTaxCard || buildRoadTaxCardFallback(conversationStateRef.current)
                              );
                              const nestedPaymentPresentation = parseAssistantPaymentPresentation(
                                summaryPresentation.after,
                                msg.paymentCard
                              );
                              if (nestedAddOnsPresentation) {
                                const selectedAddOnState = getSelectedAddOnDisplayState(
                                  messages,
                                  messageIndex,
                                  nestedAddOnsPresentation.addOns
                                );
                                return (
                                  <>
                                    {nestedAddOnsPresentation.before && (
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                        components={markdownComponents}
                                      >
                                        {nestedAddOnsPresentation.before}
                                      </ReactMarkdown>
                                    )}
                                    <AssistantAddOnsSelector
                                      addOnsCard={nestedAddOnsPresentation.addOns}
                                      onConfirm={isStreaming ? undefined : handleAddOnsConfirm}
                                      onSkip={isStreaming ? undefined : handleAddOnsSkip}
                                      selectedOptionIds={selectedAddOnState?.ids ?? null}
                                      selectedWindscreenCoverage={selectedAddOnState?.windscreenCoverage ?? null}
                                      commitMode={getAddOnsCommitMode(conversationStateRef.current?.step)}
                                    />
                                    {nestedAddOnsPresentation.after && (
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                        components={markdownComponents}
                                      >
                                        {nestedAddOnsPresentation.after}
                                      </ReactMarkdown>
                                    )}
                                  </>
                                );
                              }

                              if (nestedRoadTaxPresentation) {
                                return (
                                  <>
                                    {nestedRoadTaxPresentation.before && (
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                        components={markdownComponents}
                                      >
                                        {nestedRoadTaxPresentation.before}
                                      </ReactMarkdown>
                                    )}
                                    <ChatStepIndicator stage="road tax" />
                                    <AssistantRoadTaxSelector
                                      roadTaxCard={nestedRoadTaxPresentation.roadTax}
                                      onSelect={isStreaming ? undefined : handleRoadTaxSelect}
                                      selectedOptionId={getSelectedRoadTaxOptionId(
                                        messages,
                                        messageIndex,
                                        nestedRoadTaxPresentation.roadTax,
                                        conversationStateRef.current
                                      )}
                                    />
                                    {nestedRoadTaxPresentation.after && (
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                        components={markdownComponents}
                                      >
                                        {nestedRoadTaxPresentation.after}
                                      </ReactMarkdown>
                                    )}
                                  </>
                                );
                              }

                              if (nestedPaymentPresentation) {
                                return (
                                  <>
                                    {nestedPaymentPresentation.before && (
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                        components={markdownComponents}
                                      >
                                        {nestedPaymentPresentation.before}
                                      </ReactMarkdown>
                                    )}
                                    {msg.paymentSuccessCard ? (
                                      <AssistantPaymentSuccessCard paymentSuccessCard={msg.paymentSuccessCard} />
                                    ) : (
                                      <AssistantPaymentCard
                                        paymentCard={nestedPaymentPresentation.payment}
                                        sessionKey={sessionKey}
                                      />
                                    )}
                                    {nestedPaymentPresentation.after && (
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                        components={markdownComponents}
                                      >
                                        {nestedPaymentPresentation.after}
                                      </ReactMarkdown>
                                    )}
                                  </>
                                );
                              }

                              return summaryPresentation.after ? (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                  components={markdownComponents}
                                >
                                  {summaryPresentation.after}
                                </ReactMarkdown>
                              ) : null;
                            })()}
                          </>
                        ) : addOnsPresentation ? (
                          (() => {
                            const selectedAddOnState = getSelectedAddOnDisplayState(
                              messages,
                              messageIndex,
                              addOnsPresentation.addOns
                            );
                            return (
                              <>
                                {addOnsPresentation.before && (
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                    components={markdownComponents}
                                  >
                                    {addOnsPresentation.before}
                                  </ReactMarkdown>
                                )}
                                <AssistantAddOnsSelector
                                  addOnsCard={addOnsPresentation.addOns}
                                  onConfirm={isStreaming ? undefined : handleAddOnsConfirm}
                                  onSkip={isStreaming ? undefined : handleAddOnsSkip}
                                  selectedOptionIds={selectedAddOnState?.ids ?? null}
                                  selectedWindscreenCoverage={selectedAddOnState?.windscreenCoverage ?? null}
                                  commitMode={getAddOnsCommitMode(conversationStateRef.current?.step)}
                                />
                                {addOnsPresentation.after && (
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                    components={markdownComponents}
                                  >
                                    {addOnsPresentation.after}
                                  </ReactMarkdown>
                                )}
                              </>
                            );
                          })()
                        ) : roadTaxPresentation ? (
                          <>
                            {roadTaxPresentation.before && (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                components={markdownComponents}
                              >
                                {roadTaxPresentation.before}
                              </ReactMarkdown>
                            )}
                            <ChatStepIndicator stage="road tax" />
                            <AssistantRoadTaxSelector
                              roadTaxCard={roadTaxPresentation.roadTax}
                              onSelect={isStreaming ? undefined : handleRoadTaxSelect}
                              selectedOptionId={getSelectedRoadTaxOptionId(
                                messages,
                                messageIndex,
                                roadTaxPresentation.roadTax,
                                conversationStateRef.current
                              )}
                            />
                            {roadTaxPresentation.after && (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                components={markdownComponents}
                              >
                                {roadTaxPresentation.after}
                              </ReactMarkdown>
                            )}
                          </>
                        ) : paymentPresentation ? (
                          <>
                            {paymentPresentation.before && (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                components={markdownComponents}
                              >
                                {paymentPresentation.before}
                              </ReactMarkdown>
                            )}
                            {msg.paymentSuccessCard ? (
                              <AssistantPaymentSuccessCard paymentSuccessCard={msg.paymentSuccessCard} />
                            ) : (
                              <AssistantPaymentCard
                                paymentCard={paymentPresentation.payment}
                                sessionKey={sessionKey}
                              />
                            )}
                            {paymentPresentation.after && (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                                components={markdownComponents}
                              >
                                {paymentPresentation.after}
                              </ReactMarkdown>
                            )}
                          </>
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                            components={markdownComponents}
                          >
                            {cleanedContent}
                          </ReactMarkdown>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isStreaming && (
                  <div className="chat-row assistant typing">
                    <div className="chat-content">
                      <span className="dot" />
                    </div>
                  </div>
                )}

                {anchorSpacerPx > 0 && !shouldTightenTerminalPaymentSpacing && (
                  <div
                    className="chat-anchor-spacer"
                    style={{ height: `${anchorSpacerPx}px` }}
                    aria-hidden
                  />
                )}
              </div>
            </div>
          )}
        </main>

        {/* Scroll to bottom button */}
        {hasMessages && showScrollButton && (
          <button
            className="scroll-to-bottom"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </button>
        )}

        {error && (
          <div className="chat-status">
            <p className="chat-error">Something went wrong. Would you like me to try again?</p>
            <button className="retry-button" onClick={handleRetry} disabled={isStreaming}>
              Try Again
            </button>
          </div>
        )}

        <div className="chat-input-wrapper">
          <div className="chat-box">
            <div className="chat-column">
              <div className="bubble">
                <div className="add-button-slot">
                  <button
                    ref={addButtonRef}
                    className="add-button"
                    aria-label="Add attachments"
                    aria-haspopup="menu"
                    aria-controls="chat-add-menu"
                    aria-expanded={isAddMenuOpen}
                    onClick={() => setIsAddMenuOpen((open) => !open)}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {isAddMenuOpen && (
                    <div id="chat-add-menu" className="chat-add-menu" role="menu" ref={addMenuRef}>
                      <button type="button" className="chat-add-menu-item" role="menuitem" onClick={() => triggerAttachmentPicker("camera")}>
                        <svg className="chat-add-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M4 8.5h16a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.9" />
                          <path d="M8.2 8.5 9.5 6h5l1.3 2.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                          <circle cx="12" cy="14.2" r="3.3" stroke="currentColor" strokeWidth="1.9" />
                        </svg>
                        <span>Take photo</span>
                      </button>

                      <button type="button" className="chat-add-menu-item" role="menuitem" onClick={() => triggerAttachmentPicker("photos")}>
                        <svg className="chat-add-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M7.5 11.5V8.8a4.5 4.5 0 0 1 9 0v6.7a5.5 5.5 0 1 1-11 0V7.8a3.5 3.5 0 0 1 7 0v7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        </svg>
                        <span>Add photos</span>
                      </button>

                      <hr className="chat-add-menu-divider" />

                      <button type="button" className="chat-add-menu-item" role="menuitem" onClick={() => triggerAttachmentPicker("pdf")}>
                        <svg className="chat-add-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                          <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                          <path d="M8.7 16.2h2.4M8.7 18.4h5.4M8.7 14h6.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </svg>
                        <span>Attach PDF</span>
                      </button>
                    </div>
                  )}

                  <input
                    ref={takePhotoInputRef}
                    className="chat-hidden-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleAttachmentSelection}
                  />
                  <input
                    ref={addPhotosInputRef}
                    className="chat-hidden-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAttachmentSelection}
                  />
                  <input
                    ref={attachPdfInputRef}
                    className="chat-hidden-input"
                    type="file"
                    accept="application/pdf"
                    onChange={handleAttachmentSelection}
                  />
                </div>

                <textarea
                  ref={inputRef}
                  className="input-area"
                  aria-label="Chat with LAJOO"
                  placeholder="Renew or ask anything"
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    // Auto-resize textarea
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  onKeyDown={handleKeyDown}
                  onBlur={() => {
                    if (!hasMessages) {
                      setTimeout(() => {
                        resetHomePosition();
                      }, 80);
                    }
                  }}
                  rows={1}
                />

                <button
                  type="button"
                  className="send-button"
                  onClick={handleSend}
                  disabled={!inputText.trim() || isStreaming}
                  aria-label="Send message"
                >
                  <svg className="send-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="terms-privacy">
              <p>
                By messaging LAJOO, you agree to our{" "}
                <Link href={`/${country}/terms`} className="terms-link">
                  Terms &amp; Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
