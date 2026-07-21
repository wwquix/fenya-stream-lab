Fenya Stream Lab is a bilingual streamer analytics dashboard built as a portfolio project for streamer Fenya. It presents viewer momentum, chat activity, recurring words, moderation workload, archive context, replayed events, and locally generated stream reports in one premium dashboard.
You can try it https://89-169-55-49.nip.io/
The current version supports mock/local data, JSON/CSV imports, Replay Mode, SQLite storage, local reports, real Twitch channel/live polling through Helix, and process-local EventSub WebSocket chat ingestion into SQLite.

## Screenshots
The repository is ready for project-specific screenshots, but no synthetic product screenshots are committed. Recommended portfolio captures:

1. Full desktop dashboard with Stream Pulse and summary cards.
<img width="1875" height="762" alt="image" src="https://github.com/user-attachments/assets/e10357e5-b585-41e3-a8d8-382dc91d61d2" />

<img width="1905" height="770" alt="image" src="https://github.com/user-attachments/assets/86016998-6d08-49d8-9781-b2b4ab7a8d7b" />

2. Replay controls while an event session is running.
<img width="1910" height="945" alt="image" src="https://github.com/user-attachments/assets/2d5ba37b-8993-4216-a57e-62477073c62b" />

3. Top chatters, word cloud, and moderator workload sections.
<img width="1908" height="938" alt="image" src="https://github.com/user-attachments/assets/b90869ac-0396-48cb-8c2d-d34b1f0b789d" />
<img width="1897" height="918" alt="image" src="https://github.com/user-attachments/assets/1ccc114f-36eb-4ac2-a813-6a55a76657fc" />

4. Stream archive and generated report state.
<img width="1904" height="901" alt="image" src="https://github.com/user-attachments/assets/a9aec0f8-b9f3-484b-adef-4e196fcaf6f2" />
<img width="1893" height="935" alt="image" src="https://github.com/user-attachments/assets/dc907159-e394-4b67-ad19-af35ef3c6259" />

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
- Twitch viewer samples plus EventSub chat, chatter, word, and stream-total ingestion.
- Production safety defaults for env validation, CORS, security headers, safe error envelopes, and blocked legacy demo writes.
- GitHub Actions CI for test, lint, and build verification.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, JavaScript |
| Charts | Recharts |
| Motion | Motion |
| Styling | Regular CSS and shared design tokens |
| Backend | Node.js, Express 5 |
| Twitch transport | Helix HTTP, EventSub WebSocket (`ws`) |
| Storage | SQLite via better-sqlite3 |
| Validation | Zod |
| Tests | Vitest, Supertest, temporary SQLite databases |
| Tooling | ESLint, npm |

The project intentionally does not use TypeScript, Tailwind, a real Twitch SDK, or an OpenAI dependency.

## Demo/mock mode

Mock mode is the default portfolio experience. It requires no secrets, no Twitch account, and no backend credentials. It shows a complete deterministic dashboard with viewer timelines, chat leaderboards, word analytics, moderator workload, archive data, imports, replay, summaries, and local reports.

If the local backend is unavailable during frontend development, the UI keeps a safe static mock fallback for the demo dashboard.

## Real Twitch mode

Real Twitch mode is opt-in with `TWITCH_PROVIDER=twitch`. It supports OAuth login, channel ownership derived from Twitch identity, Helix metadata, EventSub chat ingest, channel-scoped ingest controls, moderator directory sync, VOD metadata sync, token refresh, and persisted chat/word/viewer rows when collection is running.

Real mode never uses mock analytics as fallback. When no rows have been collected, the backend returns empty/`204` responses and the UI shows honest empty states.

## Known limitations

- Live Twitch analytics exist only for events collected while the backend and ingest are running.
- Runtime ingest, replay, and mock sampler state is process-local and resets after restart.
- SQLite is intended for local/demo deployment and single-process production experiments, not horizontal scale.
- VOD sync is metadata-only unless a real internally collected stream session exists.
- Moderator action analytics are not implemented yet; the current Twitch moderator feature syncs the directory only.

## Run locally

Requirements: a current Node.js release and npm.

