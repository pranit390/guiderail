import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { WebSocketServer } from "ws";
import { relay } from "./live.ts";
import { draftPlaybook, DraftError, isRule } from "./playbooks/draft.ts";
import { isAllowedOrigin } from "./origin.ts";
import { FilePlaybookStore, FileRuleStore, isSafeId } from "./playbooks/store.ts";
import type { PlaybookDraft, TeachPayload } from "./playbooks/types.ts";
import { approvals, approvalUrl, isExpired, lookupRole, roleTitle, type Approval } from "./approvals.ts";

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = join(import.meta.dirname, "..", "..");
const SANDBOX = join(ROOT, "sandbox");
export const playbookStore = new FilePlaybookStore(join(ROOT, "data", "playbooks"));
export const ruleStore = new FileRuleStore(join(ROOT, "data", "rules"));
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const json = (res: ServerResponse, status: number, body: unknown) =>
  void res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));

const MAX_BODY = 1024 * 1024;
class TooLarge extends Error {}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY) throw new TooLarge();
  }
  try {
    const body = JSON.parse(raw);
    return body && typeof body === "object" ? body : undefined;
  } catch {
    return undefined;
  }
}

const WRITE_ROUTES = new Set(["/playbooks/draft", "/playbooks", "/approvals"]);

