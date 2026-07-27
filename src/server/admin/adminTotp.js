import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const ENCRYPTION_PREFIX = "aes-256-gcm:v1";

function getMfaEncryptionKeyMaterial() {
  return process.env.LAJOO_ADMIN_MFA_SECRET ||
    process.env.LAJOO_ADMIN_SESSION_SECRET ||
    process.env.LAJOO_ADMIN_PASSWORD ||
    "";
}

function getMfaEncryptionKey() {
  const material = getMfaEncryptionKeyMaterial();
  if (!material) {
    const error = new Error("Admin MFA encryption secret is not configured.");
    error.status = 503;
    throw error;
  }
  return createHash("sha256").update(material).digest();
}

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(secret) {
  const clean = String(secret || "").replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      const error = new Error("Invalid TOTP secret.");
      error.status = 400;
      throw error;
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function generateTotpCode(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / TOTP_STEP_SECONDS);
  return hotp(secret, counter);
}

export function verifyTotpCode(secret, code, timestamp = Date.now(), window = 1) {
  const cleanCode = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleanCode)) return false;
  const counter = Math.floor(timestamp / 1000 / TOTP_STEP_SECONDS);
  for (let drift = -window; drift <= window; drift += 1) {
    if (hotp(secret, counter + drift) === cleanCode) return true;
  }
  return false;
}

export function encryptTotpSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getMfaEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptTotpSecret(encryptedSecret) {
  const [algorithm, version, iv, tag, ciphertext] = String(encryptedSecret || "").split(":");
  if (`${algorithm}:${version}` !== ENCRYPTION_PREFIX || !iv || !tag || !ciphertext) {
    const error = new Error("Invalid encrypted TOTP secret.");
    error.status = 400;
    throw error;
  }

  const decipher = createDecipheriv("aes-256-gcm", getMfaEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function buildTotpUri({ secret, email, issuer = "LAJOO Admin" }) {
  const label = `${issuer}:${String(email || "admin").trim()}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export async function buildTotpQrCodeDataUrl(otpauthUrl) {
  const qrcode = await import("qrcode");
  const toDataURL = qrcode.toDataURL || qrcode.default?.toDataURL;
  if (typeof toDataURL !== "function") {
    const error = new Error("TOTP QR generator is unavailable.");
    error.status = 503;
    throw error;
  }
  return toDataURL(String(otpauthUrl || ""), {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 5,
    type: "image/png",
  });
}
