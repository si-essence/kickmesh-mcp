export class BudgetError extends Error {}
export class ApiError extends Error {}

export type ConnectorErrorCode = "plan_limit";

export const PLAN_LIMIT_MESSAGE =
  "Your API-Football plan does not cover this request. The free plan covers seasons 2022 to 2024 only. Live and current-season data, and the next/last match filters, need a paid API-Football plan on your own key.";

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;

  constructor(code: ConnectorErrorCode, message: string) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
  }
}

function collectErrorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => collectErrorText(item)).join(" ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${key} ${collectErrorText(item)}`)
      .join(" ");
  }
  return "";
}

/** Free-plan replies mention the plan, a season, or the next/last filters. */
function isPlanLimitErrors(errors: unknown): boolean {
  const text = collectErrorText(errors).toLowerCase();
  return text.includes("plan") || text.includes("season") || /\bnext\b/.test(text) || /\blast\b/.test(text);
}

export interface ClientOptions {
  apiKey?: string;
  baseUrl?: string;
  dailyLimit?: number;
  perMinuteLimit?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** TTLs in seconds per endpoint; live fixtures are short. */
export const TTL: Record<string, number> = {
  "fixtures:live": 30,
  fixtures: 300,
  "fixtures/lineups": 600,
  "fixtures/events": 60,
  standings: 3600,
  "teams/statistics": 3600,
  players: 3600,
  transfers: 86400,
  injuries: 3600,
  odds: 1800,
  predictions: 3600,
  teams: 86400,
  leagues: 86400,
};

export class ApiFootballClient {
  private cache = new Map<string, { exp: number; data: unknown }>();
  private minuteHits: number[] = [];
  private day = "";
  private dayCount = 0;
  readonly dailyLimit: number;
  readonly perMinuteLimit: number;
  private fetchImpl: typeof fetch;
  private now: () => number;
  private baseUrl: string;
  private apiKey?: string;

  constructor(o: ClientOptions = {}) {
    this.apiKey = o.apiKey ?? process.env.API_FOOTBALL_KEY;
    this.baseUrl = o.baseUrl ?? process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
    this.dailyLimit = o.dailyLimit ?? Number(process.env.API_FOOTBALL_DAILY_LIMIT ?? 100);
    this.perMinuteLimit = o.perMinuteLimit ?? Number(process.env.API_FOOTBALL_PER_MINUTE_LIMIT ?? 10);
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.now = o.now ?? Date.now;
  }

  budget() {
    this.rollDay();
    return { day: this.day, used: this.dayCount, remaining: Math.max(0, this.dailyLimit - this.dayCount), dailyLimit: this.dailyLimit, perMinuteLimit: this.perMinuteLimit };
  }

  private rollDay() {
    const d = new Date(this.now()).toISOString().slice(0, 10); // API resets at 00:00 UTC
    if (d !== this.day) { this.day = d; this.dayCount = 0; }
  }

  async get(endpoint: string, params: Record<string, string | number | boolean | undefined>, ttlKey = endpoint) {
    const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== "").sort(([a], [b]) => a.localeCompare(b));
    const qs = new URLSearchParams(clean.map(([k, v]) => [k, String(v)])).toString();
    const key = `${endpoint}?${qs}`;
    const t = this.now();
    const hit = this.cache.get(key);
    if (hit && hit.exp > t) return hit.data;

    if (!this.apiKey) throw new ApiError("API_FOOTBALL_KEY is not set. Get a free key at https://dashboard.api-football.com and set it in the environment.");
    this.rollDay();
    if (this.dayCount >= this.dailyLimit)
      throw new BudgetError(`Daily request budget exhausted (${this.dayCount}/${this.dailyLimit}). Resets at 00:00 UTC. Cached results are still served.`);
    this.minuteHits = this.minuteHits.filter((x) => t - x < 60_000);
    if (this.minuteHits.length >= this.perMinuteLimit) {
      const wait = Math.ceil((60_000 - (t - this.minuteHits[0])) / 1000);
      throw new BudgetError(`Per-minute rate limit reached (${this.perMinuteLimit}/min). Retry in ~${wait}s.`);
    }
    this.dayCount++;
    this.minuteHits.push(t);

    const res = await this.fetchImpl(`${this.baseUrl}/${endpoint}${qs ? "?" + qs : ""}`, { headers: { "x-apisports-key": this.apiKey } });
    const remaining = res.headers.get("x-ratelimit-requests-remaining");
    if (remaining !== null && !isNaN(Number(remaining))) this.dayCount = Math.max(this.dayCount, this.dailyLimit - Number(remaining));
    if (!res.ok) throw new ApiError(`API-Football HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    const body = (await res.json()) as { results?: number; paging?: unknown; response?: unknown; errors?: unknown };
    const errs = body?.errors;
    if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs as object).length)) {
      // Plan limits share this HTTP 200 errors field with ordinary upstream failures.
      if (isPlanLimitErrors(errs)) throw new ConnectorError("plan_limit", PLAN_LIMIT_MESSAGE);
      throw new ApiError(`API-Football error: ${JSON.stringify(errs)}`);
    }
    const data = { results: body.results, paging: body.paging, response: body.response };
    this.cache.set(key, { exp: t + (TTL[ttlKey] ?? 300) * 1000, data });
    return data;
  }

  /** Team and league names already stored in the response cache. Does not call the API. */
  cachedNames(): { teams: string[]; leagues: string[] } {
    const teams = new Set<string>();
    const leagues = new Set<string>();
    const walk = (node: unknown, parentKey?: string) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const x of node) walk(x, parentKey);
        return;
      }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "name" && typeof v === "string" && v.trim()) {
          if (parentKey === "team") teams.add(v.trim());
          else if (parentKey === "league") leagues.add(v.trim());
        }
        walk(v, k);
      }
    };
    for (const entry of this.cache.values()) walk(entry.data);
    return { teams: [...teams], leagues: [...leagues] };
  }
}
