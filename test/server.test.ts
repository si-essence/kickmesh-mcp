import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { ApiError, ApiFootballClient, ConnectorError } from "../src/client.js";

const mockFetch = (body: any = { results: 1, paging: { current: 1, total: 1 }, errors: [], response: [{ ok: 1 }] }) =>
  vi.fn(async (_url: string, _init?: any) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

async function setup(opts: any = {}) {
  const fetchImpl = opts.fetchImpl ?? mockFetch();
  const api = new ApiFootballClient({ apiKey: "test", fetchImpl, ...opts });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(a);
  const c = new Client({ name: "t", version: "1" });
  await c.connect(b);
  return { c, fetchImpl, api };
}
const call = (c: Client, name: string, args: any = {}) => c.callTool({ name, arguments: args }) as any;

describe("kickmesh-mcp", () => {
  it("lists all tools", async () => {
    const { c } = await setup();
    const names = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["api_budget","events","fixtures","injuries","latest_news","lineups","list_sources","live_scores","news_search","odds","player_stats","predictions","search_leagues","search_teams","standings","team_stats","transfers"]);
  });

  const cases: [string, any, string][] = [
    ["live_scores", {}, "/fixtures?live=all"],
    ["fixtures", { date: "2024-05-01", league: 39 }, "/fixtures?date=2024-05-01&league=39"],
    ["standings", { league: 39, season: 2024 }, "/standings?league=39&season=2024"],
    ["team_stats", { league: 39, season: 2024, team: 33 }, "/teams/statistics?league=39&season=2024&team=33"],
    ["player_stats", { id: 276, season: 2024 }, "/players?id=276&season=2024"],
    ["lineups", { fixture: 1 }, "/fixtures/lineups?fixture=1"],
    ["events", { fixture: 1 }, "/fixtures/events?fixture=1"],
    ["transfers", { team: 33 }, "/transfers?team=33"],
    ["injuries", { fixture: 1 }, "/injuries?fixture=1"],
    ["odds", { fixture: 1 }, "/odds?fixture=1"],
    ["predictions", { fixture: 1 }, "/predictions?fixture=1"],
    ["search_teams", { query: "manchester" }, "/teams?search=manchester"],
    ["search_leagues", { query: "premier" }, "/leagues?search=premier"],
  ];
  for (const [tool, args, path] of cases)
    it(`${tool} hits ${path} with auth header`, async () => {
      const { c, fetchImpl } = await setup();
      const r = await call(c, tool, args);
      expect(r.isError).toBeFalsy();
      expect(JSON.parse(r.content[0].text).response).toEqual([{ ok: 1 }]);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe("https://v3.football.api-sports.io" + path);
      expect(init.headers["x-apisports-key"]).toBe("test");
    });

  it("caches repeated calls", async () => {
    const { c, fetchImpl } = await setup();
    await call(c, "standings", { league: 39, season: 2024 });
    await call(c, "standings", { league: 39, season: 2024 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("live cache expires after 30s", async () => {
    let t = 1_700_000_000_000;
    const { c, fetchImpl } = await setup({ now: () => t });
    await call(c, "live_scores"); t += 31_000; await call(c, "live_scores");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("enforces daily budget with clear error, resets next UTC day", async () => {
    let t = Date.UTC(2026, 0, 1, 12);
    const { c } = await setup({ dailyLimit: 2, perMinuteLimit: 100, now: () => t });
    await call(c, "lineups", { fixture: 1 });
    await call(c, "lineups", { fixture: 2 });
    const r = await call(c, "lineups", { fixture: 3 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Daily request budget exhausted \(2\/2\)/);
    expect((await call(c, "lineups", { fixture: 1 })).isError).toBeFalsy(); // cached still served
    t += 86_400_000;
    expect((await call(c, "lineups", { fixture: 3 })).isError).toBeFalsy();
  });

  it("enforces per-minute limit", async () => {
    const { c } = await setup({ perMinuteLimit: 1 });
    await call(c, "events", { fixture: 1 });
    const r = await call(c, "events", { fixture: 2 });
    expect(r.content[0].text).toMatch(/Per-minute rate limit/);
  });

  it("syncs budget from x-ratelimit-requests-remaining header", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ errors: [], response: [] }), { headers: { "x-ratelimit-requests-remaining": "10" } }));
    const { c } = await setup({ fetchImpl });
    await call(c, "events", { fixture: 1 });
    expect(JSON.parse((await call(c, "api_budget")).content[0].text).remaining).toBe(10);
  });

  it("search_leagues sends search alone and filters country/season client-side", async () => {
    const body = { errors: [], results: 2, response: [
      { league: { id: 39 }, country: { name: "England" }, seasons: [{ year: 2023 }] },
      { league: { id: 999 }, country: { name: "Ghana" }, seasons: [{ year: 2023 }] }] };
    const { c, fetchImpl } = await setup({ fetchImpl: mockFetch(body) });
    const r = await call(c, "search_leagues", { query: "premier league!", country: "england", season: 2023 });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://v3.football.api-sports.io/leagues?search=premier+league");
    const j = JSON.parse(r.content[0].text);
    expect(j.results).toBe(1); expect(j.response[0].league.id).toBe(39);
  });

  it("search_leagues without query lists by country/season", async () => {
    const { c, fetchImpl } = await setup();
    await call(c, "search_leagues", { country: "England", season: 2023 });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://v3.football.api-sports.io/leagues?country=England&season=2023");
  });

  it("search_teams sends search alone and filters country client-side", async () => {
    const body = { errors: [], response: [{ team: { id: 33, country: "England" } }, { team: { id: 1, country: "Spain" } }] };
    const { c, fetchImpl } = await setup({ fetchImpl: mockFetch(body) });
    const r = await call(c, "search_teams", { query: "manchester", country: "England" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://v3.football.api-sports.io/teams?search=manchester");
    expect(JSON.parse(r.content[0].text).response.map((x: any) => x.team.id)).toEqual([33]);
  });

  it("rejects search queries with <3 alphanumerics without calling the API", async () => {
    const { c, fetchImpl } = await setup();
    const r = await call(c, "search_teams", { query: "a!!" });
    expect(r.isError).toBe(true); expect(fetchImpl).not.toHaveBeenCalled();
  });

  const planLimitMessage =
    "Your API-Football plan does not cover this request. The free plan covers seasons 2022 to 2024 only. Live and current-season data, and the next/last match filters, need a paid API-Football plan on your own key.";

  async function planLimitError(errors: unknown, params: Record<string, string | number>) {
    const api = new ApiFootballClient({
      apiKey: "unit-test-key",
      fetchImpl: mockFetch({ errors, response: [] }),
    });
    const error = await api.get("fixtures", params).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ConnectorError);
    const typed = error as ConnectorError;
    expect(typed.code).toBe("plan_limit");
    expect(typed.message).toBe(planLimitMessage);
    expect(typed.message).not.toContain("unit-test-key");
    return typed;
  }

  it("maps a free-plan season error to plan_limit", async () => {
    const errors = { plan: "Free plans do not have access to this season, try from 2022 to 2024." };
    await planLimitError(errors, { league: 39, season: 2025 });
    const { c } = await setup({ fetchImpl: mockFetch({ errors, response: [] }) });
    const r = await call(c, "fixtures", { league: 39, season: 2025 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(planLimitMessage);
  });

  it("maps a free-plan next/last error to plan_limit", async () => {
    const errors = ["The next and last filters are not available on this account."];
    await planLimitError(errors, { next: 5 });
    const { c } = await setup({ fetchImpl: mockFetch({ errors, response: [] }) });
    const r = await call(c, "fixtures", { last: 3 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(planLimitMessage);
  });

  it("leaves other upstream errors unchanged", async () => {
    const errors = { token: "Invalid key" };
    const api = new ApiFootballClient({
      apiKey: "unit-test-key",
      fetchImpl: mockFetch({ errors, response: [] }),
    });
    const error = await api.get("fixtures", { id: 1 }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ConnectorError);
    expect((error as ApiError).message).toBe(`API-Football error: ${JSON.stringify(errors)}`);
    expect((error as ApiError).message).not.toContain(planLimitMessage);
  });

  it("surfaces API errors and missing key", async () => {
    const { c } = await setup({ fetchImpl: mockFetch({ errors: { token: "Invalid key" }, response: [] }) });
    expect((await call(c, "events", { fixture: 1 })).content[0].text).toMatch(/Invalid key/);
    const api = new ApiFootballClient({ apiKey: "", fetchImpl: mockFetch() });
    (api as any).apiKey = undefined;
    await expect(api.get("teams", {})).rejects.toThrow(/API_FOOTBALL_KEY/);
  });
});
