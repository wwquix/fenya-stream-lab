# Fenya Stream Lab — Codex Instructions

This is a React + Vite + JavaScript project.

## Product direction

Fenya Stream Lab is a premium streamer analytics dashboard for streamer Fenya.

The site focuses on:
- stream analytics;
- viewer timeline;
- chat activity;
- streamer speech / frequent words;
- top chatters;
- moderator performance;
- stream archive;
- future reports and exports.

The visual direction is premium analytics / fintech dashboard:
- dark glass panels;
- calm spacing;
- clean typography;
- subtle lime/cyan/purple accents;
- no cheap neon;
- no aggressive gaming UI;
- no random white stripes or broken glare effects.

## Technical constraints

Do not convert the project to TypeScript.
Do not add Tailwind CSS unless explicitly requested.
Do not add shadcn unless explicitly requested.
Do not add backend, database, authentication, real APIs, real tokens, WebSocket, Twitch/Kick/YouTube integrations, Three.js, Spline, WebGL, or shader effects unless explicitly requested.

Keep React + Vite + JavaScript.
Keep regular CSS unless explicitly requested.
Keep mock data only for now.

## Language rules

Default UI language is Russian.
The site should support Russian and English.
All new visible UI strings must use the existing translation system if one exists.

Keep the project name “Fenya Stream Lab” unchanged.
Do not translate usernames.
Do not translate category names like CS2 or Minecraft unless there is already a translated label system.

## Work style

Work on one focused task at a time.
Do not refactor unrelated files.
Do not redesign the whole site unless explicitly requested.
Do not change chart logic unless the task is specifically about the chart.
Do not change unrelated sections while fixing one section.

Before changing code:
- inspect the relevant component and data files;
- understand the current structure;
- make minimal, high-confidence changes.

After changing code:
- run npm run build;
- fix only errors related to the current task;
- report changed files;
- report what was fixed;
- report whether npm run build passed.

## Current project priorities

1. Finish streamer word cloud.
2. Make summary cards meaningful and readable.
3. Improve top chatters with sorting and profile drawer.
4. Improve moderator performance with leaderboard and workload.
5. Improve stream archive into a premium bookshelf/session volume UI.
6. Add subtle premium animations and micro-interactions.
7. Only later consider Motion-based animations.