```bash
npm install
```

Create the optional local environment file (it is ignored by Git and must never be committed):

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

`server/storage/db.js` lazily opens the database configured by `DATABASE_PATH`, enables foreign keys, WAL mode, and a 5000 ms busy timeout, then applies `server/storage/schema.sql`. Runtime `*.sqlite`, WAL, and SHM files are ignored by Git.

The schema also contains the foundation for future multi-user access: users, linked Twitch accounts, persistent sessions, channels, and role-based channel memberships. Opaque session tokens are stored only as SHA-256 hashes. Twitch access and refresh tokens are encrypted at rest with AES-256-GCM and are never returned from repository/API-shaped account results.

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

## Twitch metadata integration

Mock mode remains the default and requires no credentials. To use real Twitch metadata, create a local `.env` and configure:

```dotenv
TWITCH_PROVIDER=twitch
TWITCH_CHANNEL_LOGIN=fenya
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_USER_ACCESS_TOKEN=your_user_token
TWITCH_REFRESH_TOKEN=your_refresh_token
TWITCH_LIVE_INGEST_AUTOSTART=false
TWITCH_POLL_INTERVAL_MS=30000
TWITCH_EVENTSUB_RECONNECT_MS=5000
```

The backend uses Twitch Client Credentials, caches the app access token in memory, and resolves Helix user, channel, and current-stream data. `GET /api/twitch/fenya/connection` provides secret-free local diagnostics.

Start real ingestion with `POST /api/twitch/fenya/ingest/start`. It validates the configured user token and its `user:read:chat` scope, opens Twitch EventSub WebSocket, subscribes to `channel.chat.message`, stores messages and aggregates in SQLite, and polls live metadata/viewer samples at `TWITCH_POLL_INTERVAL_MS`. Status and stop routes are documented in [docs/API.md](docs/API.md). The connection and timers are process-local and must be restarted after the backend restarts.

The runtime ingest implementation is a channel-keyed connection pool. Authorized channel owners/admins can use `/api/channels/:channelId/ingest/*`; each channel owns an independent EventSub socket, polling timer, reconnect state, and runtime counters. Starting the same channel twice reuses its existing connection, while stopping one channel leaves others running. The historical `/api/twitch/fenya/ingest/*` routes remain wrappers around a dedicated legacy pool entry.

### Twitch login

Register `http://localhost:3001/auth/twitch/callback` as an OAuth redirect URL in the Twitch developer console, then set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`, and `TOKEN_ENCRYPTION_KEY` in the ignored local `.env`. Start the backend and Vite, then open:

In local development, the backend falls back to `http://localhost:3001/auth/twitch/callback` when `TWITCH_REDIRECT_URI` is absent. Production remains strict and requires the variable explicitly.

```text
http://localhost:3001/auth/twitch/login
```

Browser login always requests `user:read:chat` so a connected channel can collect chat. Roles are derived automatically: connecting your own Twitch identity creates the owner membership, while chatter status comes from login and collected chat data. A successful callback redirects to `AUTH_SUCCESS_REDIRECT_URI`, defaults to the local Vite app, and sets a persistent HTTP-only session cookie. `GET /api/me` returns the safe current-user/channel contract, and `POST /auth/logout` deletes the database session.

OAuth attempts expire after ten minutes. Multiple browser attempts can remain pending independently; if an attempt expires or the backend restarts, the callback shows a safe retry page instead of raw JSON. Repeat the Twitch login from that page.

Stored Twitch user tokens refresh through `twitchTokenRefreshService`. Tokens within ten minutes of expiration refresh proactively, while account-aware Helix requests also refresh and retry once after a `401`. Twitch refresh-token rotation is persisted atomically as new AES-256-GCM ciphertext. Failed refreshes set `needs_reauth`; no token values are included in errors or scheduler logs. The legacy environment-token EventSub flow remains unchanged.

The dashboard keeps the two data modes explicit:

