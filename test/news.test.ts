import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiFootballClient } from "../src/client.js";
import { createServer } from "../src/server.js";
import {
  FEEDS,
  NewsService,
  REFRESH_MS,
  dedupeItems,
  normalizeLink,
  normalizeTitle,
  parseFeedXml,
  summarize,
  tagText,
} from "../src/news.js";

const dir = dirname(fileURLToPath(import.meta.url));
const rss = readFileSync(join(dir, "fixtures/rss-sample.xml"), "utf8");
const atom = readFileSync(join(dir, "fixtures/atom-sample.xml"), "utf8");
const longSummary = readFileSync(join(dir, "fixtures/long-summary.xml"), "utf8");

const alpha = { name: "Alpha FC", url: "https://alpha.example/rss.xml", homepage: "https://alpha.example" };
const beta = { name: "Beta FC", url: "https://beta.example/rss.xml", homepage: "https://beta.example" };

function xmlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/xml; charset=utf-8" } });
}

const timers: NewsService[] = [];
afterEach(() => {
  for (const svc of timers) svc.stop();
  timers.length = 0;
});

describe("rss parsing", () => {
  it("parses RSS items, dates, links, and description-only summaries", () => {
    const items = parseFeedXml(rss);
    expect(items.map((i) => i.title)).toEqual([
      "Arsenal beat Chelsea in the Premier League",
      "Man Utd draw with Liverpool",
      "Encoded only",
      "Spaced title",
    ]);
    expect(items[0].link).toBe("https://Example.com/a/Story/?utm=rss&x=1#top");
    expect(items[0].publishedAt).toBe("2026-10-16T15:30:00.000Z");
    expect(items[0].summary).toBe("Arsenal won a thriller. Chelsea had chances.");
    expect(items[0].summary).not.toMatch(/third|Zebras|FULL BODY/i);
    expect(items[1].summary).toBe("Ten-man Man Utd held on. Liverpool will look back on missed chances.");
    expect(items[1].publishedAt).toBe("2026-10-16T12:00:00.000Z");
    expect(items[2].summary).toBe("");
    expect(items[2].summary).not.toMatch(/full body/i);
    expect(items[3].link).toBe("https://example.com/spaced/");
    expect(items[3].publishedAt).toBe("");
  });

  it("parses Atom entries and prefers the alternate link over rel=self", () => {
    const [item] = parseFeedXml(atom);
    expect(item.title).toBe("Barcelona & Atletico Madrid in La Liga");
    expect(item.link).toBe("https://atom.example/barca");
    expect(item.publishedAt).toBe("2026-05-02T10:15:00.000Z");
    expect(item.summary).toBe("Barcelona won away. Atletico Madrid responded late.");
    expect(item.summary).not.toMatch(/ignored|Extra/);
  });

  it("trims summaries to two sentences and about 300 characters", () => {
    const [item] = parseFeedXml(longSummary);
    expect(item.summary).toBe("Hello & welcome to the match report. This is the second sentence about Arsenal.");
    expect(item.summary).not.toMatch(/secret|Third|<|amp;/);
    expect(summarize("<p>One. Two. Three.</p>")).toBe("One. Two.");
    expect(summarize("Born in 2009. Second sentence here. Third one.")).toBe("Born in 2009. Second sentence here.");
    expect(summarize("Leaders of the 2. Bundesliga won again. Second. Third.")).toBe("Leaders of the 2. Bundesliga won again. Second.");
    expect(summarize("Mr. Smith scored. Then left. Third.")).toBe("Mr. Smith scored. Then left.");
    expect(summarize("Hello&nbsp;world. Second sentence. Third sentence.")).toBe("Hello world. Second sentence.");
    expect(summarize("&lt;p&gt;Tom &amp;amp; Jerry&#8217;s goal. Second. Third.&lt;/p&gt;")).toBe("Tom & Jerry’s goal. Second.");
    const long = summarize(`<p>${"word ".repeat(120)}finish.</p>`);
    expect(long.length).toBeLessThanOrEqual(300);
    expect(long.endsWith("…")).toBe(true);
    expect(long.startsWith("word ")).toBe(true);
    expect(long).not.toMatch(/<p>|finish/);
  });

  it("rejects documents that are not feeds", () => {
    expect(() => parseFeedXml("<html><title>nope</title></html>")).toThrow(/not RSS or Atom/);
  });
});

