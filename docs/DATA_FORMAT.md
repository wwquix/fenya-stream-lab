# Data formats

Fenya Stream Lab imports normalized stream events. JSON supports every event type below. CSV currently supports only `chat_message` and `viewer_sample`.

## Shared JSON fields

| Field | Type | Rules |
| --- | --- | --- |
| `type` | string | One supported event type |
| `streamId` | string | Required, 1–80 characters |
| `timestamp` | string | Required, parseable ISO date-time |
| `eventId` | string | Optional, unique when supplied; generated when absent |

Unknown fields are removed by schema normalization.

## `viewer_sample`

```json
{
  "eventId": "viewer-001",
  "type": "viewer_sample",
  "streamId": "2026-06-23",
  "timestamp": "2026-06-23T19:00:00.000Z",
  "viewers": 3200,
  "messagesPerMinute": 620
}
```

- `viewers`: integer from 0 to 10,000,000.
- `messagesPerMinute`: integer from 0 to 1,000,000; defaults to 0.

## `chat_message`

```json
{
  "eventId": "chat-001",
  "type": "chat_message",
  "streamId": "2026-06-23",
  "timestamp": "2026-06-23T19:00:03.000Z",
  "chatter": "portfolio_viewer",
  "message": "сильный момент",
  "messageType": "normal"
}
```

- `chatter`: required, maximum 64 characters.
- `message`: required, maximum 500 characters.
- `messageType`: maximum 32 characters; defaults to `normal`.

## `moderation_action`

```json
{
  "eventId": "mod-001",
  "type": "moderation_action",
  "streamId": "2026-06-23",
  "timestamp": "2026-06-23T19:10:00.000Z",
  "action": "timeout",
  "moderator": "mod_shadow",
  "target": "spam_account",
  "reason": "Repeated messages"
}
```

`action` is one of `timeout`, `ban`, `delete_message`, `unban`, `warning`, or `other`. Moderator, target, reason, and label are optional.

## `stream_marker`

```json
{
  "eventId": "marker-001",
  "type": "stream_marker",
  "streamId": "2026-06-23",
  "timestamp": "2026-06-23T20:40:00.000Z",
  "label": "Clutch highlight",
  "markerType": "highlight",
  "category": "CS2",
  "viewers": 11800,
  "messagesPerMinute": 4100
}
```

`label` is required. Marker type defaults to `stream-event`; category and metric snapshots are optional.

## `stream_segment`

```json
{
  "eventId": "segment-001",
  "type": "stream_segment",
  "streamId": "2026-06-23",
  "timestamp": "2026-06-23T19:35:00.000Z",
  "start": "19:35",
  "end": "20:45",
  "label": "Ranked CS2",
  "category": "CS2"
}
```

`start` and `end` use 24-hour `HH:mm`. Label is required and category is optional.

## CSV format

Header names use snake_case and are converted to the JSON field names.

Viewer sample:

```csv
event_id,type,stream_id,timestamp,viewers,messages_per_minute
csv-viewer-001,viewer_sample,2026-06-23,2026-06-23T19:00:00.000Z,3200,620
```

Chat message:

```csv
event_id,type,stream_id,timestamp,chatter,message,message_type
csv-chat-001,chat_message,2026-06-23,2026-06-23T19:00:03.000Z,portfolio_viewer,"сильный момент",normal
```

CSV must include `type`, `stream_id`, and `timestamp`. Unsupported event types are rejected with a clear parsing error.

## Import result

```json
{
  "jobId": "uuid",
  "format": "json",
  "status": "completed_with_errors",
  "sourceName": "pasted-json",
  "streamId": "2026-06-23",
  "totalCount": 2,
  "successCount": 1,
  "rejectedCount": 1,
  "createdAt": "2026-06-30T18:00:00.000Z",
  "completedAt": "2026-06-30T18:00:00.050Z"
}
```

Status is `completed`, `completed_with_errors`, or `failed`. Duplicate supplied `eventId` values are rejected and recorded on the job. Use `/api/import/:jobId/errors` for row numbers, messages, and original normalized payloads.

## Advanced analytics output

