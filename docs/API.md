# Local API

Base URL: `http://localhost:3001`

All ordinary errors use:

```json
{ "error": true, "message": "Human-readable message" }
```

Malformed JSON returns `400` with `Request body contains invalid JSON.` No authentication is implemented; this API is intended for local portfolio use.

## Read endpoints

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/health` | Service, provider, and timestamp |
| GET | `/api/twitch/fenya` | Mock or real normalized Twitch channel/live metadata |
| GET | `/api/twitch/fenya/connection` | Secret-free local Twitch configuration diagnostics |
| GET | `/api/twitch/fenya/ingest/status` | Process-local EventSub/poller state and safe counters |
| GET | `/api/analytics/fenya/current-stream` | Viewer/chat timeline, segments, markers |
| GET | `/api/chat/fenya/current-stream` | Chat totals and leaderboards |
| GET | `/api/words/fenya/current-stream` | Frequent words and clusters |
| GET | `/api/moderation/fenya/current-stream` | Moderation summary, team, timeline, events |
| GET | `/api/archive/fenya/streams` | Stream archive |
| GET | `/api/archive/fenya/streams/:streamId` | One archived stream |
| GET | `/api/summary/fenya/current-stream` | Compatibility current-stream summary |
| GET | `/api/report/fenya/current-stream` | Compatibility combined JSON report |
| GET | `/api/report/fenya/current-stream.json` | Compatibility JSON report alias |
| GET | `/api/report/fenya/current-stream.md` | Compatibility Markdown report |

## Imports

### `POST /api/import/json`

Accepts an array of normalized events with `Content-Type: application/json`.

```json
[
  {
    "eventId": "viewer-001",
    "type": "viewer_sample",
    "streamId": "2026-06-23",
    "timestamp": "2026-06-23T19:00:00.000Z",
    "viewers": 3200,
    "messagesPerMinute": 620
  }
]
```

Returns `201` with an import job. Row validation failures still return a completed job response; inspect `status`, `successCount`, and `rejectedCount`.

### `POST /api/import/csv`

Accepts `text/csv`, `text/plain`, or `application/csv`. CSV supports `chat_message` and `viewer_sample` records. See [DATA_FORMAT.md](DATA_FORMAT.md).

### Import job reads

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/import/:jobId` | Job status and counters |
| GET | `/api/import/:jobId/errors` | Row-level errors and rejected payloads |

Unknown job IDs return `404`.

## Replay Mode

| Method | Endpoint | Result |
| --- | --- | --- |
| POST | `/api/replay/:streamId/start` | Start one session |
| POST | `/api/replay/:streamId/stop` | Stop the active session |
| GET | `/api/replay/:streamId/status` | Status, speed, cursor, progress |
| GET | `/api/replay/:streamId/events` | SSE connection |

Start body:

```json
{ "speed": 5 }
```

Allowed speeds are `1`, `5`, and `20`. Invalid speeds return `400`; a duplicate running session returns `409`.

The SSE endpoint emits:

- `replay_started`
- `chat_message`
- `viewer_sample`
- `moderation_action`
- `stream_marker`
- `replay_finished`
- `replay_error`

Clients should listen for named events rather than only the default `message` event. Heartbeat comments are sent approximately every 15 seconds.

## Stream summaries and reports

| Method | Endpoint | Result |
| --- | --- | --- |
| POST | `/api/streams/:streamId/summary/generate` | Generate and persist a summary |
| GET | `/api/streams/:streamId/summary` | Read the stored summary |
| GET | `/api/streams/:streamId/report/json` | Stream-specific JSON report |
| GET | `/api/streams/:streamId/report/markdown` | Stream-specific Markdown report |

Summary generation uses `SUMMARY_PROVIDER=local` by default. It requires a stream row in SQLite and returns `404` when the stream does not exist. Reading a summary before generation returns `404`. Report endpoints generate/upgrade the local summary when necessary.

## Local demo controls

These routes mutate/reset local demo data and are not public production operations:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/analytics/fenya/sample` | Append a mock timeline sample |
| POST | `/api/analytics/fenya/reset` | Reset current analytics |
| POST | `/api/analytics/fenya/sampler/start` | Start the process-local mock sampler |
| POST | `/api/analytics/fenya/sampler/stop` | Stop the mock sampler |
| GET | `/api/analytics/fenya/sampler/status` | Read sampler state |
| POST | `/api/chat/fenya/sample` | Append a mock chat message |
| POST | `/api/chat/fenya/reset` | Reset chat analytics |
| POST | `/api/words/fenya/sample` | Append/update a mock word |
| POST | `/api/words/fenya/reset` | Reset word analytics |
| POST | `/api/moderation/fenya/sample` | Append a mock moderation event |
| POST | `/api/moderation/fenya/reset` | Reset moderation analytics |
| POST | `/api/archive/fenya/sample` | Append a mock archived stream |
| POST | `/api/archive/fenya/reset` | Reset the archive |
| POST | `/api/summary/fenya/regenerate` | Regenerate the compatibility summary |
| POST | `/api/summary/fenya/reset` | Reset the compatibility summary |
| POST | `/api/twitch/fenya/poll-once` | Fetch metadata once in Twitch mode; reports that polling is skipped in mock mode |
| POST | `/api/twitch/fenya/ingest/start` | Validate credentials, poll once, connect EventSub, and subscribe to chat |
| POST | `/api/twitch/fenya/ingest/stop` | Stop EventSub, reconnect watchdog, and polling timers |

## Twitch metadata

`TWITCH_PROVIDER=mock` preserves the deterministic dashboard response. With `TWITCH_PROVIDER=twitch`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `TWITCH_CHANNEL_LOGIN`, the same endpoint resolves the user and reads channel/current-stream data from Helix. Offline responses use `isLive: false`, `streamId: null`, and `viewerCount: 0`.

The connection route returns only presence flags, token validity/scopes, configured broadcaster ID, and a safe last error. It never returns token or client-secret values. These routes are local development diagnostics, not public authenticated operations.

### EventSub ingest

Ingest requires `TWITCH_PROVIDER=twitch`, valid client credentials, and `TWITCH_USER_ACCESS_TOKEN` with `user:read:chat`. On start, the backend resolves the broadcaster, creates a WebSocket `channel.chat.message` subscription using the validated token user ID, and begins Helix polling. Chat messages are deduplicated by Twitch message ID and update `chat_messages`, `chatters`, `word_stats`, and stream totals. Live polls update stream title/category/start time and append `viewer_samples`.

The status response contains connection IDs, timestamps, counters, provider state, and a safe `lastError`; it contains no credentials. Ingest state, sockets, token refreshes, and timers are in memory and do not survive process restart. Mock mode remains available and refuses to start real ingest cleanly.

When `TWITCH_PROVIDER=twitch`, dashboard read endpoints return only rows whose source is `twitch`. If no matching analytics, chat, words, moderation, or archive data exists, the corresponding endpoint returns `204 No Content`; it never falls back to demo JSON. In mock mode the existing deterministic contracts remain unchanged.

`TWITCH_LIVE_INGEST_AUTOSTART=true` may start ingest with the backend. `TWITCH_POLL_INTERVAL_MS` controls Helix polling and `TWITCH_EVENTSUB_RECONNECT_MS` controls the reconnect delay. The default autostart value is `false`.
