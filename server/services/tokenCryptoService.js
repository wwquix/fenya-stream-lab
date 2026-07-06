import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

export class TokenCryptoConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "TokenCryptoConfigError";
  }
}

function getEncryptionKey() {
  const configured = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!configured) throw new TokenCryptoConfigError("TOKEN_ENCRYPTION_KEY is required for encrypted token storage");

  const key = /^[a-f\d]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.length !== 32) throw new TokenCryptoConfigError("TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes");
  return key;
}

export function encryptToken(token) {
  if (typeof token !== "string" || !token) throw new TypeError("Token must be a non-empty string");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptToken(encryptedToken) {
  const [version, ivValue, tagValue, ciphertextValue, extra] = String(encryptedToken || "").split(":");
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue || extra) throw new TypeError("Invalid encrypted token payload");
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}
