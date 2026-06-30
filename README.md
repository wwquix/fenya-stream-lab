# Fenya Stream Lab

Fenya Stream Lab is a bilingual streamer analytics dashboard built as a portfolio project for streamer Fenya. It presents viewer momentum, chat activity, recurring words, moderation workload, archive context, replayed events, and locally generated stream reports in one premium dashboard.

The current version supports mock/local data, JSON/CSV imports, Replay Mode, SQLite storage, and local reports. Real Twitch/EventSub integration is planned but not complete. The project is Twitch-ready through its adapter/source architecture; it does not claim to be production-ready or connected to a live Twitch account.

## Screenshots

The repository is ready for project-specific screenshots, but no synthetic product screenshots are committed. Recommended portfolio captures:

1. Full desktop dashboard with Stream Pulse and summary cards.
2. Replay controls while an event session is running.
3. Top chatters, word cloud, and moderator workload sections.
4. Stream archive and generated report state.

## Key features

- Viewer and chat timelines with category segments and notable stream markers.
- Top chatter leaderboards, streamer word analytics, and moderation workload views.
- Stream archive with mock session history.
- SQLite-backed local persistence and deterministic seeding.
- Validated JSON/CSV event imports with per-row job errors.
- Replay Mode over Server-Sent Events at `1x`, `5x`, or `20x`.
- Local summary generation with peaks, active segments, leaders, moderation load, clip suggestions, and health status.
- JSON and Markdown reports for individual streams.
- Russian and English interface support.
- Static mock-data fallback when the local API is unavailable.
- Backend integration tests that use temporary SQLite databases.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, JavaScript |
| Charts | Recharts |
| Motion | Motion |
| Styling | Regular CSS and shared design tokens |
| Backend | Node.js, Express 5 |
| Storage | SQLite via better-sqlite3 |
| Validation | Zod |
| Tests | Vitest, Supertest, temporary SQLite databases |
| Tooling | ESLint, npm |

The project intentionally does not use TypeScript, Tailwind, a real Twitch SDK, or an OpenAI dependency.

## Run locally

Requirements: a current Node.js release and npm.

```bash
npm install
```

Create the optional local environment file:

```bash
cp .env.example .env
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env
```

Seed the local SQLite database:

```bash
npm run db:seed
```

Start the backend:

```bash
npm run server
```

Start Vite in a second terminal:

```bash
npm run dev
```

Vite proxies relative `/api` requests to `http://localhost:3001`.

## Backend architecture

The backend is divided into app composition, domain routes, services, repositories, providers, and storage modules. Frontend hooks request normalized API contracts while committed mock data remains available for static dashboard mode.

```text
React hooks -> Express routes -> services/providers -> repositories -> SQLite
     ^                |
     +------ SSE replay events
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for lifecycle and boundary details.

## SQLite storage

`server/storage/db.js` lazily opens the database configured by `DATABASE_PATH`, enables foreign keys and WAL mode, and applies `server/storage/schema.sql`. Runtime `*.sqlite`, WAL, and SHM files are ignored by Git.

`npm run db:seed` writes deterministic mock streams and analytics. Tests override `DATABASE_PATH` with a new temporary directory for every test and never open the developer database.

## Import system

`POST /api/import/json` accepts an array of normalized events. `POST /api/import/csv` accepts chat-message or viewer-sample rows. Zod validates each record independently; accepted records are written transactionally and rejected records are stored against an import job.

Examples are available under `examples/`. The complete contract is documented in [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md).

## Replay Mode

Replay Mode reads ordered viewer samples, chat messages, moderation actions, and markers from SQLite, then emits them over SSE. One process-local session is allowed per stream. If a stream has no detailed events, the service replays seeded demo events and marks the session as a fallback.

Active replay timers and SSE clients do not survive a backend restart. Session metadata is recorded in SQLite for local inspection.

## Summary and report pipeline

The default `localSummaryProvider` calculates report data from SQLite only. `mockSummaryProvider` remains available for deterministic fallback behavior. `openAiSummaryProvider` is an explicit non-functional placeholder; OpenAI is neither required nor called.

Generated summaries are stored in `stream_summaries`. Stream reports are available as structured JSON and readable Markdown. See [docs/API.md](docs/API.md) for endpoints.

## Current Twitch status

The supported provider is `TWITCH_PROVIDER=mock`. `/api/twitch/fenya` returns deterministic Twitch-shaped metadata for the UI.

Real Twitch API, OAuth, EventSub, chat ingestion, token refresh, retries, and rate-limit handling are not implemented. Provider and source boundaries make a future adapter possible without replacing the dashboard contracts, which is what “Twitch-ready” means in this repository.

## Environment variables

| Variable | Default/example | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Express port |
| `DATABASE_PATH` | `server/data/fenya-stream-lab.sqlite` | Local SQLite path |
| `TWITCH_PROVIDER` | `mock` | Only supported Twitch metadata mode |
| `TWITCH_CHANNEL_LOGIN` | `fenya` | Mock channel selector |
| `SUMMARY_PROVIDER` | `local` | `local` or deterministic `mock`; `openai` is only a placeholder |
| `MOCK_SAMPLER_INTERVAL_MS` | `10000` | Demo sampler interval |
| `MOCK_SAMPLER_AUTOSTART` | `false` | Start demo sampler with the backend |
| `REPLAY_MS_PER_STREAM_MINUTE` | `250` | Local replay timing scale before speed multiplier |

No credentials are required. Twitch/OpenAI key fields are intentionally absent from `.env.example` because those providers are not implemented.

## npm scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run server` | Start the Express backend |
| `npm run db:seed` | Seed the configured SQLite database |
| `npm run build` | Create the frontend production bundle |
| `npm run preview` | Preview the built frontend |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |

## Testing

Run the backend integration suite:

```bash
npm test
```

The suite covers health, database initialization, seeding, valid and invalid imports, summary generation, JSON/Markdown reports, and replay start/status/stop. Supertest runs against the Express app in-process. Every test creates and removes its own SQLite database in the operating-system temp directory.

Recommended full verification:

```bash
npm test
npm run lint
npm run build
```

## API overview

Base URL: `http://localhost:3001`. See [docs/API.md](docs/API.md) for the complete route table, request examples, responses, SSE events, and error behavior.

## Portfolio highlights

- Cohesive analytics product rather than disconnected demo widgets.
- Premium responsive visual system with restrained glass surfaces and accessible controls.
- End-to-end local data flow from validated imports through SQLite to React adapters.
- Clear provider/source boundaries for future Twitch integration without pretending it already exists.
- Replay scheduling and SSE lifecycle management with duplicate-session protection.
- Deterministic local reports without paid or secret-dependent services.
- Isolated integration tests that prove the backend without modifying local data.

## Future improvements

- Implement and verify a real Twitch OAuth/metadata adapter.
- Add EventSub/chat ingestion after provider contracts are proven against a real account.
- Add migrations, structured logging, graceful shutdown, and deployment hardening.
- Add authentication and rate limiting before exposing write endpoints publicly.
- Add repository-owned portfolio screenshots.

See [docs/ROADMAP.md](docs/ROADMAP.md) for scope and ordering.
