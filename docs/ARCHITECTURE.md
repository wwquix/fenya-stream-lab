# Architecture

Fenya Stream Lab uses one npm project with two local processes:

1. The React + Vite frontend renders the dashboard and requests relative `/api` URLs.
2. During development, Vite proxies those requests to the Express backend on port `3001`.

## Backend flow

```text
Frontend hooks -> Express routes -> storage/services -> server/data/*.json
                                      |                    |
                                      +-> mock providers <-+
```

- `server/index.js` loads configuration and starts the HTTP server.
- `server/app.js` creates the Express app and mounts domain routers.
- `server/routes/` defines the existing API endpoints by domain.
- `server/middleware/` provides the shared JSON error boundary.
- `server/providers/` supplies deterministic mock datasets. The Twitch provider is currently a non-functional placeholder.
- `server/storage/` validates, normalizes, reads, and atomically writes runtime JSON data.
- `server/services/` contains provider selection, sample creation, mock sampling, and combined report generation.
- `server/data/*.example.json` documents committed data shapes; runtime JSON files are ignored.
- `src/hooks/` fetches and normalizes API responses. Existing frontend mock data remains the fallback.

## Current boundaries

The backend is designed for a single local Fenya demo channel. It has no database, authentication, external API access, or multi-user deployment guarantees. Sample/reset routes are development controls and should not be exposed publicly.