Advanced analytics is a derived read model, not another import type or persisted event table. The endpoint combines one selected stream with route-scoped history: `channel_id`-bound history for a connected-channel route, or configured-login/unowned history for the public compatibility alias:

```json
{
  "streamId": "2026-06-23",
  "channelId": 12,
  "source": "twitch",
  "generatedAt": "2026-07-26T12:00:00.000Z",
  "dataQuality": {
    "status": "complete",
    "warnings": [],
    "viewerSamples": 49,
    "messages": 320,
    "uniqueChatters": 44,
    "markers": 5,
    "historicalStreams": 5,
    "hasAbsoluteTimestamps": true,
    "collectedFrom": "2026-06-23T19:00:00.000Z",
    "collectedPeriodOnly": false
  },
  "loyalty": {},
  "clipSuggestions": [],
  "eventImpact": [],
  "retention": {}
}
```

### Time fields

- Absolute ISO timestamps are preferred for ordering and elapsed-window calculations.
- `HH:mm` labels are normalized relative to the saved stream start using the project's midnight rule when an absolute event timestamp is unavailable.
- Algorithms operate on elapsed time, not sample-array positions. Irregular viewer-sample intervals are valid.
- Clip windows use ISO `startTime`, `peakTime`, and `endTime` only when every viewer-sample point is anchored by its own parseable timestamp or a valid stream `started_at`. If any point remains unanchored, all three fields use `HH:mm`; no Unix-epoch/1970 timestamp is serialized. Stream-start anchoring does not count as own-sample timestamp coverage for clip confidence.
- Clip rows expose `durationMinutes`, sustained-signal `signalDurationMinutes`, and `viewerDirection` (`up`, `down`, or `neutral`).
- Retention drops reuse normalized timeline labels in `startTime`, `troughTime`, and `endTime`; `durationMinutes`, `recoveryTimeMinutes`, and curve `elapsedMinutes` carry the arithmetic meaning.
- After a notable event change, `effectDurationMinutes` measures marker-to-first-later-point time where both metrics return within ±8% of baseline. If the effect is still present at the last extended-window point, `effectDurationMinutes` is `null`, `effectObservedMinutes` is the marker-to-last-point lower bound, and `effectCensored` is `true`.
- `collectedFrom` is evidence of the locally observed boundary, not the Twitch broadcast start.

### Quality and percentage semantics

- `dataQuality.status` is `complete`, `partial`, or `insufficient`.
- Missing timestamps, limited history, absent before/after windows, and collection that starts after broadcast start are represented by warnings.
- A percentage change is `null` when the baseline is zero; the API never divides by zero or substitutes an arbitrary percentage.
- Shares use the selected stream's normalized active chat participants as the denominator. A stream with no messages returns zero counts and an explicit insufficient/empty state.
- Confidence expresses input completeness and signal agreement; it is not a probability that an event caused a result.
- Retention `recoveryRatio` is the terminal share of the observed start-to-trough loss regained. `recovered` requires at least 90%, `partially-recovered` at least 50%, and merged drops are recomputed from the final combined window.
- A notable retention loss must persist for at least two consecutive smoothed points and also contain a two-point raw below-threshold run; one isolated raw outlier is not a drop.

### Enumerations

- Loyalty category: `new`, `returning`, `regular`, `reactivated`, `insufficient-history`.
- Event direction: `positive`, `negative`, `mixed`, `neutral`, `insufficient-data`.
- Drop status: `recovered`, `partially-recovered`, `not-recovered`.
- Quality status: `complete`, `partial`, `insufficient`.

### Interpretation limits

- Chat loyalty measures participation in saved messages. It is not individual watch time and excludes silent viewers.
- Clip suggestions identify promising editing windows; they do not create or upload video.
- Event impact is a before/after correlation around saved markers and does not prove causation.
- Audience retention is derived from aggregate viewer counts for the collected period. The project has no per-viewer arrival/departure history.
- Real Twitch mode never replaces missing Twitch rows with mock data.

Committed examples:

- `examples/sample-stream-events.json`
- `examples/sample-chat-messages.csv`
- `examples/sample-viewer-samples.csv`
