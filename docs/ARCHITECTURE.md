# Architecture

Fenya Stream Lab is one npm project with two local processes:

1. React + Vite renders the dashboard and requests relative `/api` URLs.
2. Express serves the local API on port `3001`; Vite proxies requests during development.

## Runtime flow

```text
Static mock data -------------------------------> React components
                                                     ^
React hooks -> Express routes -> services/providers |
     ^                |                 |            |
     +------ SSE replay events           v            |
                                  repositories -> SQLite
```

The frontend keeps committed mock datasets as a defensive fallback only in mock mode. With `TWITCH_PROVIDER=twitch`, dashboard routes and components accept only SQLite rows sourced from Twitch and render explicit empty states instead of demo fallback data.

## Backend layers

- `server/index.js`: loads `.env`, starts Express, and optionally starts the mock sampler.
- `server/app.js`: composes middleware, routers, 404 handling, and the JSON error boundary.
- `server/routes/`: maps HTTP endpoints to domain operations.
- `server/services/`: orchestrates imports, reports, provider selection, Twitch auth/Helix calls, replay timing, and SSE clients.
- `server/providers/`: deterministic mock sources, real normalized Twitch metadata, and local summary calculation.
- `server/repositories/`: owns SQLite queries and row-to-contract mapping.
- `server/storage/`: initializes SQLite and preserves legacy JSON/mock compatibility stores.
- `server/validation/`: defines normalized import contracts with Zod.

## SQLite lifecycle

`getDatabase()` opens the configured path lazily, creates its parent directory, enables foreign keys, WAL, and a busy timeout, then applies `schema.sql` idempotently. `closeDatabase()` closes and clears the singleton, which lets tests safely swap database paths.

The main relationships are:

```text
streams
  +-- viewer_samples
  +-- chat_messages / chatters
  +-- word_stats
  +-- moderation_actions
  +-- stream_segments / stream_markers
  +-- stream_summaries
  +-- replay_sessions

import_jobs
  +-- import_errors

users
  +-- twitch_accounts
  +-- sessions
  +-- channel_memberships -- channels
```

Runtime database files are ignored. Schema migration/version tooling is not implemented yet.

### Identity and secret storage foundation

The additive identity schema does not alter the current single-channel routes. `users` can link to Twitch identities, `channels` can have an owner, and `channel_memberships` constrains roles to `channel_owner`, `channel_admin`, `moderator`, or `chatter`.

Application sessions use random opaque tokens rather than JWTs. Only a SHA-256 token hash is persisted; lookup rejects expired rows. The raw token is intended only for an HTTP-only, `SameSite=Lax` cookie, with `Secure` enabled in production.

`tokenCryptoService` encrypts durable Twitch access and refresh tokens using AES-256-GCM. `TOKEN_ENCRYPTION_KEY` must encode exactly 32 bytes as hex or base64 and is required whenever token storage or decryption is attempted. The ignored `.env` must never be committed. Repository/API-shaped Twitch account results exclude encrypted token columns; only service-level Twitch code should load and decrypt them when needed.

### Access control boundary

SQLite has no row-level security (RLS). All application access control therefore goes through shared Express middleware in `server/middleware/authMiddleware.js`:

- `attachCurrentUser` reads the opaque session cookie, resolves only active database sessions, and attaches sanitized `req.user` and `req.session` values. Missing, malformed, expired, or unknown sessions continue as guests.
- `requireUser` rejects guests with `401`.
- `requireChannelRole([...])` resolves `req.params.channelId` through `channel_memberships`, rejects disallowed users with `403`, and attaches `req.channelRole`.
- `requireSelfOrChannelRole(...)` permits the matching linked Twitch identity or one of the explicitly allowed channel roles.

Protected route handlers must compose these guards and must not implement custom ad-hoc ownership or role checks. In particular, handlers must not compare owner IDs or membership roles with inline `if` statements. The current legacy single-channel Fenya routes remain public during the staged multi-user migration; passive session attachment and the new login flow do not change their behavior.

### Twitch login flow