describe("dedupe, links, and tags", () => {
  it("normalizes links and titles", () => {
    expect(normalizeLink("https://WWW.Example.com/a/Story/?utm=1#x")).toBe("https://www.example.com/a/Story");
    expect(normalizeLink("https://example.com/a/Story/")).toBe("https://example.com/a/Story");
    expect(normalizeTitle("Arsenal Win!")).toBe("arsenal win");
    expect(normalizeTitle("  Arsenal   win ")).toBe("arsenal win");
  });

  it("dedupes by normalized link or normalized title, keeping the newest", () => {
    const linkDupes = dedupeItems([
      { title: "Totally Different", link: "https://example.com/a/Story", publishedAt: "2026-01-01T00:00:00.000Z" },
      { title: "Unique Alpha Story", link: "https://Example.com/a/Story/?utm=rss#top", publishedAt: "2026-06-01T00:00:00.000Z" },
    ]);
    expect(linkDupes).toHaveLength(1);
    expect(linkDupes[0].title).toBe("Unique Alpha Story");

    const titleDupes = dedupeItems([
      { title: "Transfer Roundup!", link: "https://a.example/1", publishedAt: "2026-01-01T00:00:00.000Z" },
      { title: "transfer   roundup", link: "https://b.example/2", publishedAt: "2026-06-01T00:00:00.000Z" },
    ]);
    expect(titleDupes.map((i) => i.link)).toEqual(["https://b.example/2"]);
  });

  it("tags clubs and leagues with aliases and word boundaries", () => {
    expect(tagText("Arsenal beat Chelsea in the Premier League")).toEqual({
      teams: ["Arsenal", "Chelsea"],
      leagues: ["Premier League"],
    });
    expect(tagText("Man Utd draw at Liverpool").teams).toEqual(["Liverpool", "Manchester United"]);
    expect(tagText("Barça win LaLiga").teams).toContain("Barcelona");
    expect(tagText("Barça win LaLiga").leagues).toEqual(["La Liga"]);
    expect(tagText("International friendlies continue").teams).not.toContain("Inter Milan");
    expect(tagText("The Arsenalicious experiment").teams).toEqual([]);
    expect(tagText("2. Bundesliga leaders").leagues).toEqual(["2. Bundesliga"]);
    expect(tagText("UEFA Europa Conference League draw").leagues).toEqual(["Conference League"]);
    expect(tagText("Sunderland AFC win the Vanarama National League", {
      teams: ["Sunderland AFC", "City"],
      leagues: ["Vanarama National League"],
    })).toEqual({
      teams: ["Sunderland AFC"],
      leagues: ["Vanarama National League"],
    });
  });
});

describe("NewsService", () => {
  it("lists configured public feeds", () => {
    const urls = FEEDS.map((f) => f.url);
    expect(urls).toContain("https://feeds.bbci.co.uk/sport/football/rss.xml");
    expect(urls).toContain("https://www.skysports.com/rss/12040");
    expect(urls).toContain("https://www.espn.com/espn/rss/soccer/news");
    expect(urls).toContain("https://www.theguardian.com/football/rss");
    expect(FEEDS.every((f) => f.name && f.homepage && f.url)).toBe(true);
  });

  it("stays idle until a refresh is requested", async () => {
    const fetchImpl = vi.fn();
    const svc = new NewsService({ feeds: [alpha], fetchImpl });
    expect(svc.listSources()).toEqual([{
      name: "Alpha FC", url: alpha.url, homepage: alpha.homepage, status: "idle", lastFetch: null, itemCount: 0,
    }]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("filters, searches, and limits merged headlines", async () => {
    const fetchImpl = vi.fn(async () => xmlResponse(rss));
    const svc = new NewsService({
      feeds: [alpha],
      fetchImpl,
      extraTerms: () => ({ teams: ["Sunderland AFC"], leagues: [] }),
    });
    const all = await svc.latest({ limit: 10 });
    expect(all.items.map((i) => i.source)).toEqual(["Alpha FC", "Alpha FC", "Alpha FC", "Alpha FC"]);
    expect(all.items[0].tags).toEqual({ teams: ["Arsenal", "Chelsea"], leagues: ["Premier League"] });
    expect(all.items.map((i) => i.title)[0]).toBe("Arsenal beat Chelsea in the Premier League");

    const byTeam = await svc.latest({ team: "Man Utd" });
    expect(byTeam.items.map((i) => i.title)).toEqual(["Man Utd draw with Liverpool"]);
    const byLeague = await svc.latest({ league: "Premier League" });
    expect(byLeague.items).toHaveLength(1);
    const byKeyword = await svc.latest({ keyword: "thriller" });
    expect(byKeyword.items).toHaveLength(1);
    const bySource = await svc.latest({ source: "alpha", limit: 1 });
    expect(bySource.count).toBe(1);
    expect(bySource.items[0].title).toMatch(/Arsenal/);

    const found = await svc.search("gunners");
    expect(found.items.map((i) => i.title)).toEqual(["Arsenal beat Chelsea in the Premier League"]);
    const none = await svc.search("zzzz", { source: "Alpha FC" });
    expect(none.items).toEqual([]);
    await expect(svc.search(" ")).rejects.toThrow(/at least 2/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refreshes lazily when the cache is stale and not before", async () => {
    let t = 1_700_000_000_000;
    const fetchImpl = vi.fn(async () => xmlResponse(rss));
    const svc = new NewsService({ feeds: [alpha], fetchImpl, now: () => t });
    await svc.latest();
    await svc.search("arsenal");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t += REFRESH_MS;
    await svc.latest();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/kickmesh-mcp/);
    expect(JSON.stringify(headers)).not.toMatch(/apisports/i);
  });

  it("keeps other feeds when one fails and retains the last good items", async () => {
    let betaOk = true;
    let t = 1_700_000_000_000;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("beta")) {
        if (!betaOk) return xmlResponse("nope", 503);
        return xmlResponse(`<?xml version="1.0"?><rss><channel><item>
          <title>Beta exclusive: Sunderland AFC win</title>
          <link>https://beta.example/story</link>
          <description>Sunderland AFC won away.</description>
          <pubDate>Sat, 17 Oct 2026 10:00:00 GMT</pubDate>
        </item></channel></rss>`);
      }
      return xmlResponse(rss);
    });
    const svc = new NewsService({
      feeds: [alpha, beta],
      fetchImpl,
      now: () => t,
      extraTerms: () => { throw new Error("cache broke"); },
    });
    const first = await svc.latest({ limit: 50 });
    expect(first.items.some((i) => i.source === "Alpha FC")).toBe(true);
    expect(first.items.some((i) => i.title.includes("Sunderland"))).toBe(true);
    expect(svc.listSources().map((s) => s.status)).toEqual(["ok", "ok"]);

    betaOk = false;
    t += REFRESH_MS;
    const second = await svc.latest({ limit: 50, team: "Sunderland AFC" });
    expect(second.items).toHaveLength(1);
    const sources = svc.listSources();
    expect(sources[0]).toMatchObject({ name: "Alpha FC", status: "ok", itemCount: 4 });
    expect(sources[1]).toMatchObject({ name: "Beta FC", status: "error", itemCount: 1 });
    expect(sources[1].error).toMatch(/HTTP 503/);
    expect(first.items.find((i) => i.title.includes("Arsenal"))?.tags.teams).toContain("Arsenal");
  });

  it("starts a single unref'd interval at the refresh period", () => {
    const svc = new NewsService({ feeds: [alpha], fetchImpl: vi.fn() });
    timers.push(svc);
    const spy = vi.spyOn(global, "setInterval");
    try {
      svc.start();
      svc.start();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(expect.any(Function), REFRESH_MS);
      const handle = spy.mock.results[0].value as NodeJS.Timeout;
      expect(handle.hasRef()).toBe(false);
    } finally {
      spy.mockRestore();
      svc.stop();
    }
  });
});

