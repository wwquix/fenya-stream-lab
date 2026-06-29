# Fenya Stream Lab

Fenya Stream Lab is a premium analytics dashboard concept for streamer Fenya. It turns a stream session into a readable product story: viewer momentum, chat participation, recurring words, moderation workload, session summaries, archive context, and exportable reports.

The project is a working portfolio MVP built around local mock data. The frontend and local backend are functional; real Twitch and EventSub integration is planned but not connected.

## Screenshots

> Screenshot placeholder — add a polished desktop overview of the dashboard here.

> Screenshot placeholder — add focused views of Stream Pulse, top chatters, word analytics, moderation, and the archive here.

## Key features

- Viewer and chat activity timelines with stream events and category segments.
- Top chatter leaderboards and profile-oriented analytics.
- Streamer word and phrase analytics with clusters and tone metadata.
- Moderator performance, workload timelines, and moderation events.
- Stream archive, current-session summary, highlights, and insights.
- Structured JSON reports and readable Markdown exports.
- Russian and English interface support.
- Resilient frontend data adapters that preserve demo content when the local API is unavailable.
- Optional local sample generation for demonstrating changing analytics.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, JavaScript |
| Visualization | Recharts |
| Motion | Motion |
| Styling | Regular CSS with shared design tokens |
| Backend | Node.js, Express 5 |
| Local persistence | JSON files with committed example datasets |
| Tooling | ESLint, npm |

The project intentionally remains JavaScript-based and does not use TypeScript, Tailwind, a database, or external platform SDKs at this stage.

## Run locally

Requirements: a current Node.js release and npm.

```bash
npm install
```

Create a local environment file from the safe template:

```bash
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env`. The default `TWITCH_PROVIDER=mock` mode requires no credentials.

Start the backend:

```bash
npm run server
```

Start the frontend in a second terminal:

```bash
npm run dev
```

Vite prints the frontend URL and proxies `/api` requests to `http://localhost:3001` during development.

Available project checks:

```bash
npm run build
```

To inspect the production build locally:

```bash
npm run preview
```

## Backend status

The backend is a working local Express service organized into app setup, domain routes, services, providers, and JSON storage modules. It supports the dashboard domains, a health endpoint, mock sample/reset controls, summary generation, and report exports.

Runtime state is stored in ignored `server/data/*.json` files. Committed `*.example.json` datasets document the expected shapes, and the storage layer normalizes data before returning it to the frontend. API failures use a consistent JSON envelope:

```json
{ "error": true, "message": "..." }
```

This is not presented as a production backend. It currently has no database, authentication, public deployment hardening, multi-user support, or complete automated test suite. The POST sample/reset routes are local demonstration controls and should not be exposed as public production endpoints.

See [Architecture](docs/ARCHITECTURE.md) for the current data flow and boundaries.

## Data source status

### Available now

- Local mock providers populate every dashboard section.
- Runtime JSON persistence supports repeatable local demonstrations.
- Example JSON files make the API contracts reviewable without running the app.
- Frontend hooks fetch, normalize, and safely fall back from local API responses.

### Planned

- Twitch channel and stream metadata through a real provider adapter.
- EventSub or an appropriate Twitch chat ingestion path for live events.
- Token lifecycle, caching, retry, and rate-limit handling.

Real Twitch chat, EventSub, WebSockets, OAuth tokens, and live channel data are not connected today. `.env.example` contains placeholders only, and `TWITCH_PROVIDER=mock` is the supported mode.

## API overview

Base URL for the local backend: `http://localhost:3001`.

| Domain | Endpoint | Purpose |
| --- | --- | --- |
| Health | `GET /api/health` | Local service status |
| Channel | `GET /api/twitch/fenya` | Mock Twitch-shaped metadata |
| Analytics | `GET /api/analytics/fenya/current-stream` | Viewer and chat timeline |
| Chat | `GET /api/chat/fenya/current-stream` | Chat metrics and leaderboards |
| Words | `GET /api/words/fenya/current-stream` | Frequent words and clusters |
| Moderation | `GET /api/moderation/fenya/current-stream` | Moderator workload and events |
| Archive | `GET /api/archive/fenya/streams` | Stream session archive |
| Summary | `GET /api/summary/fenya/current-stream` | Aggregated current-session summary |
| Report | `GET /api/report/fenya/current-stream` | Combined structured report |
| Export | `GET /api/report/fenya/current-stream.json` | JSON report export |
| Export | `GET /api/report/fenya/current-stream.md` | Markdown report export |

Local POST controls also exist for sample generation, dataset reset, sampler control, and summary regeneration. They are documented by the route modules under `server/routes/` and are intended for development demonstrations.

## Portfolio highlights

- A cohesive analytics product rather than a collection of disconnected widgets.
- A premium dashboard visual system with restrained glass surfaces, spacing, and accent color use.
- End-to-end data flow from Express routes and storage normalization to defensive React hooks.
- Backend separation between startup, app composition, routes, services, providers, and persistence.
- Multiple analytics domains combined into a single summary and export workflow.
- Honest fallback behavior that keeps the portfolio demo usable without external credentials.

## Roadmap

1. Add automated unit and API integration tests.
2. Introduce shared request schemas and stronger environment validation.
3. Make local read-modify-write operations concurrency-safe.
4. Add structured logging, graceful shutdown, and deployment-specific hardening.
5. Implement the real Twitch adapter only after account access is available.
6. Add EventSub/chat ingestion after the provider contracts and tests are stable.

See [Roadmap](docs/ROADMAP.md) for the focused implementation order and MVP non-goals.