- `TWITCH_PROVIDER=mock` shows the complete deterministic demo dashboard and archive.
- `TWITCH_PROVIDER=twitch` shows only Twitch rows actually collected into SQLite. Demo charts, leaderboards, summaries, moderation data, and archive sessions are not used as fallback in this mode.
- EventSub chat ingestion works only while the backend process and ingest are running. Offline collection may still produce limited real chat and word data; viewer graphs and real archive sessions require ingest to run during a live stream.
- With `TWITCH_LIVE_INGEST_AUTOSTART=true`, the backend starts legacy Fenya ingest on startup. A live session keeps Twitch `started_at` as the broadcast start and stores `collected_from` separately as the first local collection time. Chat before `collected_from` is never reconstructed or implied; VOD synchronization remains metadata-only.
- If nothing has been collected yet, each dashboard section explains what is missing instead of showing demo content.

In Twitch mode, use the compact dashboard status panel to start or stop ingest. The buttons call the local ingest routes; no credentials are sent to or displayed by the browser.

## Environment variables

| Variable | Default/example | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set to `production` when Express serves the built frontend |
| `PORT` | `3001` | Express port |
| `APP_BASE_URL` | `http://localhost:5173` | Public application origin; used for the post-OAuth redirect |
| `DATABASE_PATH` | `server/data/fenya-stream-lab.sqlite` | Local SQLite path |
| `TOKEN_ENCRYPTION_KEY` | empty | 32-byte hex/base64 key; required when Twitch tokens are stored |
| `TWITCH_PROVIDER` | `mock` | `mock` or real Helix metadata via `twitch` |
| `TWITCH_CHANNEL_LOGIN` | `fenya` | Channel login to resolve |
| `TWITCH_CLIENT_ID` | empty | Required in Twitch mode |
| `TWITCH_CLIENT_SECRET` | empty | Required in Twitch mode; server-side only |
| `TWITCH_REDIRECT_URI` | `http://localhost:3001/auth/twitch/callback` | Must exactly match the Twitch app OAuth redirect URL |
| `AUTH_SUCCESS_REDIRECT_URI` | `http://localhost:5173/` | Legacy/local post-login fallback when `APP_BASE_URL` is absent |
| `TWITCH_USER_ACCESS_TOKEN` | empty | Required for EventSub; must include `user:read:chat` |
| `TWITCH_REFRESH_TOKEN` | empty | Configure for in-memory user-token refresh |
| `TWITCH_BROADCASTER_ID` | empty | Optional override; otherwise resolved from channel login |
| `TWITCH_BOT_USER_ID` | empty | Optional safety check against the validated token user ID |
| `TWITCH_POLL_INTERVAL_MS` | `30000` | Live Helix polling interval (minimum 1000 ms) |
| `TWITCH_EVENTSUB_RECONNECT_MS` | `5000` | Delay before reconnecting a dropped EventSub session |
| `TWITCH_LIVE_INGEST_AUTOSTART` | `false` | Start Twitch ingest with the backend when explicitly enabled |
| `TWITCH_TOKEN_REFRESH_ENABLED` | `false` | Enable periodic refresh for encrypted database-backed user tokens |
| `TWITCH_TOKEN_REFRESH_INTERVAL_MS` | `300000` | Stored-token refresh scan interval; minimum 1000 ms |
| `SUMMARY_PROVIDER` | `local` | `local` or deterministic `mock`; `openai` is only a placeholder |
| `MOCK_SAMPLER_INTERVAL_MS` | `10000` | Demo sampler interval |
| `MOCK_SAMPLER_AUTOSTART` | `false` | Start demo sampler with the backend |
| `ALLOW_DEMO_WRITES` | `false` | Allow legacy demo mutation/reset endpoints in production; keep `false` for public deployments |
| `REPLAY_MS_PER_STREAM_MINUTE` | `250` | Local replay timing scale before speed multiplier |

No credentials are required in the default mock mode. Twitch mode requires client credentials and a user token with `user:read:chat`; configure a refresh token as well so the local process can refresh an expired user token. `TOKEN_ENCRYPTION_KEY` is required only when durable Twitch token storage is used. Generate and keep it in the ignored local `.env`; `.env` and all secrets must never be committed.

