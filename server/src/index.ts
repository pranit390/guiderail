import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { WebSocketServer } from "ws";
import { relay } from "./live.ts";

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = join(import.meta.dirname, "..", "..");
const SANDBOX = join(ROOT, "sandbox");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (url.pathname === "/health") return void res.end("ok");

  if (url.pathname === "/rules") {
    const rules = await readFile(join(ROOT, "seed", "rules", "org-labeling-rules.json"), "utf8");
    res.setHeader("Content-Type", "application/json");
    return void res.end(rules);
  }

  // Local copies of Google pages to develop against, e.g. /sandbox/cloud-run-create.html
  if (url.pathname.startsWith("/sandbox/")) {
    const path = normalize(join(SANDBOX, url.pathname.slice("/sandbox/".length)));
    if (!path.startsWith(SANDBOX)) return void res.writeHead(403).end();
    try {
      const body = await readFile(path);
      res.setHeader("Content-Type", TYPES[extname(path)] ?? "application/octet-stream");
      return void res.end(body);
    } catch {
      return void res.writeHead(404).end("not found");
    }
  }

  res.writeHead(404).end("not found");
});

const wss = new WebSocketServer({ server, path: "/live" });
wss.on("connection", (client, req) => {
  const handle = new URL(req.url ?? "", "http://x").searchParams.get("resume") ?? undefined;
  void relay(client, handle);
});

server.listen(PORT, () => console.log(`GuideRail server on http://localhost:${PORT}  (ws /live, /rules, /sandbox/)`));
