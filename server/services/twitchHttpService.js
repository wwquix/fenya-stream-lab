import { HttpError } from "../middleware/errorHandlers.js";

export const TWITCH_HTTP_TIMEOUT_MS = 10_000;

export async function fetchTwitch(url, options = {}, timeoutMs = TWITCH_HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, "Twitch request timed out", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
