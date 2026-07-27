const EMPTY_MASK = "Masked";

function asText(value) {
  return String(value ?? "").trim();
}

export function maskAdminEmail(value) {
  const email = asText(value);
  if (!email || !email.includes("@")) return EMPTY_MASK;
  const [local, domain = ""] = email.split("@");
  const [domainName = "", ...domainParts] = domain.split(".");
  const suffix = domainParts.length ? `.${domainParts.at(-1)}` : "";
  const localPrefix = local.slice(0, 1) || "*";
  const domainPrefix = domainName.slice(0, 1) || "*";
  return `${localPrefix}***@${domainPrefix}***${suffix}`;
}

export function maskAdminPhone(value) {
  const phone = asText(value);
  if (!phone) return EMPTY_MASK;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `+${digits.slice(0, 2)} ** *** **${digits.slice(-2)}`;
}

export function maskAdminIc(value) {
  const ic = asText(value);
  if (!ic) return EMPTY_MASK;
  const digits = ic.replace(/\D/g, "");
  if (digits.length < 4) return "******-**-****";
  return `******-**-${digits.slice(-4)}`;
}

export function maskAdminAddress(value) {
  const address = asText(value);
  if (!address) return EMPTY_MASK;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const region = parts.at(-1) || "Malaysia";
  return `Address masked, ${region}`;
}

export function maskSensitiveAdminValue(value, type = "text") {
  if (type === "email") return maskAdminEmail(value);
  if (type === "phone") return maskAdminPhone(value);
  if (type === "ic") return maskAdminIc(value);
  if (type === "address") return maskAdminAddress(value);
  return asText(value) ? "[masked]" : EMPTY_MASK;
}

export function maskAdminRecord(record = {}, fieldTypes = {}) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key,
    fieldTypes[key] ? maskSensitiveAdminValue(value, fieldTypes[key]) : value,
  ]));
}

export function formatPermissionLabel(permission = "") {
  return String(permission).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
