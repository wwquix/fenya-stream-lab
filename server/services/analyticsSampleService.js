function addMinutes(time, minutesToAdd) {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = (hours * 60 + minutes + minutesToAdd) % (24 * 60);
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;

  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function varyPositiveValue(value, maximumChange) {
  const change = 1 + (Math.random() * 2 - 1) * maximumChange;
  return Math.max(1, Math.round(value * change));
}

function getPositiveNumber(value, fieldName) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be a positive number.`);
  }

  return value;
}

export function createAnalyticsSamplePoint(analytics, body = {}) {
  const latestPoint = analytics.points.at(-1);

  return {
    time: body.time ?? (latestPoint ? addMinutes(latestPoint.time, 5) : new Date().toTimeString().slice(0, 5)),
    viewers: body.viewers === undefined
      ? varyPositiveValue(latestPoint?.viewers ?? 3200, 0.06)
      : getPositiveNumber(body.viewers, "viewers"),
    messagesPerMinute: body.messagesPerMinute === undefined
      ? varyPositiveValue(latestPoint?.messagesPerMinute ?? 650, 0.12)
      : getPositiveNumber(body.messagesPerMinute, "messagesPerMinute"),
  };
}
