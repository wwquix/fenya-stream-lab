import { randomUUID } from "node:crypto";
import { z } from "zod";

const streamId = z.string().trim().min(1).max(80);
const eventId = z.string().trim().min(1).max(120).optional();
const timestamp = z.string().trim().min(1).refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "timestamp must be a valid ISO date-time",
);
const timeLabel = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "must use HH:mm format");

const commonFields = {
  eventId,
  streamId,
  timestamp,
};

const chatMessageSchema = z.object({
  ...commonFields,
  type: z.literal("chat_message"),
  chatter: z.string().trim().min(1).max(64),
  message: z.string().trim().min(1).max(500),
  messageType: z.string().trim().min(1).max(32).default("normal"),
});

const viewerSampleSchema = z.object({
  ...commonFields,
  type: z.literal("viewer_sample"),
  viewers: z.coerce.number().int().min(0).max(10_000_000),
  messagesPerMinute: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

const moderationActionSchema = z.object({
  ...commonFields,
  type: z.literal("moderation_action"),
  action: z.enum(["timeout", "ban", "delete_message", "unban", "warning", "other"]),
  moderator: z.string().trim().min(1).max(64).optional(),
  target: z.string().trim().min(1).max(64).optional(),
  reason: z.string().trim().max(240).optional(),
  label: z.string().trim().min(1).max(120).optional(),
});

const streamMarkerSchema = z.object({
  ...commonFields,
  type: z.literal("stream_marker"),
  label: z.string().trim().min(1).max(160),
  markerType: z.string().trim().min(1).max(40).default("stream-event"),
  category: z.string().trim().max(80).optional(),
  viewers: z.coerce.number().int().min(0).max(10_000_000).optional(),
  messagesPerMinute: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

const streamSegmentSchema = z.object({
  ...commonFields,
  type: z.literal("stream_segment"),
  start: timeLabel,
  end: timeLabel,
  label: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).optional(),
});

export const streamEventSchema = z.discriminatedUnion("type", [
  chatMessageSchema,
  viewerSampleSchema,
  moderationActionSchema,
  streamMarkerSchema,
  streamSegmentSchema,
]);

export function validateStreamEvent(value) {
  const result = streamEventSchema.safeParse(value);

  if (!result.success) {
    return {
      success: false,
      message: result.error.issues
        .map((issue) => `${issue.path.join(".") || "event"}: ${issue.message}`)
        .join("; "),
    };
  }

  return {
    success: true,
    data: {
      ...result.data,
      eventId: result.data.eventId ?? randomUUID(),
    },
  };
}
