/** Public football RSS/Atom headlines. Plain fetch only — never the API-Football client. */

export const REFRESH_MS = 12 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_000_000;
const MAX_ITEMS_PER_FEED = 100;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SUMMARY_CHARS = 300;

export interface FeedSource {
  name: string;
  url: string;
  homepage: string;
}

export interface NewsItem {
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  link: string;
  tags: { teams: string[]; leagues: string[] };
}

export interface SourceStatus {
  name: string;
  url: string;
  homepage: string;
  status: "idle" | "ok" | "error";
  lastFetch: string | null;
  itemCount: number;
  error?: string;
}

export interface ParsedItem {
  title: string;
  summary: string;
  publishedAt: string;
  link: string;
}

interface StoredItem extends ParsedItem {
  source: string;
}

interface Term {
  name: string;
  aliases: string[];
}

/** Verified public football RSS feeds. Paths are allowed for User-agent * in each site's robots.txt. */
export const FEEDS: FeedSource[] = [
  { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", homepage: "https://www.bbc.co.uk/sport/football" },
  { name: "Sky Sports", url: "https://www.skysports.com/rss/12040", homepage: "https://www.skysports.com" },
  { name: "ESPN", url: "https://www.espn.com/espn/rss/soccer/news", homepage: "https://www.espn.com/soccer/" },
  { name: "The Guardian", url: "https://www.theguardian.com/football/rss", homepage: "https://www.theguardian.com/football" },
  { name: "The Independent", url: "https://www.independent.co.uk/sport/football/rss", homepage: "https://www.independent.co.uk/sport/football" },
  { name: "CBS Sports", url: "https://www.cbssports.com/rss/headlines/soccer/", homepage: "https://www.cbssports.com/soccer/" },
];

const CLUBS: Term[] = [
  { name: "Arsenal", aliases: ["Arsenal", "Gunners"] },
  { name: "Aston Villa", aliases: ["Aston Villa"] },
  { name: "Bournemouth", aliases: ["AFC Bournemouth", "Bournemouth"] },
  { name: "Brentford", aliases: ["Brentford"] },
  { name: "Brighton", aliases: ["Brighton & Hove Albion", "Brighton and Hove Albion", "Brighton"] },
  { name: "Chelsea", aliases: ["Chelsea"] },
  { name: "Crystal Palace", aliases: ["Crystal Palace"] },
  { name: "Everton", aliases: ["Everton", "Toffees"] },
  { name: "Fulham", aliases: ["Fulham"] },
  { name: "Ipswich Town", aliases: ["Ipswich Town", "Ipswich"] },
  { name: "Leicester City", aliases: ["Leicester City", "Leicester"] },
  { name: "Liverpool", aliases: ["Liverpool"] },
  { name: "Manchester City", aliases: ["Manchester City", "Man City"] },
  { name: "Manchester United", aliases: ["Manchester United", "Man United", "Man Utd", "Manchester Utd"] },
  { name: "Newcastle United", aliases: ["Newcastle United", "Newcastle"] },
  { name: "Nottingham Forest", aliases: ["Nottingham Forest", "Nott'm Forest"] },
  { name: "Southampton", aliases: ["Southampton"] },
  { name: "Tottenham", aliases: ["Tottenham Hotspur", "Tottenham", "Spurs"] },
  { name: "West Ham", aliases: ["West Ham United", "West Ham", "Hammers"] },
  { name: "Wolves", aliases: ["Wolverhampton Wanderers", "Wolverhampton", "Wolves"] },
  { name: "Leeds United", aliases: ["Leeds United", "Leeds"] },
  { name: "Real Madrid", aliases: ["Real Madrid"] },
  { name: "Barcelona", aliases: ["FC Barcelona", "Barcelona", "Barca", "Barça"] },
  { name: "Atletico Madrid", aliases: ["Atlético Madrid", "Atletico Madrid", "Atlético de Madrid", "Atletico de Madrid"] },
  { name: "Athletic Bilbao", aliases: ["Athletic Bilbao", "Athletic Club"] },
  { name: "Real Sociedad", aliases: ["Real Sociedad"] },
  { name: "Real Betis", aliases: ["Real Betis", "Betis"] },
  { name: "Villarreal", aliases: ["Villarreal"] },
  { name: "Sevilla", aliases: ["Sevilla"] },
  { name: "Valencia", aliases: ["Valencia"] },
  { name: "Girona", aliases: ["Girona"] },
  { name: "Juventus", aliases: ["Juventus", "Juve"] },
  { name: "Inter Milan", aliases: ["Inter Milan", "Internazionale", "FC Internazionale"] },
  { name: "AC Milan", aliases: ["AC Milan", "A.C. Milan"] },
  { name: "Napoli", aliases: ["Napoli", "SSC Napoli"] },
  { name: "AS Roma", aliases: ["AS Roma", "Roma"] },
  { name: "Lazio", aliases: ["Lazio", "SS Lazio"] },
  { name: "Atalanta", aliases: ["Atalanta"] },
  { name: "Fiorentina", aliases: ["Fiorentina"] },
  { name: "Bologna", aliases: ["Bologna"] },
  { name: "Bayern Munich", aliases: ["Bayern Munich", "Bayern München", "Bayern Munchen", "Bayern"] },
  { name: "Borussia Dortmund", aliases: ["Borussia Dortmund", "Dortmund", "BVB"] },
  { name: "RB Leipzig", aliases: ["RB Leipzig", "Leipzig"] },
  { name: "Bayer Leverkusen", aliases: ["Bayer Leverkusen", "Leverkusen"] },
  { name: "Eintracht Frankfurt", aliases: ["Eintracht Frankfurt", "Eintracht"] },
  { name: "Borussia Monchengladbach", aliases: ["Borussia Mönchengladbach", "Borussia Monchengladbach", "Monchengladbach", "M'gladbach"] },
  { name: "VfB Stuttgart", aliases: ["VfB Stuttgart", "Stuttgart"] },
  { name: "Paris Saint-Germain", aliases: ["Paris Saint-Germain", "Paris Saint Germain", "Paris SG", "PSG"] },
  { name: "Marseille", aliases: ["Olympique de Marseille", "Marseille"] },
  { name: "Lyon", aliases: ["Olympique Lyonnais", "Olympique Lyon", "Lyon"] },
  { name: "Monaco", aliases: ["AS Monaco", "Monaco"] },
  { name: "Lille", aliases: ["Lille", "LOSC"] },
  { name: "Ajax", aliases: ["Ajax", "AFC Ajax"] },
  { name: "PSV", aliases: ["PSV Eindhoven", "PSV"] },
  { name: "Feyenoord", aliases: ["Feyenoord"] },
  { name: "Benfica", aliases: ["Benfica", "SL Benfica"] },
  { name: "Porto", aliases: ["FC Porto", "Porto"] },
  { name: "Sporting CP", aliases: ["Sporting CP", "Sporting Lisbon", "Sporting Clube de Portugal"] },
  { name: "Celtic", aliases: ["Celtic", "Celtic FC"] },
  { name: "Rangers", aliases: ["Glasgow Rangers", "Rangers"] },
  { name: "Galatasaray", aliases: ["Galatasaray"] },
  { name: "Fenerbahce", aliases: ["Fenerbahçe", "Fenerbahce"] },
  { name: "Besiktas", aliases: ["Beşiktaş", "Besiktas"] },
  { name: "Flamengo", aliases: ["Flamengo"] },
  { name: "Palmeiras", aliases: ["Palmeiras"] },
  { name: "Boca Juniors", aliases: ["Boca Juniors"] },
  { name: "River Plate", aliases: ["River Plate"] },
  { name: "Inter Miami", aliases: ["Inter Miami", "Inter Miami CF"] },
  { name: "Al Nassr", aliases: ["Al Nassr", "Al-Nassr"] },
  { name: "Al Hilal", aliases: ["Al Hilal", "Al-Hilal"] },
  { name: "Al Ittihad", aliases: ["Al Ittihad", "Al-Ittihad"] },
];

const LEAGUES: Term[] = [
  { name: "Premier League", aliases: ["Premier League", "English Premier League"] },
  { name: "Championship", aliases: ["EFL Championship", "Sky Bet Championship"] },
  { name: "FA Cup", aliases: ["FA Cup"] },
  { name: "EFL Cup", aliases: ["EFL Cup", "Carabao Cup", "League Cup"] },
  { name: "Community Shield", aliases: ["Community Shield", "FA Community Shield"] },
  { name: "La Liga", aliases: ["La Liga", "LaLiga"] },
  { name: "Copa del Rey", aliases: ["Copa del Rey"] },
  { name: "Serie A", aliases: ["Serie A"] },
  { name: "Coppa Italia", aliases: ["Coppa Italia"] },
  { name: "Bundesliga", aliases: ["Bundesliga"] },
  { name: "2. Bundesliga", aliases: ["2. Bundesliga", "2.Bundesliga", "Zweite Bundesliga"] },
  { name: "DFB-Pokal", aliases: ["DFB-Pokal", "DFB Pokal"] },
  { name: "Ligue 1", aliases: ["Ligue 1"] },
  { name: "Coupe de France", aliases: ["Coupe de France"] },
  { name: "Champions League", aliases: ["UEFA Champions League", "Champions League", "UCL"] },
  { name: "Europa League", aliases: ["UEFA Europa League", "Europa League", "UEL"] },
  { name: "Conference League", aliases: ["UEFA Europa Conference League", "Europa Conference League", "UEFA Conference League", "Conference League", "UECL"] },
  { name: "MLS", aliases: ["Major League Soccer", "MLS"] },
  { name: "NWSL", aliases: ["National Women's Soccer League", "NWSL"] },
  { name: "Eredivisie", aliases: ["Eredivisie"] },
  { name: "Primeira Liga", aliases: ["Primeira Liga", "Liga Portugal"] },
  { name: "Scottish Premiership", aliases: ["Scottish Premiership"] },
  { name: "World Cup", aliases: ["FIFA World Cup", "World Cup"] },
  { name: "European Championship", aliases: ["European Championship", "UEFA Euro", "Euro 2024", "Euro 2028", "the Euros"] },
  { name: "Copa America", aliases: ["Copa América", "Copa America"] },
  { name: "Africa Cup of Nations", aliases: ["Africa Cup of Nations", "AFCON"] },
  { name: "Nations League", aliases: ["UEFA Nations League", "Nations League"] },
  { name: "Club World Cup", aliases: ["FIFA Club World Cup", "Club World Cup"] },
  { name: "Saudi Pro League", aliases: ["Saudi Pro League"] },
  { name: "Liga MX", aliases: ["Liga MX"] },
  { name: "Brasileirao", aliases: ["Brasileirão", "Brasileirao"] },
  { name: "Women's Super League", aliases: ["Women's Super League", "Women’s Super League", "Womens Super League", "WSL"] },
];

const GENERIC_EXTRA = new Set([
  "fc", "cf", "ac", "sc", "afc", "united", "city", "town", "rovers", "wanderers", "athletic", "sporting",
  "real", "club", "hotspur", "albion", "county", "wednesday", "orient", "rangers", "forest", "palace",
  "villa", "wolves", "spurs", "hammers", "blues", "reds", "the", "football", "soccer", "league", "cup",
]);

const TZ_ABBR: Record<string, string> = {
  UT: "GMT", GMT: "GMT", UTC: "UTC",
  BST: "+0100", CET: "+0100", CEST: "+0200", WET: "+0000", WEST: "+0100",
  EST: "-0500", EDT: "-0400", CST: "-0600", CDT: "-0500", MST: "-0700", MDT: "-0600", PST: "-0800", PDT: "-0700",
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  pound: "£", euro: "€", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  ntilde: "ñ", uuml: "ü", ouml: "ö", auml: "ä", ccedil: "ç", shy: "", middot: "·",
};

export interface NewsServiceOptions {
  feeds?: FeedSource[];
  fetchImpl?: typeof fetch;
  now?: () => number;
  refreshMs?: number;
  extraTerms?: () => { teams?: string[]; leagues?: string[] };
}

export function normalizeLink(link: string): string {
  const trimmed = link.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    u.hash = "";
    u.search = "";
    const host = u.hostname.toLowerCase();
    const port = u.port ? `:${u.port}` : "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${host}${port}${path}`;
  } catch {
    return trimmed.toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

export function normalizeTitle(title: string): string {
  return fold(title).replace(/[^a-z0-9]+/g, " ").trim();
}

export function parsePublishedAt(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/\b([A-Z]{2,5})$/, (all, tz: string) => TZ_ABBR[tz] ?? all);
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toISOString();
}

export function summarize(raw: string): string {
  let s = toPlain(raw).replace(/\b(?:continue reading|read more)\b[.…]*/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  const parts = splitSentences(s).slice(0, 2);
  let out = parts.join(" ").trim();
  if (!out) return "";
  if (out.length <= SUMMARY_CHARS) return out;
  const ellipsis = "…";
  let cut = out.slice(0, SUMMARY_CHARS - 1);
  const sp = cut.lastIndexOf(" ");
  if (sp >= 180) cut = cut.slice(0, sp);
  cut = cut.replace(/[\s,;:.\-–—]+$/u, "");
  const result = cut + ellipsis;
  return result.length <= SUMMARY_CHARS ? result : result.slice(0, SUMMARY_CHARS);
}

export function parseFeedXml(xml: string): ParsedItem[] {
  let src = xml;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  src = stripComments(src);
  if (!/<(rss|feed|rdf:RDF|item|entry)\b/i.test(src)) throw new Error("response is not RSS or Atom");
  const items = [...src.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const blocks = items.length ? items : [...src.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  const parsed: ParsedItem[] = [];
  for (const block of blocks) {
    if (parsed.length >= MAX_ITEMS_PER_FEED) break;
    const title = toPlain(inner(block, "title") ?? "");
    if (!title) continue;
    const link = itemLink(block);
    const summary = summarize(inner(block, "description") ?? inner(block, "summary") ?? "");
    const publishedAt = parsePublishedAt(toPlain(inner(block, "pubDate") ?? inner(block, "published") ?? inner(block, "updated") ?? inner(block, "dc:date") ?? ""));
    parsed.push({ title, summary, publishedAt, link });
  }
  return parsed;
}

export function tagText(text: string, extra?: { teams?: string[]; leagues?: string[] }): { teams: string[]; leagues: string[] } {
  const teams = pickNames(text, CLUBS);
  const leagues = pickNames(text, LEAGUES);
  return {
    teams: sortedUnique([...teams, ...extraNames(text, extra?.teams ?? [], teams)]),
    leagues: sortedUnique([...leagues, ...extraNames(text, extra?.leagues ?? [], leagues)]),
  };
}

export function dedupeItems<T extends { title: string; link: string; publishedAt: string }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => {
    const byDate = (b.publishedAt || "").localeCompare(a.publishedAt || "");
    if (byDate) return byDate;
    const byLink = (a.link || "").localeCompare(b.link || "");
    if (byLink) return byLink;
    return (a.title || "").localeCompare(b.title || "");
  });
  const links = new Set<string>();
  const titles = new Set<string>();
  const out: T[] = [];
  for (const it of sorted) {
    const link = normalizeLink(it.link);
    const title = normalizeTitle(it.title);
    if ((link && links.has(link)) || (title && titles.has(title))) continue;
    if (link) links.add(link);
    if (title) titles.add(title);
    out.push(it);
  }
  return out;
}

export class NewsService {
  private feeds: FeedSource[];
  private fetchImpl: typeof fetch;
  private now: () => number;
  private refreshMs: number;
  private extraTerms?: () => { teams?: string[]; leagues?: string[] };
  private items = new Map<string, StoredItem[]>();
  private state = new Map<string, { status: "ok" | "error"; lastFetch: string; itemCount: number; error?: string }>();
  private fetchedAt = 0;
  private inFlight: Promise<void> | null = null;
  private timer?: ReturnType<typeof setInterval>;

  constructor(o: NewsServiceOptions = {}) {
    this.feeds = o.feeds ?? FEEDS;
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.now = o.now ?? Date.now;
    this.refreshMs = o.refreshMs ?? REFRESH_MS;
    this.extraTerms = o.extraTerms;
  }

  /** Background refresh. The timer is unref'd so it does not keep the process alive. Idempotent. */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.refresh(); }, this.refreshMs);
    this.timer.unref?.();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async ensureFresh() {
    if (this.fetchedAt !== 0 && this.now() - this.fetchedAt < this.refreshMs) return;
    await this.refresh();
  }

  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.doRefresh().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  listSources(): SourceStatus[] {
    return this.feeds.map((f) => {
      const st = this.state.get(f.name);
      return {
        name: f.name,
        url: f.url,
        homepage: f.homepage,
        status: st?.status ?? "idle",
        lastFetch: st?.lastFetch ?? null,
        itemCount: st?.itemCount ?? 0,
        ...(st?.error ? { error: st.error } : {}),
      };
    });
  }

  async latest(q: { source?: string; team?: string; league?: string; keyword?: string; limit?: number } = {}) {
    await this.ensureFresh();
    let items = this.merged();
    if (q.source) items = items.filter((i) => sourceMatches(i.source, q.source!));
    if (q.team) items = items.filter((i) => facetMatches(q.team!, i.tags.teams, `${i.title} ${i.summary}`, CLUBS));
    if (q.league) items = items.filter((i) => facetMatches(q.league!, i.tags.leagues, `${i.title} ${i.summary}`, LEAGUES));
    if (q.keyword && fold(q.keyword)) {
      const k = fold(q.keyword);
      items = items.filter((i) => haystack(i).includes(k));
    }
    const limited = items.slice(0, clampLimit(q.limit));
    return { items: limited, count: limited.length };
  }

  async search(query: string, q: { source?: string; limit?: number } = {}) {
    const text = query?.trim() ?? "";
    if (text.length < 2) throw new Error("query must be at least 2 characters");
    await this.ensureFresh();
    let items = this.merged();
    if (q.source) items = items.filter((i) => sourceMatches(i.source, q.source!));
    items = items.filter((i) => queryMatches(i, text));
    const limited = items.slice(0, clampLimit(q.limit));
    return { query: text, items: limited, count: limited.length };
  }

  private async doRefresh() {
    const stamp = new Date(this.now()).toISOString();
    await Promise.all(this.feeds.map((feed) => this.fetchFeed(feed, stamp)));
    this.fetchedAt = this.now();
  }

  private async fetchFeed(feed: FeedSource, stamp: string) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    timer.unref?.();
    try {
      const res = await this.fetchImpl(feed.url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "kickmesh-mcp/0.1.0 (local RSS reader)",
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await responseXml(res);
      const parsed = parseFeedXml(xml).map((item) => ({ ...item, source: feed.name }));
      this.items.set(feed.name, parsed);
      this.state.set(feed.name, { status: "ok", lastFetch: stamp, itemCount: parsed.length });
    } catch (e) {
      const prev = this.items.get(feed.name);
      this.state.set(feed.name, {
        status: "error",
        lastFetch: stamp,
        itemCount: prev?.length ?? 0,
        error: errMsg(e),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private merged(): NewsItem[] {
    const extra = this.safeExtra();
    const all: StoredItem[] = [];
    for (const list of this.items.values()) all.push(...list);
    return dedupeItems(all).map((it) => ({
      title: it.title,
      summary: it.summary,
      source: it.source,
      publishedAt: it.publishedAt,
      link: it.link,
      tags: tagText(`${it.title} ${it.summary}`, extra),
    }));
  }

  private safeExtra(): { teams?: string[]; leagues?: string[] } {
    if (!this.extraTerms) return {};
    try { return this.extraTerms() ?? {}; }
    catch { return {}; }
  }
}

function clampLimit(n?: number): number {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(n))));
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/\s+/g, " ").trim().slice(0, 200) || "fetch failed";
}

