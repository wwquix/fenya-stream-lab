# Fenya Stream Lab

MVP demo website for streamer analytics using mock data only. The current version is moving toward a clean premium dark analytics dashboard: cinematic glass hero, localized RU/EN UI, stream controls, stream pulse analytics, top chatters, speech patterns, moderator performance, bookshelf-style stream archive, and a bottom current stream summary.

## Install

```bash
npm install
```

## Run Dev Server

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Mock Twitch Backend

Real Twitch credentials are not required yet. Twitch SMS verification is currently blocking real Developer credentials, so the backend uses mock mode with `TWITCH_PROVIDER=mock`.

Create `.env` from `.env.example`, then run the backend:

```bash
npm run server
```

Test the endpoint:

```text
http://localhost:3001/api/twitch/fenya
```

The mock backend also exposes provider-based stream analytics for the Stream Pulse chart:

```text
http://localhost:3001/api/analytics/fenya/current-stream
```

Both endpoints return mock data for now: `/api/twitch/fenya` returns Twitch-like channel metadata, and `/api/analytics/fenya/current-stream` returns normalized stream analytics points, segments, and events. Real Twitch and chat integrations can replace these providers later without changing the frontend API shape.

## Local analytics storage

Stream analytics are currently mock/local and do not require Twitch credentials. The current stream data is stored in `server/data/fenya-current-stream.json`. If that file is missing or invalid, the backend recreates it from the mock analytics provider.

Run the backend:

```bash
npm run server
```

View the current analytics:

```text
http://localhost:3001/api/analytics/fenya/current-stream
```

Add a generated mock sample with PowerShell:

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/analytics/fenya/sample
```

Reset analytics to the original mock data:

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/analytics/fenya/reset
```

## Mock live sampler

The mock live sampler is for local development only. It simulates live stream analytics by periodically appending clamped mock points to `server/data/fenya-current-stream.json`. It does not use Twitch credentials, Twitch chat, or EventSub.

Start the backend:

```bash
npm run server
```

Start the sampler:

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/analytics/fenya/sampler/start
```

Check sampler status:

```text
http://localhost:3001/api/analytics/fenya/sampler/status
```

Stop the sampler:

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/analytics/fenya/sampler/stop
```

Reset analytics:

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/analytics/fenya/reset
```

The default sampler interval is 10 seconds. Set `MOCK_SAMPLER_INTERVAL_MS` to override it or set `MOCK_SAMPLER_AUTOSTART=true` to start it with the backend. Auto-start is disabled by default. The Stream Pulse frontend polls only the analytics endpoint every 10 seconds and keeps its fallback data if the backend is unavailable.

## Mock chat analytics

Chat analytics are mock/local only and do not require real Twitch chat credentials. Data is stored in `server/data/fenya-current-chat.json`; the backend initializes or repairs the file from the mock chat provider when needed.

Run the backend:

```bash
npm run server
```

View current chat analytics:

```text
http://localhost:3001/api/chat/fenya/current-stream
```

Append a mock chat message with PowerShell:

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/chat/fenya/sample
```

Reset chat analytics:

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/chat/fenya/reset
```

The “Зрители и чат” section polls this local endpoint every 10 seconds. If the backend is unavailable, the existing frontend mock chatter data remains active.

Run the frontend separately:

```bash
npm run dev
```

Later, when Twitch Developer credentials are available, the real provider can replace the mock provider without changing the frontend API shape.

## Mock Data

Mock data lives in `src/data/`:

- `mockStreams.js`
- `mockChatters.js`
- `mockModerators.js`
- `mockWords.js`
- `mockEvents.js`

All mock entities have stable IDs and connected references for future hover-linking.

## Repository hygiene / local data

Runtime backend state is written to `server/data/*.json`. These mutable files are ignored by Git, while matching `.example.json` files document safe demo shapes. The storage helpers automatically recreate runtime stream and chat JSON from their mock providers when files are missing or invalid.

This repository intentionally uses one root `package.json` for both the Vite frontend and the local Express mock backend, so `express`, `cors`, and `dotenv` remain root runtime dependencies. Express 5 is used for the local development server; production backend separation and hardening can be handled later if deployment requirements change.

Generated AI-tool configuration copies were removed from the repository root. `AGENTS.md`, project documentation, and the single `.codex` skill configuration remain as the maintained project guidance.

This project intentionally has no production backend, auth, database, WebSocket, real stream tokens, or real Twitch/YouTube/Kick integrations yet. The current backend is a local mock API only.

## Current Sections

- `Hero` with premium cinematic background slot, glass navigation, language switch, and dashboard CTA.
- `SectionRail` powers the desktop left-side floating section rail.
- `BackToTop` powers the floating return control after scrolling.
- `CustomSelect` powers the styled dropdown controls.
- `StreamControlBar` powers selected stream, compare mode, category focus, and export placeholders.
- `DashboardOverview` powers the bottom current stream summary insight cards.
- `FloatingStats` liquid glass analytics cards.
- `StreamPulse` powers the selected stream chart, Brush timeline inspection, comparison line, preview tooltip, event markers, insight cards, and category timeline.
- `StreamDataMap` is reserved for a future real data pipeline view and is not rendered in the current main page.
- `TopChatters` powers the visible Top Chatters leaderboard cards.
- `WordMutationCloud` powers the visible Speech Patterns word cloud.
- `ModeratorUnit` powers the visible Moderator Performance cards.
- `StreamArchive` powers the visible bookshelf-style Stream Archive prototype.
- `ScannerTooltip` reusable scanner hover wrapper with `data-entity-type` and `data-entity-id`.
- `src/i18n/translations.js` contains the lightweight Russian/English translation map.

`LiquidSurfaceBand` and `ExperimentsArena` remain available as future components, but they are not rendered in the current main page flow.

## Future Roadmap

1. Replace the CSS hero background slot with a real premium image/video asset.
2. Replace `LiquidSurfaceBand` with a real WebGL liquid shader when the visual direction is ready.
3. Add full hover-linking between related stream, chatter, word, moderator, and event entities.
4. Expand ExperimentsArena into richer chatter battles, giveaways, and stream experiments.
5. Later connect real stream/chat/moderation APIs.
