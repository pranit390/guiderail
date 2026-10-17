// The side panel owns the session (ADR 0004): voice, tool calls, policy engine, Journey state.
import { Mic, Speaker } from "./audio.ts";
import type { FormState, FromPage, ToPage } from "./messages.ts";
import { evaluate, guidance, summarizeViolations, violationCountText, type Rule, type Violation } from "./policy.ts";
import { violationFieldLabel } from "./page.ts";
import { describeForModel, shouldSpeak, TeachSession } from "./teach/session.ts";
import { SessionLog } from "./sessionlog.ts";

const SERVER = "ws://localhost:8787";
const HTTP = "http://localhost:8787";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const log = $("#log");
const status = $("#status");
const card = $("#guidance");
const issues = $("#issues");
const input = $<HTMLInputElement>("#text");
const talk = $<HTMLButtonElement>("#talk");

let ws: WebSocket | undefined;
// Teach mode holds each spoken reply until the turn ends, then plays it only if it is worth hearing.
let held = { audio: [] as string[], text: "", expertSpoke: false };
// Memory for this side-panel session, given to every new Live connection (e.g. after Teach ↔ Guide).
const memory = new SessionLog();
let turnText = { user: "", model: "" };

// Something the app did that the model should know about (drafting, publishing…).
function appEvent(text: string) {
  memory.add("app", text);
  sendServer({ type: "app", text });
}
// The last message sent in the text box, so Teach can use it as the goal.
let lastSent: { text: string; at: number } | null = null;
let resumeHandle: string | undefined;
let rules: Rule[] = [];
let firstName: string | undefined;
let violations: Violation[] = [];
let mode: "guide" | "teach" = "guide";
let teach: TeachSession | null = null;
let draft: any = null;
const mic = new Mic();
const speaker = new Speaker();
let talking = false;

// ---------- Startup ----------

async function init() {
  await loadRules();
  const profile = await chrome.identity.getProfileUserInfo({ accountStatus: chrome.identity.AccountStatus.ANY }).catch(() => null);
  firstName = profile?.email ? profile.email.split("@")[0].split(/[._-]/)[0] : undefined;
  connect();
}

async function loadRules() {
  try {
    rules = (await (await fetch(`${HTTP}/rules`)).json()).rules;
  } catch {
    rules = (await (await fetch(chrome.runtime.getURL("rules.json"))).json()).rules;
  }
}

function setStatus(text: string, state: "on" | "off" | "busy") {
  status.textContent = text;
  status.dataset.state = state;
}

// ---------- Conversation log ----------

let open: { role: string; el: HTMLElement } | null = null;

function say(role: "user" | "model" | "system" | "step", text: string) {
  if (open && open.role === role && role !== "system" && role !== "step") {
    open.el.textContent += text;
  } else {
    const el = document.createElement("p");
    el.className = `msg ${role}`;
    el.textContent = text;
    log.append(el);
    open = role === "system" || role === "step" ? null : { role, el };
  }
  log.scrollTop = log.scrollHeight;
}

// ---------- Connection to the relay ----------

function connect() {
  setStatus("Connecting…", "busy");
  const params = new URLSearchParams({ mode });
  if (mode === "guide" && resumeHandle) params.set("resume", resumeHandle);
  if (mode === "teach" && teach) params.set("goal", teach.goal);
  const sock = new WebSocket(`${SERVER}/live?${params}`);
  ws = sock;
  sock.onmessage = (e) => { if (ws === sock) void onServer(JSON.parse(e.data)); };
  sock.onclose = () => {
    if (ws !== sock) return;
    setStatus("Disconnected. Click to reconnect", "off");
    if (talking) stopTalking();
  };
  sock.onerror = () => { if (ws === sock) setStatus("Can't reach the GuideRail server on localhost:8787", "off"); };
}

status.addEventListener("click", () => ws?.readyState !== WebSocket.OPEN && connect());

