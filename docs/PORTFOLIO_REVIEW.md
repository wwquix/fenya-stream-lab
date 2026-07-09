# Portfolio Review

## What recruiters should notice

- Fenya Stream Lab is a cohesive analytics product, not a loose component gallery.
- The default mock mode is complete, deterministic, and safe to demo without Twitch credentials.
- Real Twitch mode is implemented honestly: it shows collected rows and clear empty states instead of mixing in demo data.
- The project demonstrates frontend polish, backend contracts, SQLite persistence, authentication/session foundations, live ingest, replay, imports, reports, documentation, and tests in one JavaScript codebase.

## Architecture summary

```text
React/Vite UI -> hooks/adapters -> Express routes -> services/providers -> repositories -> SQLite
                                      |                  |
                                      |                  +-> Twitch Helix/EventSub where configured
                                      +-> SSE replay and local report endpoints
```

Mock providers keep the portfolio demo stable. Twitch provider work is isolated behind explicit `TWITCH_PROVIDER=twitch`, OAuth/channel identity, and channel-scoped API routes.

## Key technical decisions

- Keep React + Vite + JavaScript and regular CSS to make the project easy to inspect.
- Preserve mock mode as the default portfolio path.
- Use SQLite for a realistic local persistence layer without requiring hosted infrastructure.
- Keep roles derived from Twitch identity/channel ownership rather than manual UI switches.
- Separate process-local runtime counters from persisted analytics totals.
- Return `204 No Content` for missing real-mode analytics instead of falling back to mock data.
- Use small local hardening middleware rather than adding a broad security framework.

## Safe limitations

- Live collection only runs while the backend process is active.
- Replay, ingest sockets, and sampler timers are process-local.
- SQLite is suitable for local/demo deployment, not a distributed analytics cluster.
- VOD rows are metadata-only unless matched to internally collected stream analytics.
- Moderator action analytics are future work; the current Twitch moderator feature is a directory sync.

## Screenshots checklist

1. Desktop mock dashboard at 1440px showing hero, Stream Pulse, and summary cards.
2. Mobile dashboard around 390px showing no horizontal overflow.
3. Top chatters, word cloud, and moderator workload in mock mode.
4. Stream archive with readable Russian titles.
5. Import panel with JSON/CSV controls.
6. Real Twitch mode empty/offline state with no fake demo fallback.
7. Channel onboarding panel showing derived role badges.

Review screenshots for private Twitch account data, local file paths, tokens, cookies, and browser extensions before publishing.

## Two-minute walkthrough script

1. Open the mock dashboard and explain that it is the safe default portfolio mode.
2. Show Stream Pulse, top chatters, word cloud, moderation, archive, and summary to demonstrate product breadth.
3. Start Replay Mode briefly to show event playback and SSE-backed state.
4. Open Import Data and explain validated JSON/CSV ingestion into SQLite.
5. Show the channel onboarding/Twitch section and explain the real-mode rule: only collected Twitch rows appear.
6. Close with the backend story: Express routes, services/providers, repositories, SQLite, tests, CI, and production safety defaults.
