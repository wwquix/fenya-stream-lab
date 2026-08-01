import { Buffer } from "node:buffer";

const HEX_KEY_PATTERN = /^[a-f\d]{64}$/i;
const STANDARD_BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const URL_SAFE_BASE64_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

export function decodeTokenEncryptionKey(value) {
  const configured = typeof value === "string" ? value.trim() : "";
  if (HEX_KEY_PATTERN.test(configured)) return Buffer.from(configured, "hex");

  const encoding = STANDARD_BASE64_PATTERN.test(configured)
    ? "base64"
    : URL_SAFE_BASE64_PATTERN.test(configured)
    ? "base64url"
    : null;
  if (!encoding || configured.length % 4 === 1) return null;

  const key = Buffer.from(configured, encoding);
  const supplied = configured.replace(/=+$/, "");
  const canonical = key.toString(encoding).replace(/=+$/, "");
  return key.length === 32 && canonical === supplied ? key : null;
}
