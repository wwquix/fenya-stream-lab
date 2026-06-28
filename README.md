# Fenya Stream Lab

Premium dark streamer analytics dashboard built with React, Vite, JavaScript, and a local Express mock backend. The project uses mock/local data only and does not require Twitch credentials, real chat access, or EventSub.

## Project setup

The repository intentionally uses one root `package.json` for both the frontend and local backend.

```bash
npm install
```

Run the backend:

```bash
npm run server
```

Run the frontend in a separate terminal:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

The Vite development server proxies `/api` requests to `http://localhost:3001`.

## Local data safety

Mutable backend state is stored under `server/data/*.json`. Runtime JSON files are ignored by Git:

- `fenya-current-stream.json`
- `fenya-current-chat.json`
- `fenya-current-words.json`
- `fenya-current-moderation.json`
- `fenya-archive.json`
- `fenya-current-summary.json`

Committed `server/data/*.example.json` files document each response shape. Storage helpers recreate missing or invalid runtime files from their mock providers.

## API endpoints

All endpoints are local mock APIs.

| Group | Endpoint |
| --- | --- |
| Twitch-like metadata | `GET /api/twitch/fenya` |
| Stream analytics | `GET /api/analytics/fenya/current-stream` |
| Chat analytics | `GET /api/chat/fenya/current-stream` |
| Word analytics | `GET /api/words/fenya/current-stream` |
| Moderation analytics | `GET /api/moderation/fenya/current-stream` |
| Stream archive | `GET /api/archive/fenya/streams` |
| Current summary | `GET /api/summary/fenya/current-stream` |
| Structured report | `GET /api/report/fenya/current-stream` |
| JSON export | `GET /api/report/fenya/current-stream.json` |
| Markdown export | `GET /api/report/fenya/current-stream.md` |

Base URL while the backend is running: `http://localhost:3001`.

## Local mock controls

PowerShell examples:

```powershell
# Append mock samples
Invoke-RestMethod -Method Post http://localhost:3001/api/analytics/fenya/sample
Invoke-RestMethod -Method Post http://localhost:3001/api/chat/fenya/sample
Invoke-RestMethod -Method Post http://localhost:3001/api/words/fenya/sample
Invoke-RestMethod -Method Post http://localhost:3001/api/moderation/fenya/sample
Invoke-RestMethod -Method Post http://localhost:3001/api/archive/fenya/sample

# Regenerate the combined summary
Invoke-RestMethod -Method Post http://localhost:3001/api/summary/fenya/regenerate

# Reset local mock datasets
Invoke-RestMethod -Method Post http://localhost:3001/api/analytics/fenya/reset
Invoke-RestMethod -Method Post http://localhost:3001/api/chat/fenya/reset
Invoke-RestMethod -Method Post http://localhost:3001/api/words/fenya/reset
Invoke-RestMethod -Method Post http://localhost:3001/api/moderation/fenya/reset
Invoke-RestMethod -Method Post http://localhost:3001/api/archive/fenya/reset
Invoke-RestMethod -Method Post http://localhost:3001/api/summary/fenya/reset
```

The analytics mock sampler is optional:

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/analytics/fenya/sampler/start
Invoke-RestMethod -Method Post http://localhost:3001/api/analytics/fenya/sampler/stop
```

Frontend hooks keep the existing mock UI active when the backend is unavailable or returns invalid data.
