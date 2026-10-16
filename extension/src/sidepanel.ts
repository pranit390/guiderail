// The side panel owns the session (ADR 0004): voice, tool calls, policy engine, Journey state.
import { Mic, Speaker } from "./audio.ts";
import type { FormState, FromPage, ToPage } from "./messages.ts";
import { evaluate, guidance, type Rule, type Violation } from "./policy.ts";

const SERVER = "ws://localhost:8787";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const log = $("#log");
const status = $("#status");
const card = $("#guidance");
const issues = $("#issues");
const input = $<HTMLInputElement>("#text");
const talk = $<HTMLButtonElement>("#talk");

let ws: WebSocket | undefined;
let resumeHandle: string | undefined;
let rules: Rule[] = [];
let firstName: string | undefined;
let violations: Violation[] = [];
const mic = new Mic();
const speaker = new Speaker();
let talking = false;

// ---------- Startup ----------

async function init() {
  rules = (await (await fetch(chrome.runtime.getURL("rules.json"))).json()).rules;
  const profile = await chrome.identity.getProfileUserInfo({ accountStatus: chrome.identity.AccountStatus.ANY }).catch(() => null);
  firstName = profile?.email ? profile.email.split("@")[0].split(/[._-]/)[0] : undefined;
  connect();
}

function setStatus(text: string, state: "on" | "off" | "busy") {
  status.textContent = text;
  status.dataset.state = state;
}

// ---------- Conversation log ----------

let open: { role: string; el: HTMLElement } | null = null;

function say(role: "user" | "model" | "system", text: string) {
  if (open && open.role === role && role !== "system") {
    open.el.textContent += text;
  } else {
    const el = document.createElement("p");
    el.className = `msg ${role}`;
    el.textContent = text;
    log.append(el);
    open = role === "system" ? null : { role, el };
  }
  log.scrollTop = log.scrollHeight;
}

// ---------- Connection to the relay ----------

function connect() {
  setStatus("Connecting…", "busy");
  ws = new WebSocket(`${SERVER}/live${resumeHandle ? `?resume=${encodeURIComponent(resumeHandle)}` : ""}`);
  ws.onmessage = (e) => onServer(JSON.parse(e.data));
  ws.onclose = () => {
    setStatus("Disconnected. Click to reconnect", "off");
    if (talking) stopTalking();
  };
  ws.onerror = () => setStatus("Can't reach the GuideRail server on localhost:8787", "off");
}

status.addEventListener("click", () => ws?.readyState !== WebSocket.OPEN && connect());

const sendServer = (msg: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

async function onServer(msg: any) {
  switch (msg.type) {
    case "ready": setStatus("Ready", "on"); break;
    case "audio": speaker.play(msg.data); break;
    case "interrupted": speaker.interrupt(); break;
    case "transcript": say(msg.role, msg.text); break;
    case "turn_complete": open = null; break;
    case "resumption": resumeHandle = msg.handle; void chrome.storage.session.set({ resumeHandle }); break;
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

async function toPage<T>(msg: ToPage): Promise<T> {
  const tab = await activeTab();
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
      return { section: args.section ?? "Labels", requirements: items };
    }
    case "check_policy": {
      const form = await toPage<FormState>({ kind: "read_form" });
      await updateViolations(form);
      return { violations };
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
  const blocking = violations.filter((v) => v.severity === "block");
  await toPage({ kind: "show_violations", fields: [...new Set(blocking.map((v) => v.field))], submitLabel: "Create" }).catch(() => {});
  issues.hidden = violations.length === 0;
  issues.replaceChildren(
    ...violations.map((v) => {
      const li = document.createElement("li");
      li.dataset.severity = v.severity;
      li.textContent = v.message;
      return li;
    }),
  );
}

chrome.runtime.onMessage.addListener((msg: FromPage | { kind: "tab_changed" }) => {
  switch (msg.kind) {
    case "page_event":
      say("system", msg.text);
      sendServer({ type: "event", text: msg.text });
      break;
    case "form_changed":
      void updateViolations(msg.form);
      break;
    case "submit_intent":
      void updateViolations(msg.form).then(() => {
        const blocking = violations.filter((v) => v.severity === "block");
        const text = blocking.length
          ? `User is about to click "${msg.label}" but ${blocking.length} policy Violation(s) remain: ${blocking.map((v) => v.message).join(" ")}`
          : `User clicked "${msg.label}" and all policy checks pass.`;
        say("system", text);
        sendServer({ type: "event", text });
      });
      break;
  }
});

// ---------- Input ----------

$("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  say("user", text);
  open = null;
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
