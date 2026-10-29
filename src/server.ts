import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiFootballClient } from "./client.js";
import { NewsService } from "./news.js";

const season = z.number().int().describe("Season year, e.g. 2024");
const id = (d: string) => z.number().int().describe(d);

export function createServer(client = new ApiFootballClient(), news?: NewsService) {
  const server = new McpServer({ name: "kickmesh-mcp", version: "0.1.0" });
  const newsSvc = news ?? new NewsService({ extraTerms: () => client.cachedNames() });
  const reg = (name: string, description: string, shape: z.ZodRawShape, endpoint: string, map: (a: any) => Record<string, any> = (a) => a, ttlKey?: string) =>
    server.registerTool(name, { description, inputSchema: shape }, async (args: any) => {
      try {
        const data = await client.get(endpoint, map(args), ttlKey ?? endpoint);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text" as const, text: `${e.name === "BudgetError" ? "[budget] " : ""}${e.message}` }] };
      }
    });

  reg("live_scores", "Live fixtures in progress, optionally filtered by league ids", { leagues: z.string().optional().describe("League ids joined by '-', e.g. '39-140'") },
    "fixtures", (a) => ({ live: a.leagues || "all" }), "fixtures:live");
  reg("fixtures", "Fixtures by date, league, team, season (at least one filter)", {
    date: z.string().optional().describe("YYYY-MM-DD"), league: id("League id").optional(), team: id("Team id").optional(),
    season: season.optional(), from: z.string().optional(), to: z.string().optional(), next: z.number().int().optional(), last: z.number().int().optional(),
    status: z.string().optional(), timezone: z.string().optional() }, "fixtures");
  reg("standings", "League standings", { league: id("League id"), season }, "standings");
  reg("team_stats", "Team statistics for a league season", { league: id("League id"), season, team: id("Team id") }, "teams/statistics");
  reg("player_stats", "Player statistics by player id, team, or league + search", {
    id: id("Player id").optional(), team: id("Team id").optional(), league: id("League id").optional(), season, search: z.string().optional(), page: z.number().int().optional() }, "players");
  reg("lineups", "Lineups for a fixture", { fixture: id("Fixture id") }, "fixtures/lineups");
  reg("events", "Events (goals, cards, subs) for a fixture", { fixture: id("Fixture id") }, "fixtures/events");
  reg("transfers", "Transfers by player or team", { player: id("Player id").optional(), team: id("Team id").optional() }, "transfers");
  reg("injuries", "Injuries by league/season, team, fixture, or date", {
    league: id("League id").optional(), season: season.optional(), team: id("Team id").optional(), fixture: id("Fixture id").optional(), date: z.string().optional() }, "injuries");
  reg("odds", "Pre-match odds", { fixture: id("Fixture id").optional(), league: id("League id").optional(), season: season.optional(), date: z.string().optional(), bookmaker: z.number().int().optional(), bet: z.number().int().optional() }, "odds");
  reg("predictions", "Predictions for a fixture", { fixture: id("Fixture id") }, "predictions");
  const clean = (q: string) => q.replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  const norm = (x: unknown) => String(x ?? "").toLowerCase();
  // API-Football rejects/empties `search` combined with other filters, so send search alone and filter client-side.
  const search = (name: string, description: string, shape: z.ZodRawShape, endpoint: string,
    build: (a: any) => Record<string, any>, filter: (a: any, item: any) => boolean) =>
    server.registerTool(name, { description, inputSchema: shape }, async (args: any) => {
      try {
        if (args.query !== undefined && clean(args.query).length < 3)
          throw new Error("query must have at least 3 letters/digits (API-Football search accepts only alphanumerics and spaces)");
        const data: any = await client.get(endpoint, build(args), endpoint);
        const response = (data.response ?? []).filter((it: any) => filter(args, it));
        return { content: [{ type: "text" as const, text: JSON.stringify({ ...data, results: response.length, response }) }] };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text" as const, text: `${e.name === "BudgetError" ? "[budget] " : ""}${e.message}` }] };
      }
    });
  search("search_teams", "Search teams by name (min 3 alphanumeric chars); optional country filter applied client-side", { query: z.string().min(3), country: z.string().optional() }, "teams",
    (a) => ({ search: clean(a.query) }),
    (a, it) => !a.country || norm(it?.team?.country) === norm(a.country));
  search("search_leagues", "Search leagues/cups by name, or list by country/season. With a query, country/season are filtered client-side", { query: z.string().min(3).optional(), country: z.string().optional(), season: season.optional() }, "leagues",
    (a) => a.query ? { search: clean(a.query) } : { country: a.country, season: a.season },
    (a, it) => !a.query || ((!a.country || norm(it?.country?.name) === norm(a.country)) &&
      (!a.season || (it?.seasons ?? []).some((s: any) => s.year === a.season))));

  server.registerTool("api_budget", { description: "Show local daily/minute request budget usage (no API call)", inputSchema: {} },
    async () => ({ content: [{ type: "text" as const, text: JSON.stringify(client.budget()) }] }));

  const newsOk = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
  const newsErr = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] });
  server.registerTool("latest_news", {
    description: "Latest headlines from configured public football RSS feeds. Optional filters: source, team, league, keyword, limit. Uses feed descriptions only and does not spend the API-Football budget.",
    inputSchema: {
      source: z.string().optional().describe("Source name or fragment, e.g. BBC or Sky Sports"),
      team: z.string().optional().describe("Team name or alias, e.g. Arsenal or Man Utd"),
      league: z.string().optional().describe("League or competition, e.g. Premier League"),
      keyword: z.string().optional().describe("Case-insensitive substring of title, summary, source, or tags"),
      limit: z.number().int().min(1).max(50).optional().describe("Max items to return (default 20, max 50)"),
    },
  }, async (args) => {
    try { return newsOk(await newsSvc.latest(args)); }
    catch (e) { return newsErr(e); }
  });
  server.registerTool("news_search", {
    description: "Search cached football headlines by query. Optional source and limit. Does not spend the API-Football budget.",
    inputSchema: {
      query: z.string().min(2).describe("Search text (title, summary, tags, source, or a known team/league alias)"),
      source: z.string().optional().describe("Source name or fragment"),
      limit: z.number().int().min(1).max(50).optional().describe("Max items to return (default 20, max 50)"),
    },
  }, async (args) => {
    try { return newsOk(await newsSvc.search(args.query, args)); }
    catch (e) { return newsErr(e); }
  });
  server.registerTool("list_sources", {
    description: "List configured football RSS feeds with homepage, status, last fetch time, and item count.",
    inputSchema: {},
  }, async () => {
    try {
      await newsSvc.ensureFresh();
      return newsOk({ sources: newsSvc.listSources() });
    } catch (e) { return newsErr(e); }
  });
  return server;
}
