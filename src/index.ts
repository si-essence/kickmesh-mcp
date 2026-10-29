#!/usr/bin/env node
import { createServer as createHttp } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { ApiFootballClient } from "./client.js";
import { NewsService } from "./news.js";

const client = new ApiFootballClient(); // shared so cache + budget are global
const news = new NewsService({ extraTerms: () => client.cachedNames() });
news.start(); // 12-minute unref'd refresh; tool calls also refresh if stale

if (process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http") {
  const port = Number(process.env.PORT ?? 3000);
  createHttp(async (req, res) => {
    if (req.url?.startsWith("/health")) { res.end("ok"); return; }
    if (!req.url?.startsWith("/mcp")) { res.statusCode = 404; res.end(); return; }
    let body = "";
    for await (const c of req) body += c;
    const server = createServer(client, news);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  }).listen(port, () => console.error(`kickmesh-mcp HTTP on :${port}/mcp`));
} else {
  await createServer(client, news).connect(new StdioServerTransport());
}
