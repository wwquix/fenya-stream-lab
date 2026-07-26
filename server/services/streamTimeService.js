const TIME_LABEL_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function minutesFromTimeLabel(timeLabel) {
  if (!TIME_LABEL_PATTERN.test(timeLabel ?? "")) return null;
  const [hours, minutes] = timeLabel.split(":").map(Number);
  return (hours < 6 ? hours + 24 : hours) * 60 + minutes;
}

export function timestampForTimeLabel(startedAt, timeLabel) {
  if (!startedAt || !TIME_LABEL_PATTERN.test(timeLabel ?? "")) return null;

  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;

  const [hours, minutes] = timeLabel.split(":").map(Number);
  const timestamp = new Date(start);
  timestamp.setUTCHours(hours, minutes, 0, 0);

  if (timestamp.getTime() < start.getTime() - 60 * 60 * 1000) {
    timestamp.setUTCDate(timestamp.getUTCDate() + 1);
  }

  return timestamp.toISOString();
}

export function resolveTimelineTime({ timestamp, time } = {}, startedAt = null) {
  const absoluteTime = typeof timestamp === "string" ? Date.parse(timestamp) : Number.NaN;
  if (Number.isFinite(absoluteTime)) return absoluteTime;

  const anchored = timestampForTimeLabel(startedAt, time);
  if (anchored) return Date.parse(anchored);

  const fallbackMinutes = minutesFromTimeLabel(time);
  return fallbackMinutes === null ? null : fallbackMinutes * 60_000;
}

export function formatTimelineTime(timestamp, fallback = null) {
  if (!Number.isFinite(timestamp)) return fallback;
  return new Date(timestamp).toISOString().slice(11, 16);
}
