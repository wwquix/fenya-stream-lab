# Roadmap

## Portfolio repository — current

- React/Vite dashboard with Russian and English UI.
- Mock-backed viewer, chat, word, moderation, archive, and metadata domains.
- SQLite persistence with deterministic seed data.
- Zod-validated JSON/CSV imports with job/error tracking.
- SSE Replay Mode with speed controls, duplicate protection, and demo fallback.
- Local summary provider and JSON/Markdown reports.
- Vitest/Supertest backend integration suite using temporary SQLite databases.
- Honest setup, API, data-format, architecture, and limitation documentation.

## Next safe improvements

1. Add explicit SQLite schema versioning and migrations.
2. Add structured logging and graceful shutdown for active replay/sampler timers.
3. Add environment validation at backend startup.
4. Add import rate/size policies appropriate to a chosen deployment target.
5. Commit curated desktop/mobile portfolio screenshots.

## Later, after real account access

- Implement and verify Twitch OAuth and metadata adapters.
- Add EventSub subscriptions and an appropriate chat ingestion source.
- Add token lifecycle, retry, caching, and rate-limit handling.
- Add contract tests against recorded real-provider fixtures.

## Deployment-dependent work

- Authentication and authorization for write endpoints.
- Multi-user/channel isolation.
- Durable queue/replay recovery.
- Observability, backups, and deployment-specific security controls.

## Explicit current limitations

- No real Twitch API, EventSub, OAuth, or live chat integration.
- No functional OpenAI provider and no OpenAI requirement.
- No authentication, rate limiting, or public deployment hardening.
- Replay state is process-local and does not resume after restart.
- SQLite is local single-process storage, not a multi-tenant data platform.

These limitations are deliberate and should remain visible until the corresponding work is implemented and verified.