function sourceMatches(source: string, filter: string): boolean {
  const f = fold(filter).trim();
  if (!f) return true;
  const s = fold(source);
  return s === f || s.includes(f);
}

function haystack(item: NewsItem): string {
  return fold([item.title, item.summary, item.source, item.link, ...item.tags.teams, ...item.tags.leagues].join(" "));
}

function queryMatches(item: NewsItem, query: string): boolean {
  const q = fold(query).trim();
  if (!q) return false;
  if (haystack(item).includes(q)) return true;
  for (const e of [...CLUBS, ...LEAGUES]) {
    const names = [e.name, ...e.aliases].map(fold);
    if (names.some((n) => n === q) && haystack(item).includes(fold(e.name))) return true;
  }
  return false;
}

function facetMatches(filter: string, tags: string[], text: string, dict: Term[]): boolean {
  const q = fold(filter).trim();
  if (!q) return true;
  if (tags.some((t) => fold(t) === q || (q.length >= 4 && fold(t).includes(q)))) return true;
  for (const e of dict) {
    const names = [e.name, ...e.aliases].map(fold);
    if (names.some((n) => n === q || (q.length >= 4 && n.includes(q))) && tags.some((t) => fold(t) === fold(e.name))) return true;
  }
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(q)}(?=$|[^a-z0-9])`, "i").test(fold(text));
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortedUnique(xs: string[]): string[] {
  return [...new Set(xs)].sort((a, b) => a.localeCompare(b));
}

interface Span { name: string; start: number; end: number }

function pickNames(text: string, dict: Term[]): string[] {
  const folded = fold(text);
  const spans: Span[] = [];
  for (const entry of dict) {
    for (const alias of entry.aliases) {
      const a = fold(alias);
      if (!a) continue;
      const re = new RegExp(`(?:^|[^a-z0-9])(${escapeRegExp(a)})(?=$|[^a-z0-9])`, "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(folded))) {
        const start = m.index + m[0].length - m[1].length;
        spans.push({ name: entry.name, start, end: start + m[1].length });
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    }
  }
  const names: string[] = [];
  for (const s of spans) {
    const shadowed = spans.some((o) => o.name !== s.name && o.start <= s.start && o.end >= s.end && (o.end - o.start) > (s.end - s.start));
    if (!shadowed && !names.includes(s.name)) names.push(s.name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function extraNames(text: string, names: string[], already: string[]): string[] {
  const folded = fold(text);
  const out: string[] = [];
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    const nf = fold(name);
    if (nf.length < 4 || GENERIC_EXTRA.has(nf)) continue;
    if (already.some((a) => {
      const af = fold(a);
      return af === nf || af.includes(nf) || nf.includes(af);
    })) continue;
    if (out.some((a) => fold(a) === nf)) continue;
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(nf)}(?=$|[^a-z0-9])`, "i");
    if (re.test(folded)) out.push(name);
  }
  return out;
}

function unwrapCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (all, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const cp = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return all;
      try { return String.fromCodePoint(cp); } catch { return all; }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? all;
  });
}

function stripHtml(s: string): string {
  return s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function toPlain(raw: string): string {
  let s = unwrapCdata(raw);
  for (let i = 0; i < 3; i++) {
    const next = stripHtml(decodeEntities(s));
    if (next === s) break;
    s = next;
  }
  return decodeEntities(s).replace(/\s+/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();
}

function splitSentences(text: string): string[] {
  const abbrev = /^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Fig|No|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|U\.S|U\.K|a\.m|p\.m|e\.g|i\.e)$/i;
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== "." && c !== "!" && c !== "?") continue;
    if (c === "." && (text[i + 1] === "." || text[i - 1] === ".")) continue;
    const next = text[i + 1];
    if (next !== undefined && !/\s/.test(next)) continue;
    const word = text.slice(start, i).trim().split(/\s+/).pop() ?? "";
    // Keep "2. Bundesliga" intact; still split after years such as "1863. The".
    if (c === "." && (/^\d{1,2}$/.test(word) || abbrev.test(word) || /^[A-Za-z]$/.test(word))) continue;
    const sentence = text.slice(start, i + 1).trim();
    if (sentence) out.push(sentence);
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    start = j;
    i = j - 1;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

function stripComments(xml: string): string {
  let out = "";
  let i = 0;
  while (i < xml.length) {
    if (xml.startsWith("<![CDATA[", i)) {
      const end = xml.indexOf("]]>", i + 9);
      if (end < 0) { out += xml.slice(i); break; }
      out += xml.slice(i, end + 3);
      i = end + 3;
      continue;
    }
    if (xml.startsWith("<!--", i)) {
      const end = xml.indexOf("-->", i + 4);
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    out += xml[i];
    i++;
  }
  return out;
}

function inner(block: string, tag: string): string | undefined {
  const t = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = block.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "i"));
  return m ? m[1] : undefined;
}

