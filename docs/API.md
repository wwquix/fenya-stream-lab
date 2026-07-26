# Local API

Base URL: `http://localhost:3001`

Ordinary API errors use a safe JSON envelope. Authentication and authorization failures are stable:

```json
{ "error": "unauthorized", "message": "Authentication required" }
{ "error": "forbidden", "message": "Insufficient permissions" }
```

Malformed JSON returns `400` with `Request body contains invalid JSON.` Twitch login and `/api/me` use database-backed authentication. Every mutating `/api` request is guarded server-side: a channel owner may mutate only their channel, platform admins may perform administrative mutations, and chatter/moderator access is read-only. Legacy Fenya mutations require the Fenya channel owner or a platform admin.

## Authentication

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/auth/twitch/login` | Start Twitch Authorization Code login |
| GET | `/auth/twitch/callback` | Verify OAuth state and establish a session |
| POST | `/auth/logout` | Delete the current session and clear its cookie |
| GET | `/api/me` | Return safe current-user, channel, membership, and local `globalRoles` data |

Browser callback failures are rendered as a small safe HTML retry page. An expired, unknown, or process-lost OAuth state does not return the global JSON error contract and never includes cookie, state, token, or client-secret values.

The callback never returns Twitch or session tokens. `/api/me` requires an active HTTP-only session cookie and returns `401` for guests. A locally allowlisted platform administrator receives `roleSummary.isPlatformAdmin: true` and `globalRoles: ["platform_admin"]`; this is an application role only and does not grant Twitch permissions or bypass OAuth scopes.

`GET /auth/twitch/login?format=json` returns `{ authorizationUrl }` for the onboarding panel. Configuration failures use a safe readable `message`; the direct browser route renders a local HTML explanation instead of raw JSON.

Database-backed Twitch accounts refresh within ten minutes of expiration or once after an account-aware Helix `401`. A failed refresh marks the account for reauthorization. Token ciphertext, plaintext tokens, and refresh failure details are never part of API responses.

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
| GET | `/api/streams/:streamId/advanced-analytics` | On-demand advanced analytics for one stored legacy/local stream |
| GET | `/api/channels/:channelId/streams/:streamId/advanced-analytics` | Membership-protected, channel-isolated advanced analytics |

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

Enhanced `suggestedClipMoments` entries preserve the legacy `time` and `label` fields consumed by existing reports. New consumers may also read `startTime`, `peakTime`, `endTime`, `durationMinutes`, `signalDurationMinutes`, `viewerDirection`, `score`, `confidence`, `reasons`, peak viewer/chat values, local-baseline deltas, and a nearby marker. The three window fields use ISO timestamps only when every viewer sample is anchored by its own parseable timestamp or a valid stream `started_at`; if any point remains unanchored, all three retain `HH:mm` labels. They are recommendations for an editor and do not represent generated video files.

## Advanced stream analytics

| Method | Endpoint | Access |
| --- | --- | --- |
| GET | `/api/streams/:streamId/advanced-analytics` | Public compatibility read for the configured `TWITCH_CHANNEL_LOGIN` (default `fenya`), limited to rows with no channel or no connected owner |
| GET | `/api/channels/:channelId/streams/:streamId/advanced-analytics` | Any authenticated membership in that channel; platform admin is also accepted by centralized middleware |

The public alias cannot expose an owned connected-channel stream, even when its login matches `TWITCH_CHANNEL_LOGIN`; it returns `404` and the caller must use the channel-scoped route. For the channel-scoped route, guests receive the stable `401` envelope, authenticated non-members receive the stable `403` envelope, and a stream that does not belong to the selected channel returns `404`. The lookup is scoped by both channel and stream; it never returns another channel's data. Twitch-mode datasets are built only from Twitch-sourced rows and never substitute mock analytics.

The successful response is calculated on demand from saved SQLite rows:

```json
{
  "streamId": "string",
  "channelId": 12,
  "source": "twitch",
  "generatedAt": "ISO date-time",
  "dataQuality": {
    "status": "complete",
    "warnings": [],
    "viewerSamples": 49,
    "messages": 320,
    "uniqueChatters": 44,
    "markers": 5,
    "historicalStreams": 5,
    "hasAbsoluteTimestamps": true,
    "collectedFrom": "2026-07-20T18:35:00.000Z",
    "collectedPeriodOnly": true
  },
  "loyalty": {},
  "clipSuggestions": [],
  "eventImpact": [],
  "retention": {}
}
```

`dataQuality.status` is:

- `complete`: the selected calculation has the expected timeline/history coverage;
- `partial`: useful results exist, but timestamps, collection coverage, or one analytical input is incomplete;
- `insufficient`: the saved rows cannot support a responsible result.

Warnings are machine-readable strings suitable for localization. Counts describe the exact rows used, not inferred viewing activity. `collectedFrom` is the first locally observed ingest point. When it is later than the Twitch stream start, retention covers only the collected period.

Current warning keys are `no-viewer-samples`, `limited-viewer-samples`, `no-chat-messages`, `insufficient-chat-history`, `missing-absolute-timestamps`, `collection-started-late`, and `no-markers`.

### Configured thresholds

All thresholds live in the exported `ADVANCED_ANALYTICS_CONFIG`; components do not duplicate them.

| Area | Thresholds |
| --- | --- |
| Loyalty | At least 3 saved streams for sufficient history; recent window 5; regular at 3 attended streams; reactivated after at least 2 consecutively missed streams; top list limited to 10 |
| Clips | At least 6 samples; 4 previous points for the rolling baseline; minimum score 28/100; saved-marker score floor 32/100 (score only); at most 5 windows; merge/marker proximity 1.5 median sample intervals; editorial window capped at 3 intervals around the winning peak; segment-start proximity 1 interval |
| Clip normalization | Viewer baseline deviation target 25%; viewer point change target 18%; chat baseline deviation target 50%; chat point change target 45%; sustained-signal target 3 points with up to 8 score points and 0.08 confidence; own sample-timestamp coverage contributes up to 0.15 confidence |
| Event impact | 3 median-cadence intervals before, 3 after, and 6 for extended recovery; at least 2 points on each side; notable change threshold 8% |
| Viewer-curve retention | 3-point smoothing; first 15% for early baseline; sustained loss at least 12% for at least 2 consecutive smoothed and raw points; merge gap 1.5 median intervals; full recovery at 90% of the observed loss regained; partial recovery at 50%; segment summaries use 3 points |

Median observed sample cadence converts point-based window settings into elapsed-time windows, so the API does not assume samples arrive once per minute.

Clip confidence is `clamp(0.35 + 0.07 × reason count + min(sample count, 20) / 100 + 0.15 × own-timestamp share + 0.08 × duration strength)`. A marker affects confidence through the `marker-nearby` reason; the 32-point marker floor does not create a separate confidence floor. A valid stream start can anchor `HH:mm` samples for ISO output, but confidence timestamp coverage counts only parseable timestamps stored on the samples themselves.

### Chat loyalty

Loyalty is derived only from saved `chat_messages` and aggregate `chatters` participation rows, grouped by normalized login and stream within the same channel. It does not infer silent viewers or watch time. The deterministic mock seed includes aggregate message-count participation for archived demo streams; real Twitch results continue to use only rows collected for that source.

Categories are mutually exclusive. The service applies this priority:

1. `insufficient-history` when there is not enough channel history for a confident classification;
2. `new` when the selected stream is the first saved appearance;
3. `reactivated` when an earlier participant returns after the configured consecutive-stream gap;
4. `regular` when participation meets the configured recent-stream threshold;
5. `returning` for any other participant with an earlier saved appearance.

The section includes `activeParticipants`, `newParticipants` / `newShare`, `returningParticipants` / `returningShare`, `regularParticipants` / `regularShare`, `reactivatedParticipants` / `reactivatedShare`, `insufficientHistoryParticipants`, `knownParticipantsShare`, `averageStreamsAttended`, `historyStreamsUsed`, `isSufficient`, `topParticipants`, and the full `participants` list. Shares are fractions from `0` to `1`. Participant rows contain `login`, `streamsAttended`, `messagesInSelectedStream`, `firstKnownAt`, `lastKnownAt`, `category`, and `currentStreak`. Usernames remain source data and are not translated.

### Clip suggestions

Each candidate is an explainable, non-overlapping time window with:

- `startTime`, `peakTime`, and `endTime`;
- `durationMinutes`, sustained-signal `signalDurationMinutes`, and `viewerDirection` (`up`, `down`, or `neutral`);
- normalized `score` and `confidence`;
- localized/explainable reason keys and Russian/English summary text;
- peak viewers and messages per minute;
- deltas from local rolling baselines;
- the related marker when present;
- localized `text.ru` and `text.en`;
- legacy `time` and `label` compatibility fields.

Viewer and chat features are normalized before weighting, so absolute viewer scale cannot suppress chat variation. Both upward spikes and downward viewer cliffs can qualify. Signal duration contributes to score/confidence, and timestamp completeness contributes only to confidence. A nearby saved marker supplies a documented score floor and may create an editorial candidate on an otherwise flat timeline; an active segment by itself does not. Nearby high points are merged and no more than five candidates are returned. A flat/inadequate timeline without a qualifying saved marker returns an empty list rather than invented highlights.

`durationMinutes` is the cadence-capped merged editorial window length. `signalDurationMinutes` is the median-cadence span of consecutive qualifying signal points for the winning peak candidate, so it may be longer than the proposed editing window.

Clip confidence reflects reason count, sample depth, own-sample timestamp coverage, and sustained duration. Event confidence reflects before/after point coverage. Both are bounded numeric fractions from `0` to `1`; neither is a causal probability.

### Event impact

Each saved marker is compared with time-based windows strictly before and strictly after it; a sample aligned exactly with the marker is not counted in the post-event window. The service does not assume one-minute samples and reports the number of usable points. Results include before/after averages, absolute and percentage changes for viewers/chat, post-event peaks, time to peak, duration evidence, `confidence`, and one of:

- `positive`
- `negative`
- `mixed`
- `neutral`
- `insufficient-data`

Percentage change is omitted when its baseline is zero. Explanations use correlation language such as “after the event an increase was observed”; the API does not claim causation.

Each event row also includes its saved identity/time/label/type, `dataPoints.before` and `dataPoints.after`, and localized `explanation.ru` / `explanation.en`. After a notable change, `effectDurationMinutes` measures marker-to-first-later-point time where both viewer and chat metrics return within ±8% of their pre-event baselines. If no such point exists, `effectDurationMinutes` is `null`, `effectObservedMinutes` measures marker-to-last-observed time in the extended window, and `effectCensored` is `true`. With insufficient data or no notable effect, both duration values remain `null` and `effectCensored` is `false`.

### Viewer-curve retention

Retention uses the aggregate viewer timeline, not unique-viewer sessions. It reports start/end/average/peak viewers, end-versus-start and early-baseline changes, notable drops, recovery counts, and the most stable/problematic segments.

Each drop includes start, local minimum, recovery/end, absolute and percentage loss, duration, maximum recovery, recovery ratio, related markers/segments, and one status:

- `recovered`
- `partially-recovered`
- `not-recovered`

Rolling smoothing, a minimum percentage loss, matching consecutive-point requirements on both the smoothed and raw curves, nearby-drop merging, and an explicit recovery threshold prevent small noise or one isolated raw sample from becoming separate incidents. `maxRecovery` is the maximum intermediate regain, while `recoveryRatio` uses the terminal share of the observed start-to-trough loss regained after merged-drop recomputation. `recoveryTimeMinutes` is set only when the 90% threshold is reached and remains satisfied through the incident end; a later unrecovered leg therefore remains authoritative. An empty timeline returns the null/empty retention shell. A one-point timeline returns bounded start/end metrics and a one-point curve with no drops or segments; top-level `dataQuality` determines whether the overall response is insufficient.

The section also returns the normalized/smoothed `curve`, `dropCount`, `recoveredDropCount`, `largestDrop`, `stableSegment`, and `problemSegment`. Curve points expose `time`, `elapsedMinutes`, `viewers`, and `smoothedViewers`.

## Local demo controls

These routes mutate/reset local demo data and are not public production operations:

When `NODE_ENV=production`, legacy local demo mutation routes are blocked by default and return:

```json
{ "error": true, "message": "Local demo mutation endpoints are disabled in production." }
```

Set `ALLOW_DEMO_WRITES=true` only for a deliberately isolated demo environment. Read endpoints remain available.

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

In production, legacy Fenya ingest/write helpers are disabled unless `ALLOW_DEMO_WRITES=true`. Prefer channel-scoped authenticated routes for real deployments.

### EventSub ingest

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/channels/:channelId/ingest/status` | Read one channel's pool status |
| POST | `/api/channels/:channelId/ingest/start` | Start or reuse that channel's ingest |
| POST | `/api/channels/:channelId/ingest/stop` | Idempotently stop that channel |
| POST | `/api/channels/connect-my-channel` | Connect the logged-in user's own Twitch channel |
| GET | `/api/channels/mine` | List the user's available channels and ingest status |
| GET | `/api/channels/:channelId/moderators` | Read the stored moderator directory and scope availability |
| POST | `/api/channels/:channelId/moderators/sync` | Owner/admin sync through Twitch Get Moderators |
| GET | `/api/twitch/fenya/moderators` | Read legacy Fenya moderator directory state |
| POST | `/api/twitch/fenya/moderators/sync` | Sync legacy Fenya moderators when the environment token has `moderation:read` |

