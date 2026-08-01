import { describe, expect, test } from "vitest";

import { parseCsvImport } from "./services/csvImportService.js";

describe("CSV import parsing", () => {
  test("parses BOM-prefixed headers and quoted multiline messages", () => {
    const [record] = parseCsvImport([
      "\uFEFFtype,stream_id,timestamp,chatter,message",
      'chat_message,stream-1,2026-08-01T10:00:00.000Z,viewer,"first line,',
      'second line"',
    ].join("\n"));

    expect(record).toEqual({
      rowNumber: 2,
      payload: {
        eventId: undefined,
        streamId: "stream-1",
        timestamp: "2026-08-01T10:00:00.000Z",
        type: "chat_message",
        chatter: "viewer",
        message: "first line,\nsecond line",
        messageType: "normal",
      },
    });
  });

  test("rejects an unterminated quoted field", () => {
    expect(() => parseCsvImport([
      "type,stream_id,timestamp,chatter,message",
      'chat_message,stream-1,2026-08-01T10:00:00.000Z,viewer,"unfinished',
    ].join("\n"))).toThrow("CSV contains an unterminated quoted field.");
  });

  test("rejects duplicate normalized headers", () => {
    expect(() => parseCsvImport([
      "type,stream-id,stream_id,timestamp,viewers",
      "viewer_sample,stream-1,stream-2,2026-08-01T10:00:00.000Z,10",
    ].join("\n"))).toThrow("CSV contains a duplicate header: stream_id.");
  });

  test("rejects data fields that have no matching header", () => {
    expect(() => parseCsvImport([
      "type,stream_id,timestamp,viewers",
      "viewer_sample,stream-1,2026-08-01T10:00:00.000Z,10,unexpected",
    ].join("\n"))).toThrow("CSV row 2 contains more fields than the header.");
  });
});
