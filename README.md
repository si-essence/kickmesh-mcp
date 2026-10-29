# kickmesh-mcp (Kickmesh MCP connector)

MCP server for [API-Football](https://www.api-football.com) v3 (`https://v3.football.api-sports.io`). TypeScript, official `@modelcontextprotocol/sdk`, stdio + Streamable HTTP.

## Setup
```bash
npm install && npm run build
export API_FOOTBALL_KEY=your_key   # free key: https://dashboard.api-football.com
npm start                 # stdio
npm run start:http        # Streamable HTTP at http://localhost:3000/mcp (PORT to change), /health
npm test                  # mocked tests, no key needed
```

The free API-Football plan covers seasons 2022–2024 only. Live and current-season data (plus next/last match filters) needs your own paid API-Football plan.

Claude Desktop / any stdio client:
```json
{ "mcpServers": { "kickmesh-mcp": { "command": "node", "args": ["/absolute/path/to/kickmesh-mcp/dist/index.js"], "env": { "API_FOOTBALL_KEY": "..." } } } }
```

Docker: `docker build -t kickmesh-mcp . && docker run -p 3000:3000 -e API_FOOTBALL_KEY=... kickmesh-mcp`

## Tools
live_scores, fixtures, standings, team_stats, player_stats, lineups, events, transfers, injuries, odds, predictions, search_teams, search_leagues, api_budget (local usage, no API call).

Football headlines (public RSS, no API-Football quota): latest_news, news_search, list_sources.

## Football news
`latest_news` returns recent items from free public feeds. Optional filters: `source`, `team`, `league`, `keyword`, `limit` (default 20, max 50). `news_search` takes a `query` plus optional `source` and `limit`. `list_sources` lists each feed's name, URL, homepage, status, last fetch time, and item count.

Each item has `title`, `summary`, `source`, `publishedAt` (ISO), `link`, and `tags` (`teams`, `leagues`). The summary is the feed `<description>` or Atom `<summary>` only: HTML stripped, at most two sentences, trimmed to about 300 characters. Article pages are never downloaded, and `content:encoded` / Atom `<content>` is ignored.

Feeds (checked live; `User-agent: *` does not disallow these paths):

| Source | Feed |
| --- | --- |
| BBC Sport | https://feeds.bbci.co.uk/sport/football/rss.xml |
| Sky Sports | https://www.skysports.com/rss/12040 |
| ESPN | https://www.espn.com/espn/rss/soccer/news |
| The Guardian | https://www.theguardian.com/football/rss |
| The Independent | https://www.independent.co.uk/sport/football/rss |
| CBS Sports | https://www.cbssports.com/rss/headlines/soccer/ |

The in-memory cache refreshes on an unref'd 12-minute interval while the process is running, and again on demand when a news tool is called and the cache is stale. Items are deduped by normalized link (lowercase host, no query, hash, or trailing slash) and by normalized title. A feed that fails does not drop the others; its last good items stay available and `list_sources` shows the error. Team and league tags come from a club/competition dictionary (aliases, word boundaries). Names already sitting in the API-Football response cache are included when they match, without a new API call. News fetches use plain `fetch` and do not touch the daily or per-minute budget.

`npm run check:news` (after `npm run build`) fetches each feed once and prints ok/fail and item counts.

Caveats: Sky's `12040` feed is general Sky Sports news, so non-football items appear. Tagging can miss a club or match the wrong one. Identical headlines collapse even when the stories differ. Publisher terms still apply — BBC and Guardian robots/terms restrict scraping, AI/RAG, and commercial reuse; ESPN and CBS disallow some AI crawler user-agents. This server is for local reading of the public feed documents. The cache resets on restart.

## Caching & rate limits (free plan: 100 req/day)
- In-memory TTL cache per endpoint: live 30s, events 60s, fixtures 5m, lineups 10m, odds 30m, standings/stats/players/injuries/predictions 1h, teams/leagues/transfers 24h. Cache hits cost no budget.
- Daily budget counter (default 100, resets 00:00 UTC, synced from `x-ratelimit-requests-remaining`), and per-minute limit (default 10).
- When exhausted, tools return `isError` with a `[budget]` message; cached data is still served.
- Env overrides: `API_FOOTBALL_DAILY_LIMIT`, `API_FOOTBALL_PER_MINUTE_LIMIT`, `API_FOOTBALL_BASE_URL`, `MCP_TRANSPORT=http`, `PORT`.
- News RSS refresh is separate from that budget (12 minutes, in-memory).
- Counters and cache are in-memory; they reset on restart (the header sync corrects the daily count on the next call).

## License

MIT, see [LICENSE](LICENSE). This is an independent, unofficial connector and is not endorsed by the Kickmesh project or its owners.
