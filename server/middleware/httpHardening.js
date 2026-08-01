import cors from "cors";
import process from "node:process";

const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const DEMO_WRITE_PATTERNS = [
  /^\/analytics\/fenya\/(?:sample|reset|sampler\/(?:start|stop))$/,
  /^\/chat\/fenya\/(?:sample|reset)$/,
  /^\/words\/fenya\/(?:sample|reset)$/,
  /^\/moderation\/fenya\/(?:sample|reset)$/,
  /^\/archive\/fenya\/(?:sample|reset)$/,
  /^\/summary\/fenya\/(?:regenerate|reset)$/,
  /^\/twitch\/fenya\/(?:poll-once|archive\/sync-vods|moderators\/sync)$/,
];

function originFrom(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function createCorsMiddleware(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const productionOrigin = originFrom(env.APP_BASE_URL);

  return cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (nodeEnv === "production") {
        callback(null, Boolean(productionOrigin && origin === productionOrigin));
        return;
      }

      callback(null, LOCAL_ORIGIN_PATTERN.test(origin));
    },
  });
}

export function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

export function blockProductionDemoWrites(req, res, next) {
  if (process.env.NODE_ENV !== "production" || String(process.env.ALLOW_DEMO_WRITES).toLowerCase() === "true") {
    next();
    return;
  }

  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  if (DEMO_WRITE_PATTERNS.some((pattern) => pattern.test(req.path))) {
    res.status(403).json({
      error: true,
      message: "Local demo mutation endpoints are disabled in production.",
    });
    return;
  }

  next();
}

export function createRateLimitMiddleware({
  windowMs = 60_000,
  max = 120,
  matcher = () => false,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map();
  let nextCleanupAt = 0;

  return function rateLimit(req, res, next) {
    if (!matcher(req)) {
      next();
      return;
    }

    const currentTime = now();
    if (currentTime >= nextCleanupAt) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= currentTime) buckets.delete(key);
      }
      nextCleanupAt = currentTime + windowMs;
    }

    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const bucket = buckets.get(key);
    const current = bucket && bucket.resetAt > currentTime
      ? bucket
      : { count: 0, resetAt: currentTime + windowMs };

    current.count += 1;
    buckets.set(key, current);

    if (current.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((current.resetAt - currentTime) / 1000)));
      res.status(429).json({ error: true, message: "Too many requests. Try again shortly." });
      return;
    }

    next();
  };
}

export function isSensitiveMutation(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  return req.path.startsWith("/auth/")
    || req.path.startsWith("/api/import")
    || req.path.startsWith("/api/replay")
    || req.path.includes("/ingest/")
    || req.path.includes("/sync");
}