const sendServer = (msg: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

async function onServer(msg: any) {
  switch (msg.type) {
    case "ready":
      setStatus("Ready", "on");
      if (memory.size) sendServer({ type: "session", text: memory.summary() });
      break;
    case "audio":
      if (mode === "teach") held.audio.push(msg.data);
      else speaker.play(msg.data);
      break;
    case "interrupted": speaker.interrupt(); held.audio = []; break;
    case "transcript":
      teach?.heard(msg.role, msg.text);
      if (msg.role === "user" || mode !== "teach") turnText[msg.role as "user" | "model"] += msg.text;
      if (mode === "teach" && msg.role === "model") held.text += msg.text;
      else {
        if (msg.role === "user") held.expertSpoke = true;
        say(msg.role, msg.text);
      }
      break;
    case "turn_complete":
      if (mode === "teach") {
        if (shouldSpeak(held.text, held.expertSpoke)) {
          say("model", held.text.trim());
          turnText.model = held.text;
          held.audio.forEach((a) => speaker.play(a));
        }
        held = { audio: [], text: "", expertSpoke: false };
      }
      memory.add("user", turnText.user);
      memory.add("model", turnText.model);
      turnText = { user: "", model: "" };
      open = null;
      teach?.endTurn("user");
      teach?.endTurn("model");
      break;
    case "resumption":
      if (mode === "guide") { resumeHandle = msg.handle; void chrome.storage.session.set({ resumeHandle }); }
      break;
    case "error": say("system", msg.message); break;
    case "tool_call": {
      const response = await runTool(msg.name, msg.args).catch((err: Error) => ({ error: err.message }));
      sendServer({ type: "tool_result", id: msg.id, name: msg.name, response });
      break;
    }
  }
}

// ---------- Tools ----------

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  return tab;
}

async function toPage<T>(msg: ToPage, tabId?: number): Promise<T> {
  const tab = tabId === undefined ? await activeTab() : await chrome.tabs.get(tabId);
  try {
    return await chrome.tabs.sendMessage(tab.id!, msg);
  } catch {
    // The tab was open before GuideRail was installed: inject the content script and retry once.
    await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ["content.js"] }).catch(() => {
      throw new Error("GuideRail can't see this tab. Ask the user to open a Google page.");
    });
    return chrome.tabs.sendMessage(tab.id!, msg);
  }
}

async function runTool(name: string, args: Record<string, any>): Promise<Record<string, unknown>> {
  switch (name) {
    case "read_page":
      return toPage({ kind: "read_page" });
    case "highlight":
      return toPage({ kind: "highlight", text: String(args.text ?? ""), role: args.role });
    case "get_guidance": {
      const form = await toPage<FormState>({ kind: "read_form" });
      const items = guidance(rules, form, { firstName, consoleCreate: true }, args.section ?? "Labels");
      renderGuidance(items);
      const section = args.section ?? "Labels";
      return { section, onScreen: form.sections.includes(section), requirements: items };
    }
    case "check_policy": {
      const form = await toPage<FormState>({ kind: "read_form" });
      await updateViolations(form);
      return { violations };
    }
    case "draft_message": {
      // Opens a pre-filled compose window; the user reviews it and clicks Send (ADR 0001).
      const tab = await activeTab();
      const sandbox = tab.url?.startsWith("http://localhost:8787/sandbox/");
      const base = sandbox ? "http://localhost:8787/sandbox/gmail-compose.html?" : "https://mail.google.com/mail/?view=cm&";
      const q = new URLSearchParams({ to: String(args.to ?? ""), su: String(args.subject ?? ""), body: String(args.body ?? "") });
      await chrome.tabs.create({ url: base + q.toString() });
      say("system", "Drafted the request. Review it and click Send yourself.");
      return { opened: true, note: "The user must review and click Send." };
    }
    case "complete_step":
      say("system", `✓ ${args.summary}`);
      return { ok: true };
    default:
      return { error: `Unknown tool ${name}` };
  }
}

// ---------- Guide: suggested values before the user types ----------

function renderGuidance(items: ReturnType<typeof guidance>) {
  card.hidden = items.length === 0;
  card.replaceChildren();
  const h = document.createElement("h2");
  h.textContent = "Suggested labels";
  card.append(h);
  for (const s of items) {
    const row = document.createElement("div");
    row.className = "sugg";
    const value = s.suggested ?? (s.ask ? "?" : "");
    row.innerHTML = `<code></code><span class="why"></span><button type="button">Copy</button>`;
    row.querySelector("code")!.textContent = `${s.key}=${value}`;
    row.querySelector(".why")!.textContent = s.ask && !s.suggested ? `${s.format} (you choose)` : s.explain;
    const copy = row.querySelector("button")!;
    copy.disabled = !s.suggested;
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(s.suggested!).catch(() => {});
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1200);
    });
    card.append(row);
  }
}

// ---------- Guard: Violations ----------

