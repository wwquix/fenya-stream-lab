import process from "node:process";
import { Buffer } from "node:buffer";

const VALID_NODE_ENVS = new Set(["development", "test", "production"]);
const VALID_TWITCH_PROVIDERS = new Set(["mock", "twitch", "real"]);

export class EnvValidationError extends Error {
  constructor(messages) {
    super(`Environment validation failed:\n- ${messages.join("\n- ")}`);
    this.name = "EnvValidationError";
    this.messages = messages;
  }
}

function read(env, name) {
  return typeof env[name] === "string" ? env[name].trim() : "";
}

function isEnabled(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function hasValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function tokenKeyLooksValid(value) {
  if (!value) return false;
  if (/^[a-f\d]{64}$/i.test(value)) return true;
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

export function validateEnv(env = process.env) {
  const errors = [];
  const nodeEnv = read(env, "NODE_ENV") || "development";
  const twitchProvider = (read(env, "TWITCH_PROVIDER") || "mock").toLowerCase();
  const isProduction = nodeEnv === "production";
  const isTwitchMode = twitchProvider === "twitch" || twitchProvider === "real";

  if (!VALID_NODE_ENVS.has(nodeEnv)) {
    errors.push("NODE_ENV must be development, test, or production.");
  }

  if (read(env, "PORT")) {
    const port = Number(read(env, "PORT"));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push("PORT must be an integer from 1 to 65535.");
    }
  }

  if (!VALID_TWITCH_PROVIDERS.has(twitchProvider)) {
    errors.push("TWITCH_PROVIDER must be mock or twitch.");
  }

  if (isProduction && !read(env, "DATABASE_PATH")) {
    errors.push("DATABASE_PATH is required in production.");
  }

  for (const name of ["APP_BASE_URL", "TWITCH_REDIRECT_URI", "AUTH_SUCCESS_REDIRECT_URI"]) {
    const value = read(env, name);
    if (value && !hasValidUrl(value)) {
      errors.push(`${name} must be a valid http(s) URL.`);
    }
  }

  const tokenKey = read(env, "TOKEN_ENCRYPTION_KEY");
  if (tokenKey && !tokenKeyLooksValid(tokenKey)) {
    errors.push("TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes as hex or base64.");
  }

  if (isProduction && isTwitchMode) {
    for (const name of ["APP_BASE_URL", "TWITCH_REDIRECT_URI", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "TWITCH_CHANNEL_LOGIN"]) {
      if (!read(env, name)) errors.push(`${name} is required in production Twitch mode.`);
    }
    if (!tokenKey) {
      errors.push("TOKEN_ENCRYPTION_KEY is required in production Twitch mode.");
    }
  }

  if (isEnabled(env.TWITCH_LEGACY_ENV_TOKEN_MODE)) {
    if (isProduction) errors.push("TWITCH_LEGACY_ENV_TOKEN_MODE is development-only and must be false in production.");
    if (!read(env, "TWITCH_USER_ACCESS_TOKEN")) errors.push("TWITCH_USER_ACCESS_TOKEN is required in legacy development token mode.");
    if (!read(env, "TWITCH_REFRESH_TOKEN")) errors.push("TWITCH_REFRESH_TOKEN is required in legacy development token mode.");
  }

  if (errors.length) {
    throw new EnvValidationError(errors);
  }

  return {
    nodeEnv,
    twitchProvider: isTwitchMode ? "twitch" : "mock",
    isProduction,
    allowDemoWrites: isEnabled(env.ALLOW_DEMO_WRITES),
  };
}
