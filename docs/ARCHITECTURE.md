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

The frontend keeps committed mock datasets as a defensive fallback. Running the backend unlocks SQLite imports, replay sessions, generated summaries, and reports without changing component contracts.

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
```

Runtime database files are ignored. Schema migration/version tooling is not implemented yet.

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

`twitchMetadataService` selects the unchanged mock provider by default or the real provider for `TWITCH_PROVIDER=twitch`. The auth service obtains and memory-caches an app token; the Helix client owns authenticated requests and safe upstream errors; the provider combines `/users`, `/channels`, and `/streams` into the frontend contract. Tokens are never persisted or returned by diagnostics.

`twitchIngestService` owns user-token validation/refresh, the process-local EventSub connection, keepalive watchdog, reconnect handling, `channel.chat.message` subscription, and Helix poll timer. `twitchIngestRepository` writes live stream snapshots and idempotent chat events into the existing SQLite schema, then updates chatter, word, and stream aggregates. User tokens and refreshed tokens remain memory-only and are never returned by API routes.

## Test architecture

Vitest runs one backend integration file with file-level parallelism disabled. Before each test it:

1. creates a unique operating-system temporary directory;
2. points `DATABASE_PATH` at a new SQLite file;
3. forces mock Twitch and local summaries;
4. seeds deterministic data only when the test needs it.

After each test the database singleton is closed, environment overrides are removed, and the temporary directory is deleted. Tests never import `server/index.js`, load Twitch/OpenAI credentials, or open the normal local database.

## Current boundaries

This is a local single-channel portfolio backend. It has no OAuth UI, encrypted durable token store, application authentication, multi-user isolation, public deployment hardening, rate-limit retry strategy, or durable EventSub/replay recovery. EventSub reconnects while the process is alive, but ingest must be started again after restart. Write, diagnostic, ingest, reset, sampler, import, and replay endpoints must not be exposed publicly without additional controls.