async function updateViolations(form: FormState) {
  violations = evaluate(rules, form);
  const shown = (await toPage<{ shown?: string[] }>({ kind: "show_violations", violations }).catch(() => undefined))?.shown ?? [];
  issues.hidden = violations.length === 0;
  const heading = $("#issues-summary");
  // The heading is the live region: only a change in the counts is announced, not every rebuild while typing.
  const text = violations.length ? violationCountText(summarizeViolations(violations)) : "";
  if (heading.textContent !== text) heading.textContent = text;
  const list = $("#issues-list");
  list.replaceChildren(
    ...violations.map((v) => {
      const li = document.createElement("li");
      li.dataset.severity = v.severity;
      const field = document.createElement("span");
      field.className = "field";
      field.textContent = violationFieldLabel(v.field);
      const msg = document.createElement("span");
      msg.className = "rule-msg";
      msg.textContent = v.message;
      msg.id = `issue-${v.ruleId}`;
      li.setAttribute("aria-describedby", msg.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Show field";
      btn.setAttribute("aria-label", `Show ${violationFieldLabel(v.field)} field: ${v.message}`);
      btn.addEventListener("click", () => { void toPage({ kind: "show_field", field: v.field }).catch(() => {}); });
      if (shown.includes(v.field)) li.append(field, btn, msg);
      else li.append(field, msg);
      return li;
    }),
  );
}

type TabChanged = { kind: "tab_changed"; tabId: number; url?: string };

chrome.runtime.onMessage.addListener((msg: FromPage | TabChanged, _sender, reply) => {
  switch (msg.kind) {
    case "teach_status":
      reply({ on: mode === "teach" });
      break;
    case "tab_changed":
      if (mode === "teach") void followTab(msg.tabId);
      break;
    case "page_event":
      say("system", msg.text);
      sendServer({ type: "event", text: msg.text });
      break;
    case "form_changed":
      // Teach records what the expert does; it doesn't judge it.
      if (mode === "teach") break;
      void updateViolations(msg.form);
      break;
    case "submit_intent":
      if (mode === "teach") break;
      void updateViolations(msg.form).then(() => {
        const blocking = violations.filter((v) => v.severity === "block");
        const text = blocking.length
          ? `User is about to click "${msg.label}" but ${violationCountText(summarizeViolations(violations))} remain: ${blocking.map((v) => v.message).join(" ")}`
          : `User clicked "${msg.label}" and all policy checks pass.`;
        say("system", text);
        sendServer({ type: "event", text });
      });
      break;
    case "teach_event":
      if (!teach) break;
      teach.add(msg.event);
      $("#teachcount").textContent = String(teach.count);
      {
        const line = describeForModel(msg.event);
        if (line) { say("step", `✓ ${line.replace(/^Expert /, "")}`); memory.add("step", line.replace(/^Expert /, "")); }
      }
      {
        // Only the expert's choices invite a reply (a possible "why?"); clicks and page changes are context.
        const text = describeForModel(msg.event);
        if (text) sendServer({ type: msg.event.t === "field" ? "event" : "context", text });
      }
      break;
  }
});

// ---------- Teach ----------

// Recording follows the expert across page loads and tab switches.
async function followTab(tabId: number) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || mode !== "teach") return;
  await toPage({ kind: "teach", on: true }, tabId).catch(() => {});
  if (!teach || !tab.url) return;
  teach.add({ t: "navigate", at: Date.now(), url: tab.url, title: tab.title ?? "" });
  $("#teachcount").textContent = String(teach.count);
}

async function setTeach(on: boolean) {
  mode = on ? "teach" : "guide";
  showTeachButton(on);
  ws?.close();
  if (on) {
    violations = [];
    issues.hidden = true;
    $("#issues-list").replaceChildren();
    $("#issues-summary").textContent = "";
    await toPage({ kind: "show_violations", violations: [] }).catch(() => {});
  }
  await toPage({ kind: "teach", on }).catch(() => {});
  $("#teachbar").hidden = !on;
  connect();
}

// The Teach button is a toggle and shows its state at once, before the mode switch finishes.
function showTeachButton(on: boolean) {
  const button = $<HTMLButtonElement>("#teach");
  button.toggleAttribute("data-on", on);
  button.setAttribute("aria-pressed", String(on));
  button.textContent = on ? "● Teaching" : "Teach";
  button.title = on ? "Stop teaching and draft a Playbook" : "Show GuideRail how your team does a task";
}

$("#teach").addEventListener("click", async () => {
  if (mode === "teach") {
    $("#teachstop").click();
    return;
  }
  showTeachButton(true);
  // Goal: what's in the box, else what was just sent (people often type, press Send, then Teach).
  const recent = lastSent && Date.now() - lastSent.at < 2 * 60_000 ? lastSent.text : "";
  const goal = input.value.trim() || recent || "Untitled task (name it from what the expert did)";
  input.value = "";
  teach = new TeachSession(goal);
  pendingPayload = null;
  say("system", `Teach mode: showing "${goal}". Do the task normally and say why as you go.`);
  memory.add("app", `Teach mode started. Task being taught: "${goal}"`);
  await setTeach(true);
});

