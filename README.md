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
