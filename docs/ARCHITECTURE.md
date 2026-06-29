# Architecture

Fenya Stream Lab uses one npm project with two local processes:

1. The React + Vite frontend renders the dashboard and requests relative `/api` URLs.
2. During development, Vite proxies those requests to the Express backend on port `3001`.

## Backend flow

```text
Frontend hooks -> Express routes -> services/repositories -> SQLite
                                      |                         |
                                      +-> compatibility stores -> JSON/mock fallback
```

- `server/index.js` loads configuration and starts the HTTP server.
- `server/app.js` creates the Express app and mounts domain routers.
- `server/routes/` defines the existing API endpoints by domain.
- `server/middleware/` provides the shared JSON error boundary.
- `server/providers/` supplies deterministic mock datasets. The Twitch provider is currently a non-functional placeholder.
- `server/repositories/` maps SQLite rows to the existing dashboard response contracts and records imports.
- `server/storage/db.js` initializes SQLite from `server/storage/schema.sql`.
- Existing `server/storage/*Store.js` modules preserve response normalization and JSON/mock fallback behavior.
- `server/services/` contains provider selection, sample creation, mock sampling, and combined report generation.
- `server/data/*.example.json` documents committed data shapes; runtime JSON files are ignored.
- `examples/` contains normalized JSON and CSV import samples.
- `src/hooks/` fetches and normalizes API responses. Existing frontend mock data remains the fallback.

## Current boundaries

The backend is designed for a single local Fenya demo channel. SQLite is local-only and has no authentication, external API access, or multi-user deployment guarantees. Sample/reset/import routes are development controls and should not be exposed publicly without protection. The `replay_sessions` table reserves future state only; replay execution is not implemented.