function itemLink(block: string): string {
  const textLink = toPlain(inner(block, "link") ?? "");
  if (/^https?:\/\//i.test(textLink)) return textLink.split(/\s/)[0];
  let fallback = "";
  const re = /<(?:[\w-]+:)?link\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const attrs = m[1] ?? "";
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    const rel = (/rel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "").toLowerCase();
    const decoded = toPlain(href);
    if (!rel || rel === "alternate") return decoded;
    if (!fallback && !/self|edit|enclosure|replies/.test(rel)) fallback = decoded;
  }
  if (fallback) return fallback;
  const guidOpen = /<guid\b([^>]*)>/i.exec(block);
  const guid = toPlain(inner(block, "guid") ?? "");
  const perma = guidOpen ? /ispermalink\s*=\s*["']true["']/i.test(guidOpen[1]) : false;
  if (/^https?:\/\//i.test(guid) && (perma || !textLink)) return guid.split(/\s/)[0];
  return "";
}

async function responseXml(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) throw new Error("empty feed");
  const slice = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
  const sniff = new TextDecoder("utf-8", { fatal: false }).decode(slice.slice(0, 240));
  const fromHeader = /charset=([^;\s]+)/i.exec(res.headers.get("content-type") ?? "")?.[1];
  const fromXml = /encoding=["']([^"']+)["']/i.exec(sniff)?.[1];
  const charset = normalizeCharset(fromHeader || fromXml || "utf-8");
  try { return new TextDecoder(charset).decode(slice); }
  catch { return new TextDecoder("utf-8").decode(slice); }
}

function normalizeCharset(c: string): string {
  const s = c.trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (s === "latin1" || s === "iso8859-1" || s === "iso-8859-1") return "iso-8859-1";
  if (s === "utf8") return "utf-8";
  return s || "utf-8";
}