Channel routes require `channel_owner` or `channel_admin` membership through centralized middleware. Each channel has independent WebSocket, polling, watchdog, and reconnect state. The Fenya routes above remain unprotected local compatibility wrappers around the legacy configured channel.

Moderator directory responses contain `available`, `missingScopes`, `message`, and `moderators`. Missing `moderation:read` returns a safe unavailable state rather than failing the dashboard. This endpoint does not report actions, bans, timeouts, or inferred performance.

Legacy start resolves the broadcaster through `TWITCH_CHANNEL_LOGIN` and the chat reader through the validated configured user token. Safe failures distinguish invalid tokens, missing chat-reader or broadcaster IDs, missing `user:read:chat`, and EventSub subscription rejection.

Ingest requires `TWITCH_PROVIDER=twitch`, valid client credentials, and `TWITCH_USER_ACCESS_TOKEN` with `user:read:chat`. On start, the backend resolves the broadcaster, creates a WebSocket `channel.chat.message` subscription using the validated token user ID, and begins Helix polling. Chat messages are deduplicated by Twitch message ID and update `chat_messages`, `chatters`, `word_stats`, and stream totals. Live polls update stream title/category/start time and append `viewer_samples`.

Status responses contain connection IDs, timestamps, counters, provider state, and a safe `lastError`; they contain no credentials. Pool state, sockets, and timers are in memory and do not survive process restart. Mock mode remains available and refuses to start real ingest cleanly.

When `TWITCH_PROVIDER=twitch`, dashboard read endpoints return only rows whose source is `twitch`. If no matching analytics, chat, words, moderation, or archive data exists, the corresponding endpoint returns `204 No Content`; it never falls back to demo JSON. In mock mode the existing deterministic contracts remain unchanged.

`TWITCH_LIVE_INGEST_AUTOSTART=true` may start ingest with the backend. `TWITCH_POLL_INTERVAL_MS` controls Helix polling and `TWITCH_EVENTSUB_RECONNECT_MS` controls the reconnect delay. The default autostart value is `false`.

Ingest status includes safe `streamStartedAt` and `collectedFrom` timestamps. When `streamStartedAt` is earlier, chat before `collectedFrom` was not observed and is not available. These fields never contain token or credential material.
