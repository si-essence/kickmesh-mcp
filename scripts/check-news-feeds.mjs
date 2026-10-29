#!/usr/bin/env node
/**
 * Fetch each configured public RSS feed once and print ok/fail plus item counts.
 * Does not read or print API_FOOTBALL_KEY. Run after `npm run build`.
 */
import { NewsService } from "../dist/news.js";

const svc = new NewsService();
await svc.refresh();
const sources = svc.listSources();
for (const s of sources) {
  const flag = s.status === "ok" ? "ok" : "fail";
  const err = s.error ? `\t${s.error}` : "";
  console.log(`${flag}\tcount=${s.itemCount}\t${s.name}${err}`);
}