describe("news tools", () => {
  it("registers tools and serves news without touching the API-Football client", async () => {
    const apiFetch = vi.fn();
    const api = new ApiFootballClient({
      apiKey: "test",
      fetchImpl: apiFetch as typeof fetch,
    });
    // Prime the name cache on a separate client so the news server's client never fetches.
    const primed = new ApiFootballClient({
      apiKey: "test",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        errors: [],
        response: [{ team: { name: "Sunderland AFC" }, league: { name: "Vanarama National League" } }],
      }), { status: 200 })),
    });
    await primed.get("teams", { search: "sunderland" });
    expect(primed.cachedNames()).toEqual({ teams: ["Sunderland AFC"], leagues: ["Vanarama National League"] });

    const newsFetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).not.toMatch(/api-sports\.io/);
      return xmlResponse(rss);
    });
    const news = new NewsService({ feeds: [alpha], fetchImpl: newsFetch, extraTerms: () => primed.cachedNames() });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer(api, news).connect(a);
    const c = new Client({ name: "t", version: "1" });
    await c.connect(b);

    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["latest_news", "news_search", "list_sources"]));
    const latestTool = (await c.listTools()).tools.find((t) => t.name === "latest_news");
    expect(Object.keys(latestTool?.inputSchema?.properties ?? {}).sort()).toEqual(["keyword", "league", "limit", "source", "team"]);
    const searchTool = (await c.listTools()).tools.find((t) => t.name === "news_search");
    expect(searchTool?.inputSchema?.required).toContain("query");

    const listed = await c.callTool({ name: "list_sources", arguments: {} }) as any;
    const sources = JSON.parse(listed.content[0].text).sources;
    expect(sources[0]).toMatchObject({ name: "Alpha FC", homepage: alpha.homepage, status: "ok", itemCount: 4 });

    const latest = await c.callTool({ name: "latest_news", arguments: { team: "Chelsea", limit: 5 } }) as any;
    expect(latest.isError).toBeFalsy();
    const body = JSON.parse(latest.content[0].text);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      title: "Arsenal beat Chelsea in the Premier League",
      source: "Alpha FC",
      publishedAt: "2026-10-16T15:30:00.000Z",
    });
    expect(body.items[0].tags.teams).toEqual(["Arsenal", "Chelsea"]);

    const searched = await c.callTool({ name: "news_search", arguments: { query: "spaced", source: "alpha" } }) as any;
    expect(JSON.parse(searched.content[0].text).items.map((i: any) => i.title)).toEqual(["Spaced title"]);

    expect(apiFetch).not.toHaveBeenCalled();
    expect(api.budget().used).toBe(0);
    expect(newsFetch.mock.calls.length).toBeGreaterThan(0);
  });
});