`GET /auth/twitch/login` creates a short-lived, one-time OAuth state and binds it to an HTTP-only `SameSite=Lax` cookie before redirecting to Twitch's Authorization Code flow. Connected-channel login always requests `user:read:chat`. The optional `moderation:read` scope is allowlisted but requested only through the explicit moderator reconnect action.

`TWITCH_REDIRECT_URI` is read from the environment. Local development falls back to `http://localhost:3001/auth/twitch/callback`; production requires an explicit value. The onboarding panel requests the authorization URL as JSON before navigating, so configuration errors remain readable inline. Direct browser requests receive a small local HTML error page rather than the API JSON error envelope.

The callback verifies both state copies, exchanges the code, validates the resulting access token, and fetches the matching `/helix/users` profile. It then updates the local user/Twitch account, encrypts access and refresh tokens, creates the user's channel-owner membership, and issues the existing opaque database-backed session. Up to five browser attempts can coexist in one HTTP-only cookie while each state remains process-local and expires after ten minutes. A restart or expiry produces a friendly retry page rather than raw JSON.

`GET /api/me` returns one normalized, safe identity contract for guests and authenticated users. It includes explicit channel roles, `globalRoles`, and chatter identity but never token, session, or allowlist material. Platform admin is a local app-only role sourced from separate environment allowlists (`PLATFORM_ADMIN_TWITCH_IDS` / `PLATFORM_ADMIN_TWITCH_LOGINS`); channel ownership never implies platform administration, and platform admin never bypasses Twitch OAuth scopes or grants Twitch permissions. `POST /auth/logout` deletes the current database session and clears its cookie.

### Twitch token lifecycle

`twitchTokenRefreshService` is the only stored-account refresh boundary. It decrypts the current refresh token only in memory, sends an encoded refresh grant, and atomically replaces encrypted access/refresh tokens, scopes, and expiration. Per-account in-flight refreshes are deduplicated so rotated refresh tokens cannot race within one process.

Tokens expiring within ten minutes are considered expiring soon. `getValidUserAccessTokenForAccount` refreshes them before use. Account-aware `twitchHelixRequest` calls refresh and retry once after a `401`; another `401` marks `twitch_accounts.needs_reauth`. Refresh failures do the same while returning only a generic reauthorization error.

When `TWITCH_TOKEN_REFRESH_ENABLED=true`, startup creates an unref'ed interval using `TWITCH_TOKEN_REFRESH_INTERVAL_MS` (default five minutes), immediately scans eligible accounts, and continues after failures with account counts only in logs. Shutdown clears the interval. This path applies only to database-backed OAuth accounts; the existing environment-token EventSub ingest lifecycle is intentionally unchanged.

## Import flow

1. JSON or CSV input is normalized into records with row numbers.
2. Zod validates each event independently.
3. A valid event is written inside a SQLite transaction.
4. Invalid records and database constraint failures are attached to the import job.
5. The completed job reports success and rejected counts.

Imports are local portfolio controls, not a hardened public upload service.

## Replay flow

`replayService` keeps active sessions in a process-local map. Events are loaded from SQLite, normalized into one timeline, and scheduled using `REPLAY_MS_PER_STREAM_MINUTE / speed`. SSE clients receive named events and heartbeat comments. Duplicate running sessions for the same stream return `409`; request disconnects remove the response from the client set.

If the requested stream has no detailed events, seeded demo events are used with `demoFallback: true`. SQLite records session metadata, but timers, progress, and clients are not restored after restart.

## Summary/report flow

`summaryService` selects `local`, `mock`, or placeholder `openai` providers from `SUMMARY_PROVIDER`. The supported default is `local`. It aggregates SQLite samples and stores the normalized result in `stream_summaries`.

`reportService` combines stream metadata and the stored/generated summary into JSON or Markdown. Legacy seeded summaries without provider metadata are regenerated through the configured provider before a stream-specific report is returned.

## Twitch provider boundary

`twitchMetadataService` selects the unchanged mock provider by default or the real provider for `TWITCH_PROVIDER=twitch`. The auth service obtains and memory-caches an app token; the Helix client owns authenticated requests and safe upstream errors; the provider combines `/users`, `/channels`, and `/streams` into the frontend contract. Existing environment-based MVP tokens remain memory-only. The new durable account repository stores only AES-256-GCM ciphertext and no token is returned by diagnostics.