let pendingPayload: ReturnType<TeachSession["payload"]> | null = null;

async function errorText(res: Response): Promise<string> {
  try { return (await res.json()).error ?? res.statusText; } catch { return res.statusText; }
}

let drafting = false;

$("#teachstop").addEventListener("click", async () => {
  if (!teach || drafting) return;
  drafting = true;
  try { await stopAndDraft(); } finally { drafting = false; }
});

async function stopAndDraft() {
  if (!teach) return;
  if (!pendingPayload) {
    teach.endTurn("user");
    teach.endTurn("model");
    pendingPayload = teach.payload();
    await setTeach(false);
  }
  say("system", "Drafting a Playbook from what you showed. This takes about 15 seconds…");
  appEvent(`Teach mode stopped; drafting a Playbook from ${pendingPayload?.events.length ?? 0} recorded events (takes about 15 seconds)`);
  let res: Response;
  try {
    res = await fetch(`${HTTP}/playbooks/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pendingPayload) });
  } catch {
    say("system", "Couldn't reach the GuideRail server on localhost:8787. Press \"Stop and draft Playbook\" to try again.");
    $("#teachbar").hidden = false;
    return;
  }
  if (!res.ok) {
    say("system", `Couldn't draft the Playbook: ${await errorText(res)}. Press "Stop and draft Playbook" to try again.`);
    $("#teachbar").hidden = false;
    return;
  }
  let body: any;
  try { body = await res.json(); } catch {
    say("system", `Couldn't draft the Playbook: ${res.statusText || "bad response"}. Press "Stop and draft Playbook" to try again.`);
    $("#teachbar").hidden = false;
    return;
  }
  teach = null;
  pendingPayload = null;
  draft = body;
  $("#draftmd").textContent = draft.markdown;
  $("#draftrules").replaceChildren(...draft.suggestedRules.map((r: any) => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" checked> <span></span>`;
    label.querySelector("input")!.value = r.id;
    label.querySelector("span")!.textContent = `Rule: ${r.message} (${r.severity})`;
    return label;
  }));
  $("#draft").hidden = false;
  $("#draft").scrollIntoView({ block: "nearest" });
  say("system", "Draft ready below. Review it, untick any Rules you don't want, then click Publish.");
  appEvent(`Playbook draft ready: "${draft.title}". It is shown below the chat for the user to review; they still need to click Publish. Draft:\n${String(draft.markdown).slice(0, 1200)}`);
}

$("#publish").addEventListener("click", async () => {
  if (!draft) return;
  const ruleIds = [...document.querySelectorAll<HTMLInputElement>("#draftrules input:checked")].map((i) => i.value);
  let res: Response;
  try {
    res = await fetch(`${HTTP}/playbooks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft, ruleIds }) });
  } catch {
    say("system", "Couldn't reach the GuideRail server on localhost:8787. Your draft is still here; press Publish to try again.");
    return;
  }
  if (!res.ok) { say("system", `Publishing failed: ${await errorText(res)}. Your draft is still here; press Publish to try again.`); return; }
  $("#draft").hidden = true;
  say("system", `Published "${draft.title}". New hires will be guided by it from their next session.`);
  memory.add("app", `Playbook "${draft.title}" was published and is now used for guiding`);
  draft = null;
  await loadRules();
  // Start a fresh Guide session so the relay loads the new Playbook.
  resumeHandle = undefined;
  void chrome.storage.session.remove("resumeHandle");
  ws?.close();
  connect();
  say("system", "Reconnected with the new Playbook.");
});

// ---------- Input ----------

$("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  say("user", text);
  open = null;
  lastSent = { text, at: Date.now() };
  memory.add("user", text);
  sendServer({ type: "text", text });
  input.value = "";
});

async function startTalking() {
  try {
    await mic.start((data) => sendServer({ type: "audio", data }));
    talking = true;
    talk.textContent = "Stop";
    talk.dataset.on = "true";
  } catch {
    say("system", "GuideRail needs the microphone. Opening the setup page.");
    void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
}

function stopTalking() {
  mic.stop();
  talking = false;
  talk.textContent = "Talk";
  delete talk.dataset.on;
  sendServer({ type: "audio_end" });
}

talk.addEventListener("click", () => (talking ? stopTalking() : void startTalking()));

void init();
