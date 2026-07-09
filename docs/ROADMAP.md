# Roadmap

## Portfolio repository — current

- React/Vite dashboard with Russian and English UI.
- Premium long-scroll analytics UI with mock mode as the complete default demo.
- SQLite persistence with deterministic seed data, imports, summaries, reports, replay sessions, users, Twitch accounts, channels, memberships, and Twitch VOD metadata.
- Zod-validated JSON/CSV imports with job/error tracking and 2 MB request limits.
- SSE Replay Mode with speed controls, duplicate protection, and process-local timers.
- Local summary provider and JSON/Markdown reports without paid external services.
- Twitch OAuth login, safe `/api/me` identity summary, automatic channel-owner role creation, and platform-admin allowlists.
- Twitch Helix metadata, EventSub WebSocket chat ingest, channel-scoped ingest pools, token refresh, moderator directory sync, and metadata-only VOD synchronization.
- Honest Twitch mode contracts: no demo fallback for real analytics, `204 No Content` when real rows do not exist, and empty UI states instead of fabricated metrics.
- Startup env validation, restricted production CORS, lightweight security headers, safe error envelopes, production blocking for legacy demo writes, and graceful shutdown for ingest/sampler/replay timers.
- Vitest/Supertest integration suite using temporary SQLite databases plus a GitHub Actions CI workflow.

## Next safe improvements

1. Add explicit SQLite schema versioning and repeatable migrations.
2. Add structured logging with request IDs and deploy-target log formatting.
3. Add deployment-specific observability, backups, and health checks beyond `/health`.
4. Tune rate limits for the final hosting environment and traffic profile.
5. Commit curated desktop/mobile portfolio screenshots after reviewing them for private data.
6. Add recorded Twitch-provider fixtures for adapter contract tests without contacting Twitch.

## Later, after broader real-world usage

- Add durable queue/replay recovery across process restarts.
- Move live ingest supervision into a worker model if multi-channel production usage grows.
- Add moderation EventSub analytics for bans, timeouts, deletions, and action latency.
- Add richer report export formats and shareable public read-only snapshots.
- Add migration tooling for multi-user production deployments.

## Explicit current limitations

- Mock mode is the portfolio default and remains the most complete no-credential demo path.
- Real Twitch analytics only exist for data collected while the backend and ingest are running; chat before `collected_from` is not reconstructed.
- EventSub sockets, replay sessions, mock sampler state, and runtime ingest counters are process-local and reset after restart.
- SQLite is local single-process storage, not a horizontally scaled multi-tenant analytics platform.
- VOD sync stores Twitch metadata only unless a real internally collected stream session exists.
- Moderator directory sync lists current moderators; it does not yet collect moderation actions, bans, timeouts, or response-time analytics from Twitch.
- Production deployments must provide their own HTTPS proxy, persistent database path, secrets, monitoring, and backup policy.

These limitations are deliberate and should remain visible until the corresponding work is implemented and verified.
