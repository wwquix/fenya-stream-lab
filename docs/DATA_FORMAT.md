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

Committed examples:

- `examples/sample-stream-events.json`
- `examples/sample-chat-messages.csv`
- `examples/sample-viewer-samples.csv`