const server = createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    if (err instanceof TooLarge) return json(res, 413, { error: "Request body is larger than 1 MB." });
    console.error("[server]", err);
    if (!res.headersSent) json(res, 500, { error: "Internal server error." });
    else res.end();
  }
});

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return void res.writeHead(204).end();

  if (url.pathname === "/health") return void res.end("ok");

  if (req.method === "POST" && WRITE_ROUTES.has(url.pathname) && !isAllowedOrigin(req.headers.origin)) {
    return json(res, 403, { error: "This origin may not write to GuideRail." });
  }

  if (url.pathname === "/rules") {
    const seed = JSON.parse(await readFile(join(ROOT, "seed", "rules", "org-labeling-rules.json"), "utf8"));
    return json(res, 200, { rules: [...seed.rules, ...(await ruleStore.all())] });
  }

  if (url.pathname === "/playbooks/draft" && req.method === "POST") {
    const body = (await readJson(req)) as TeachPayload | undefined;
    if (!body?.goal || !Array.isArray(body.events) || body.events.length === 0) {
      return json(res, 400, { error: "Send a goal and at least one event." });
    }
    try {
      return json(res, 200, await draftPlaybook(body));
    } catch (err) {
      return json(res, err instanceof DraftError ? 502 : 500, { error: (err as Error).message });
    }
  }

  if (url.pathname === "/playbooks" && req.method === "POST") {
    const body = (await readJson(req)) as { draft?: Partial<PlaybookDraft>; ruleIds?: unknown } | undefined;
    const d = body?.draft;
    if (!d || typeof d !== "object") return json(res, 400, { error: "Send the draft to publish." });
    if (!isSafeId(d.id)) return json(res, 400, { error: "The draft id must be lowercase letters, numbers and dashes." });
    if (typeof d.title !== "string" || typeof d.markdown !== "string" || !d.markdown) {
      return json(res, 400, { error: "The draft needs a title and markdown." });
    }
    if (!Array.isArray(d.appliesTo) || !Array.isArray(d.goals) || !Array.isArray(d.suggestedRules)) {
      return json(res, 400, { error: "The draft needs appliesTo, goals and suggestedRules arrays." });
    }
    if (body?.ruleIds !== undefined && !(Array.isArray(body.ruleIds) && body.ruleIds.every((x) => typeof x === "string"))) {
      return json(res, 400, { error: "ruleIds must be an array of strings." });
    }
    const draft = d as PlaybookDraft;
    const keep = new Set((body?.ruleIds as string[] | undefined) ?? []);
    try {
      await playbookStore.publish(draft);
      await ruleStore.replace(draft.id, draft.suggestedRules.filter((r) => isRule(r) && keep.has(r.id)));
    } catch (err) {
      return json(res, 500, { error: (err as Error).message });
    }
    return json(res, 201, { id: draft.id });
  }

  if (url.pathname === "/playbooks" && req.method === "GET") {
    return json(res, 200, { playbooks: await playbookStore.list() });
  }

  if (url.pathname === "/role") {
    const found = lookupRole(url.searchParams.get("permission") ?? "");
    return json(res, found ? 200 : 404, found);
  }

  if (url.pathname === "/approvals" && req.method === "POST") {
    const body = await readJson(req);
    const fields = ["requester", "role", "resource", "reason"] as const;
    if (!body || fields.some((f) => typeof body[f] !== "string" || !body[f])) {
      return json(res, 400, { error: `JSON body needs ${fields.join(", ")}` });
    }
    const approval = await approvals.create({
      requester: body.requester as string,
      role: body.role as string,
      resource: body.resource as string,
      reason: body.reason as string,
    });
    return json(res, 201, { id: approval.id, url: approvalUrl(approval.id) });
  }

  const approvalRoute = url.pathname.match(/^\/approvals\/([\w-]+)(\/grant)?$/);
  if (approvalRoute) {
    const [, id, grant] = approvalRoute;
    const approval = await approvals.get(id);
    if (!approval) return json(res, 404, { error: "unknown approval" });
    if (!grant && req.method === "GET") return json(res, 200, approval);
    if (grant && req.method === "POST") {
      if (isExpired(approval)) return json(res, 410, { error: "approval expired" });
      return json(res, 200, await approvals.setStatus(id, "granted"));
    }
    return json(res, 405, { error: "method not allowed" });
  }

  // Approver page: the link in the Requester's email
  const approverRoute = url.pathname.match(/^\/a\/([\w-]+)$/);
  if (approverRoute) {
    const approval = await approvals.get(approverRoute[1]);
    const status = !approval ? 404 : isExpired(approval) ? 410 : 200;
    return void res.writeHead(status, { "Content-Type": "text/html" }).end(approverPage(approval));
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
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function approverPage(approval?: Approval) {
  const page = (body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GuideRail · Access request</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; color: #202124; background: #f8f9fa; margin: 0; }
  main { max-width: 520px; margin: 48px auto; background: #fff; border: 1px solid #dadce0; border-radius: 8px; padding: 24px 28px; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0 0 24px; }
  dt { color: #5f6368; } dd { margin: 0; } code { font-size: 13px; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .btn { font: inherit; padding: 8px 16px; border-radius: 4px; border: 1px solid #1a73e8; cursor: pointer; text-decoration: none; }
  .primary { background: #1a73e8; color: #fff; } .secondary { background: #fff; color: #1a73e8; }
  .note { margin-top: 16px; color: #188038; } .muted { color: #5f6368; }
</style></head><body><main>${body}</main></body></html>`;

  if (!approval) return page(`<h1>Request not found</h1><p class="muted">This approval link is unknown. Ask the requester to send a new one.</p>`);
  if (isExpired(approval)) return page(`<h1>Request expired</h1><p class="muted">Approval links last 24 hours. Ask ${escape(approval.requester)} to send a new one.</p>`);

  const grantUrl = `/sandbox/iam-grant.html?${new URLSearchParams({ principal: approval.requester, role: roleTitle(approval.role) })}`;
  const granted = approval.status === "granted";
  return page(`<h1>${escape(approval.requester)} is asking for access</h1>
<dl>
  <dt>Who</dt><dd>${escape(approval.requester)}</dd>
  <dt>Role</dt><dd>${escape(roleTitle(approval.role))} <code>${escape(approval.role)}</code></dd>
  <dt>Resource</dt><dd>${escape(approval.resource)}</dd>
  <dt>Why</dt><dd>${escape(approval.reason)}</dd>
  <dt>Status</dt><dd id="status">${escape(approval.status)}</dd>
</dl>
<div class="actions">
  <a class="btn primary" href="${escape(grantUrl)}">Open IAM and grant with GuideRail</a>
  <button class="btn secondary" id="grant"${granted ? " disabled" : ""}>Mark as granted</button>
</div>
<p class="note" id="note"${granted ? "" : " hidden"}>Marked as granted. ${escape(approval.requester)}'s Journey can continue.</p>
<script>
  document.getElementById("grant").addEventListener("click", async (e) => {
    e.target.disabled = true;
    const res = await fetch("/approvals/${approval.id}/grant", { method: "POST" });
    const note = document.getElementById("note");
    if (res.ok) {
      document.getElementById("status").textContent = "granted";
    } else {
      note.textContent = "Couldn't mark as granted: " + ((await res.json()).error ?? res.status);
      note.style.color = "#d93025";
      e.target.disabled = false;
    }
    note.hidden = false;
  });
</script>`);
}

const wss = new WebSocketServer({ server, path: "/live" });
wss.on("connection", (client, req) => {
  const params = new URL(req.url ?? "", "http://x").searchParams;
  const mode = params.get("mode") === "teach" ? "teach" : "guide";
  void relay(client, params.get("resume") ?? undefined, mode);
});

server.listen(PORT, () => console.log(`GuideRail server on http://localhost:${PORT}  (ws /live, /rules, /approvals, /a/, /role, /sandbox/)`));
