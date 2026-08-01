import { describe, expect, test } from "vitest";

import { parseReplayEventPayload } from "../src/hooks/useReplay.js";

describe("replay event payload parsing", () => {
  test("returns valid event objects", () => {
    expect(parseReplayEventPayload('{"sequence":2,"viewers":1450}')).toEqual({
      sequence: 2,
      viewers: 1450,
    });
  });

  test("converts malformed JSON into a stable client error", () => {
    expect(() => parseReplayEventPayload('{"sequence":')).toThrow("Replay event contains invalid JSON");
  });

  test.each(["null", "[]", '"message"', "42"])(
    "rejects non-object event payload %s",
    (payload) => {
      expect(() => parseReplayEventPayload(payload)).toThrow("Replay event payload must be a JSON object");
    },
  );
});