`twitchIngestPoolService` owns ingest runtime state as `Map<channelId, ingestState>`. Every entry has its own socket, EventSub session/subscription IDs, poll/watchdog/reconnect timers, current stream session, counters, and error state. Per-channel start is duplicate-safe, stop is idempotent, reconnect/migration creation is serialized, and shutdown stops the full pool. `twitchIngestService` remains only as the Fenya compatibility facade.

The compatibility facade resolves its broadcaster from `TWITCH_CHANNEL_LOGIN` through Helix and its chat reader from the validated environment user token; it does not require a browser session. The frontend ingest hook uses `/api/twitch/fenya/ingest/*` by default and switches to the RBAC-protected `/api/channels/:channelId/ingest/*` contract when given a channel ID. Actions have a bounded client timeout and always clear pending state.

`twitchIngestRepository` resolves a concrete `channel_id` and writes `stream_session_id` on Twitch streams, viewer samples, and chat messages. Current-stream lookup and offline completion are channel-scoped, preventing one broadcaster from becoming another channel's chat target. Legacy configuration creates or resolves its channel record automatically.

For live Twitch rows, `started_at` is the authoritative Twitch broadcast start and `collected_from` is the first timestamp observed by local ingest. Restarts continue the same Twitch stream row without moving the earliest collection boundary forward. EventSub does not backfill chat before that boundary, and VOD metadata sync remains separate from collected analytics.

The dashboard can show collected chat and word aggregates while the channel is offline. Viewer samples, full stream analytics, and archive-ready sessions require the poller to observe a live stream. Process-local autostart and reconnect timing are configured with `TWITCH_LIVE_INGEST_AUTOSTART` and `TWITCH_EVENTSUB_RECONNECT_MS`.

Current limitations: pool state is process-local and is not restored after restart; one Node process must own a channel connection; logged-in channel ingest requires the owner's stored Twitch grant to include `user:read:chat`; legacy dashboard read contracts are still Fenya-oriented even though ingest storage is multi-channel.

### Dashboard modes and VOD archive

The frontend has three explicit data modes: `mock`, `legacy-fenya`, and `connected-channel`. Legacy mode keeps the public compatibility endpoints; selecting an owned/available channel switches every data and ingest hook to channel-scoped endpoints. Real Twitch mode never fills missing panels with demo analytics: offline pages continue to show persisted chat, words, moderation events, completed internal sessions, and safe empty states.

`twitch_vods` stores up to the latest 50 archive-type Twitch videos per channel. Sync follows Helix pagination and is restricted to channel owners/admins on channel routes. VOD responses contain metadata only; internal analytics is marked available only after a conservative channel/time/title match to a real stored stream session. Current limitations: matching is heuristic, Twitch retention may remove old videos, and VOD metadata does not reconstruct viewer timelines, chat, words, or moderation analytics.

`channel_moderators` stores the latest explicitly synchronized Twitch moderator directory. Reads remain independent from moderation action analytics. Without `moderation:read`, the moderator service returns a structured unavailable state; it never substitutes demo moderators in Twitch modes. Full moderation EventSub actions and performance metrics are intentionally outside this stage.

## Test architecture

Vitest runs one backend integration file with file-level parallelism disabled. Before each test it:

1. creates a unique operating-system temporary directory;
2. points `DATABASE_PATH` at a new SQLite file;
3. forces mock Twitch and local summaries;
4. seeds deterministic data only when the test needs it.

After each test the database singleton is closed, environment overrides are removed, and the temporary directory is deleted. Tests never import `server/index.js`, load Twitch/OpenAI credentials, or open the normal local database.

## Current boundaries

This remains a local single-channel portfolio dashboard at the UI level. It now has backend Twitch login, identity, encrypted-token, persistent-session, channel, membership, and authorization-middleware foundations, but no user-facing account pages, complete multi-user route isolation, public deployment hardening, rate-limit retry strategy, or durable EventSub/replay recovery. EventSub reconnects while the process is alive, but ingest must be started again after restart. Legacy write, diagnostic, ingest, reset, sampler, import, and replay endpoints must not be exposed publicly without additional controls.
