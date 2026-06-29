# Roadmap

## Portfolio MVP — current

- Local mock-backed analytics endpoints.
- Dashboard data for viewers, chat, words, moderation, archive, and summaries.
- JSON persistence, health check, and JSON/Markdown reports.
- Domain route modules with centralized JSON error responses.
- Clear local setup and safe credential placeholders.

## Next safe improvements

1. Add unit tests for normalization/storage and integration tests for API routes.
2. Add shared request schemas and stronger environment validation.
3. Make read-modify-write storage operations concurrency-safe.
4. Add structured logging and graceful shutdown.
5. Document deployment hardening once a hosting target is selected.

## Later

- Implement a real Twitch metadata adapter after account verification is available.
- Add EventSub or an appropriate chat ingestion path after the provider contracts are tested.
- Add production deployment configuration only when a hosting target is chosen.
- Add richer report/export workflows after the local API contracts are stable.

## Non-goals for this MVP

- SQLite or another database.
- Replay/import mode.
- Twitch API, EventSub, or chat integration.
- Authentication or multi-tenant support.
- A frontend redesign.