Optional `PLATFORM_ADMIN_TWITCH_IDS` and `PLATFORM_ADMIN_TWITCH_LOGINS` comma-separated allowlists define local Fenya Stream Lab administrators independently from channel roles. `/api/me` exposes this only as `roleSummary.isPlatformAdmin` and `globalRoles: ["platform_admin"]`; it does not expose the allowlist itself. Platform admin never grants Twitch broadcaster/moderator permissions and never bypasses OAuth scopes. The archive can synchronize the latest 50 Twitch VOD metadata records; it does not invent chat, viewer, word, or moderation analytics for VOD-only entries.

Channel roles are assigned automatically from Twitch identity and channel ownership; there is no manual role switch in the dashboard. The platform-admin badge is a local application role only. Twitch still requires the matching OAuth scopes for each protected operation. The VOD archive contains Twitch metadata only, while full chat, word, viewer, and moderation analytics exist only for streams collected live by Fenya Stream Lab.

Server-side RBAC protects every mutating `/api` request. Channel owners may control and synchronize only their own channel, while locally allowlisted platform admins can perform administrative mutations. Chatter and moderator roles are read-only; hiding controls in the frontend is only a UX layer and is not the security boundary.

The current channel moderator list is optional and requires `moderation:read`. The dashboard asks for it only when an owner explicitly reconnects Twitch from the moderator section. This stage stores and displays the directory only; moderator actions, bans, timeouts, and moderation EventSub analytics remain future work.

## npm scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run server` | Start the Express backend |
| `npm run db:seed` | Seed the configured SQLite database |
| `npm run build` | Create the frontend production bundle |
| `npm run preview` | Preview the built frontend |
| `npm start` | Start the Express production service (serves `dist` when `NODE_ENV=production`) |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |

## Testing

Run the backend integration suite:

```bash
npm test
```

The suite covers health, database initialization, imports, reports, replay, Twitch metadata normalization, EventSub subscription setup, and Twitch SQLite aggregation. Twitch tests mock HTTP and WebSocket traffic and never contact Twitch.

Recommended full verification:

```bash
npm test
npm run lint
npm run build
```

CI runs the same `npm ci`, `npm test`, `npm run lint`, and `npm run build` sequence on push and pull requests.

## Ubuntu VPS deployment

Install a current Node.js LTS release, copy the project, and keep the real `.env` only on the VPS. Build and start the single Express service:

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

Set at least `NODE_ENV=production`, `PORT=3001`, `APP_BASE_URL=https://stats.example.com`, `TWITCH_REDIRECT_URI=https://stats.example.com/auth/twitch/callback`, and a writable absolute `DATABASE_PATH`. Add the exact callback URL to the Twitch developer console. Keep Twitch credentials, token encryption keys, and tokens only in the ignored `.env`. A systemd service can run `npm start` from the project directory with `EnvironmentFile=/path/to/app/.env`.

Proxy the public origin to the one local service; Express serves `dist`, `/api/*`, `/auth/*`, and `/health`:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Terminate HTTPS in nginx. Verify deployment with `curl https://stats.example.com/health`; it returns only `{ "ok": true, "service": "fenya-stream-lab" }`.

## API overview

Base URL: `http://localhost:3001`. See [docs/API.md](docs/API.md) for the complete route table, request examples, responses, SSE events, and error behavior.

## Portfolio highlights

- Cohesive analytics product rather than disconnected demo widgets.
- Premium responsive visual system with restrained glass surfaces and accessible controls.
- End-to-end local data flow from validated imports through SQLite to React adapters.
- Clear provider/source boundaries between mock mode, Helix metadata polling, and EventSub chat ingestion.
- Replay scheduling and SSE lifecycle management with duplicate-session protection.
- Deterministic local reports without paid or secret-dependent services.
- Isolated integration tests that prove the backend without modifying local data.

## Future improvements

- Add explicit migrations and schema versioning.
- Add structured logging, request IDs, monitoring, and backups for a chosen host.
- Tune rate limits for the final public deployment target.
- Add repository-owned portfolio screenshots.

See [docs/ROADMAP.md](docs/ROADMAP.md) for scope and ordering.
