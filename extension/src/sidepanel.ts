// The side panel owns the session (ADR 0004): voice, tool calls, policy engine, Journey state.
import { JourneyBinding } from "./journey-binding.ts";
import { parseCompileRequest } from "../../shared/journey.ts";
import { STATES, stateGlyph, violationState } from "./states.ts";
import { mountJourneyPanel } from "./journey-panel.ts";
import { briefPrompt, isPublicDoc, routePageTool, type DocumentSnapshot } from "./document.ts";
import { FIRESTORE_GOAL } from "../../shared/journey.ts";
import { Mic, Speaker } from "./audio.ts";
import type { FormState, FromPage, HighlightResult, PageSnapshot, ToPage } from "./messages.ts";
import { evaluate, guidance, summarizeViolations, violationCountText, type Rule, type Violation } from "./policy.ts";
import { violationFieldLabel } from "./page.ts";
import { actionAuthorized, authorizeTarget, highlightOutcome, highlightResult, type BoundSnapshot } from "./resolve.ts";
import { describeForModel, shouldSpeak, TeachSession } from "./teach/session.ts";
import { SessionLog, type Entry } from "./sessionlog.ts";
import { parseCalmPreset } from "./calm.ts";

import { HTTP, SERVER, SERVER_HOST } from "./config.ts";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const log = $("#log");
const status = $("#status");
const card = $("#guidance");
const issues = $("#issues");
const input = $<HTMLInputElement>("#text");
const talk = $<HTMLButtonElement>("#talk");

let ws: WebSocket | undefined;
// Latest read of the tab this session is coaching. Highlight and Assist fill may use only these names.
let bound: BoundSnapshot | null = null;
let boundStale = false;
let liveReady = false;
let compiledGoal = false;
// A compile finished during a tool call: reconnect with the compiled Goal once that turn ends.
let restartPending = false;
let toolCalls = 0;
let docsTabId: number | undefined;
const binding = new JourneyBinding();
const journeyPanel = mountJourneyPanel($("#journey"), {
  http: HTTP,
  open: () => binding.open({ goalId: FIRESTORE_GOAL.id }),
  read: async () => readSnapshot(await binding.tab()),
  point: (text, role) => runHighlight({ text, role }),
  changed: appEvent,
  clear: clearJourneyPointer,
  currentRegion: $("#current-step"),
  reset() { binding.clear(); compiledGoal = false; docsTabId = undefined; bound = null; },
  compiled() {
    compiledGoal = true;
    restartPending = true;
    resumeHandle = undefined;
    void chrome.storage.session.remove("resumeHandle");
    if (mode !== "guide") return;
    docsTabId = undefined;
    if (toolCalls) return;
    ws?.close();
    connect();
  },
  async brief() {
    if (binding.tabId !== undefined) throw new Error("End the console Journey before briefing another tab.");
    if (!liveReady || ws?.readyState !== WebSocket.OPEN) throw new Error("The coach is not ready. Reconnect and retry.");
    const tab = await activeTab();
    if (!tab.url || !isPublicDoc(tab.url)) throw new Error("Choose the Firestore or IAM public docs tab.");
    const doc = await toPage<DocumentSnapshot | { error: string }>({ kind: "read_document" }, tab.id);
    if ("error" in doc) throw new Error(doc.error);
    if (!doc.text || !doc.headings.length) throw new Error("No visible document section was found.");
    docsTabId = tab.id;
    const preferred = doc.headings.find((h) => /^(Create a database|Grant access|Grant a single IAM role|Required roles and permissions)$/i.test(h)) ?? doc.headings[0];
    const highlight = await toPage<unknown>({ kind: "highlight_document", heading: preferred }, docsTabId);
    if (!highlight || typeof highlight !== "object" || !("found" in highlight) || highlight.found !== true) {
      docsTabId = undefined;
      throw new Error(`Couldn't point to “${preferred}” on this page.`);
    }
    sendServer({ type: "text", text: briefPrompt(doc) });
    say("user", "Brief me from this page.");
    open = null;
  },
});
let connectionAttempt = 0;
// The Live connection opens on the first typed message or Talk press; input sent meanwhile waits here.
let connecting = false;
let ready = false;
// Each queued message carries the memory entry to record once it is delivered (or dropped).
let pending: { raw: string; remember?: [Entry["kind"], string] }[] = [];
let pendingAudio = 0;
// Base64 characters of speech kept while connecting: under the relay's two-second audio burst.
const PENDING_AUDIO_LIMIT = 64_000;
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
let voiceOn = true;
const voice = $<HTMLButtonElement>("#voice");
voice.disabled = true;
function renderVoice() {
  speaker.setMuted(!voiceOn);
  voice.setAttribute("aria-pressed", String(voiceOn));
  voice.textContent = voiceOn ? "Voice on" : "Voice off";
  voice.title = `Spoken replies ${voiceOn ? "on" : "off"} (Alt+Shift+V)`;
}
function toggleVoice() {
  if (voice.disabled) return;
  voiceOn = !voiceOn;
  renderVoice();
  $("#voice-status").textContent = voiceOn
    ? "Spoken replies on · next reply will be spoken"
    : "Spoken replies off · replies stay in the chat";
  void chrome.storage.local.set({ voiceOut: voiceOn }).catch(() => {
    $("#voice-status").textContent += " · preference could not be saved";
  });
}
voice.addEventListener("click", toggleVoice);
// The tab the panel guides: the active tab. Only its pages may speak to the coach.
let boundTab: number | undefined;
// A blocking warning waiting for a connection; shown prominently if that connection fails.
let pendingWarning: string | undefined;

// ---------- Startup ----------

async function init() {
  const saved = await chrome.storage.local.get("voiceOut").catch(() => ({ voiceOut: undefined }));
  voiceOn = saved.voiceOut !== false;
  renderVoice();
  voice.disabled = false;
  setStatus(IDLE_STATUS, "idle");
  void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => { boundTab ??= tab?.id; }).catch(() => {});
  await loadRules();
  const profile = await chrome.identity.getProfileUserInfo({ accountStatus: chrome.identity.AccountStatus.ANY }).catch(() => null);
  firstName = profile?.email ? profile.email.split("@")[0].split(/[._-]/)[0] : undefined;
}

async function loadRules() {
  try {
    rules = (await (await fetch(`${HTTP}/rules`)).json()).rules;
  } catch {
    rules = (await (await fetch(chrome.runtime.getURL("rules.json"))).json()).rules;
  }
}

function setStatus(text: string, state: "on" | "off" | "busy" | "idle") {
  status.replaceChildren(stateGlyph(state === "on" ? "go" : "check"), document.createTextNode(text));
  status.dataset.state = state;
}

// ---------- Conversation log ----------

let open: { role: string; el: HTMLElement } | null = null;

function say(role: "user" | "model" | "system" | "step" | "alert", text: string) {
  const standalone = role === "system" || role === "step" || role === "alert";
  if (open && open.role === role && !standalone) {
    open.el.textContent += text;
  } else {
    const el = document.createElement("p");
    el.className = `msg ${role}`;
    if (role === "alert") el.setAttribute("role", "alert");
    el.textContent = text;
    log.append(el);
    open = standalone ? null : { role, el };
  }
  log.scrollTop = log.scrollHeight;
}

// ---------- Connection to the relay ----------

const IDLE_STATUS = `Type or press Talk to connect to ${SERVER_HOST}`;

async function connect() {
  restartPending = false;
  liveReady = false;
  const attempt = ++connectionAttempt;
  ws?.close();
  ws = undefined;
  ready = false;
  connecting = true;
  setStatus("Connecting…", "busy");
  const params = new URLSearchParams({ mode });
  if (mode === "guide" && compiledGoal) params.set("goalId", FIRESTORE_GOAL.id);
  if (mode === "guide" && resumeHandle) params.set("resume", resumeHandle);
  if (mode === "teach" && teach) params.set("goal", teach.goal);
  let credential: string;
  try {
    const response = await fetch(`${HTTP}/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const body = await response.json();
    if (!response.ok || typeof body.credential !== "string") throw new Error(body.error ?? "Session admission failed.");
    credential = body.credential;
  } catch (error) {
    if (attempt !== connectionAttempt) return;
    disconnect(`Can't connect to ${SERVER_HOST}. Type or press Talk to retry`);
    say("system", error instanceof Error ? error.message : "Session admission failed.");
    return;
  }
  if (attempt !== connectionAttempt) return;
  params.set("credential", credential);
  const sock = new WebSocket(`${SERVER}/live?${params}`);
  ws = sock;
  sock.onmessage = (e) => {
    if (ws !== sock) return;
    const msg = JSON.parse(e.data);
    if (msg.type === "ready") onReady();
    void onServer(msg);
  };
  sock.onclose = () => { if (ws === sock) disconnect("Disconnected. Type or press Talk to reconnect"); };
  sock.onerror = () => { if (ws === sock) setStatus(`Can't reach ${SERVER_HOST}`, "off"); };
}

function onReady() {
  liveReady = true;
  ready = true;
  connecting = false;
  setStatus(`Connected to ${SERVER_HOST}`, "on");
  const summary = memory.summary();
  if (summary) sendServer({ type: "session", text: summary });
  const queued = pending;
  pending = [];
  pendingAudio = 0;
  pendingWarning = undefined;
  for (const { raw, remember } of queued) {
    ws?.send(raw);
    if (remember) memory.add(...remember);
  }
}

// Closes the Live connection without opening another; the next typed message or Talk press reconnects.
function disconnect(text: string, state: "off" | "idle" = "off") {
  connectionAttempt++;
  const sock = ws;
  ws = undefined;
  liveReady = false;
  ready = false;
  connecting = false;
  for (const { remember } of pending) if (remember) memory.add(...remember);
  pending = [];
  pendingAudio = 0;
  sock?.close();
  speaker.interrupt();
  speaker.turnEnded();
  held.audio = [];
  if (talking) stopTalking();
  setStatus(text, state);
  if (pendingWarning) say("alert", pendingWarning);
  pendingWarning = undefined;
}

function sendServer(msg: object) {
  if (!ready || ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

// User input: delivered now, or kept and delivered once the connection it opens is ready.
function sendInput(msg: { type: "text" | "event"; text: string } | { type: "audio"; data: string } | { type: "audio_end" }, remember?: [Entry["kind"], string]) {
  if (sendServer(msg)) {
    if (remember) memory.add(...remember);
    return;
  }
  if (msg.type === "audio") {
    if (pendingAudio + msg.data.length > PENDING_AUDIO_LIMIT) return;
    pendingAudio += msg.data.length;
  }
  pending.push({ raw: JSON.stringify(msg), remember });
  if (!connecting) void connect();
}

async function onServer(msg: any) {
  switch (msg.type) {
    case "audio":
      speaker.beginTurn();
      if (mode === "teach") held.audio.push(msg.data);
      else speaker.play(msg.data);
      break;
    case "interrupted": speaker.interrupt(); speaker.turnEnded(); held.audio = []; break;
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
      speaker.turnEnded();
      if (restartPending && !toolCalls && mode === "guide") { ws?.close(); connect(); }
      break;
    case "resumption":
      if (mode === "guide" && !restartPending) { resumeHandle = msg.handle; void chrome.storage.session.set({ resumeHandle }); }
      break;
    case "error": say("system", msg.message); break;
    case "tool_call": {
      toolCalls++;
      try {
        const response = await runTool(msg.name, msg.args).catch((err: Error) => ({ error: err.message }));
        sendServer({ type: "tool_result", id: msg.id, name: msg.name, response });
      } finally { toolCalls--; }
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
  const generation = binding.generation;
  const wasBound = binding.tabId !== undefined;
  const tab = wasBound
    ? await binding.tab()
    : tabId === undefined ? await activeTab() : await chrome.tabs.get(tabId);
  if (generation !== binding.generation) throw new Error("The Journey changed. Re-read the page.");
  if (wasBound && tabId !== undefined && tabId !== tab.id) throw new Error("Journey paused: that is not the bound tab.");
  if (tab.url && new URL(tab.url).hostname === "accounts.google.com") throw new Error("Sign-in pages are never read.");
  const command = wasBound ? { ...msg, expectedUrl: tab.url } : msg;
  let result: T;
  try {
    if (generation !== binding.generation) throw new Error("The Journey changed. Re-read the page.");
    result = await chrome.tabs.sendMessage(tab.id!, command);
  } catch {
    // A tab open before installation needs the content script once.
    if (generation !== binding.generation) throw new Error("The Journey changed. Re-read the page.");
    if (wasBound) await binding.tab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ["content.js"] }).catch(() => {
      throw new Error("GuideRail can't see this tab. Open a supported Google page.");
    });
    if (generation !== binding.generation) throw new Error("The Journey changed. Re-read the page.");
    if (wasBound) await binding.tab();
    result = await chrome.tabs.sendMessage(tab.id!, command);
  }
  if (generation !== binding.generation) throw new Error("The Journey changed. Re-read the page.");
  if (binding.tabId !== undefined) {
    const current = await binding.tab();
    if (current.url !== tab.url) throw new Error("The page changed. Re-read the bound Journey tab.");
  }
  if (result && typeof result === "object" && "error" in result) throw new Error(String(result.error));
  return result;
}

async function runTool(name: string, args: Record<string, any>): Promise<Record<string, unknown>> {
  switch (name) {
    case "open_page":
      parseCompileRequest(args);
      await journeyPanel.openJourney();
      return { opened: true, goalId: FIRESTORE_GOAL.id, note: "Journey bound. Choose your project yourself; Guide never clicks or fills." };
    case "read_page":
    case "highlight_document":
    case "highlight": {
      const tab = binding.tabId !== undefined ? await binding.tab() : await activeTab();
      const route = routePageTool(name, args, docsTabId, tab);
      if (route.ended) {
        docsTabId = undefined;
        appEvent(`The briefing ended: the person left the public docs. ${compiledGoal ? "Continue the compiled Firestore Journey" : "Continue guiding"} on the current page.`);
      }
      if (route.message.kind === "read_page") return readSnapshot(tab);
      if (route.message.kind === "highlight") return runHighlight(args);
      return toPage(route.message, tab.id);
    }
    case "customize":
      return toPage({ kind: "customize", preset: parseCalmPreset(args.preset) });
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
      const sandbox = tab.url?.startsWith(`${HTTP}/sandbox/`);
      const base = sandbox ? `${HTTP}/sandbox/gmail-compose.html?` : "https://mail.google.com/mail/?view=cm&";
      const q = new URLSearchParams({ to: String(args.to ?? ""), su: String(args.subject ?? ""), body: String(args.body ?? "") });
      await chrome.tabs.create({ url: base + q.toString() });
      say("system", "Drafted the request. Review it and click Send yourself.");
      return { opened: true, note: "The user must review and click Send." };
    }
    case "complete_step":
      if (binding.tabId !== undefined) return { error: "Use the Journey's explicit Next or Skip control. A model cannot verify a Step or database creation." };
      say("step", `Done · ${args.summary}`);
      log.lastElementChild?.prepend(stateGlyph("go"));
      return { ok: true };
    default:
      return { error: `Unknown tool ${name}` };
  }
}

async function readSnapshot(tab: chrome.tabs.Tab): Promise<PageSnapshot> {
  const snap = await toPage<PageSnapshot>({ kind: "read_page" }, tab.id);
  bound = { tabId: tab.id!, url: tab.url ?? snap.url, generation: snap.generation, elements: snap.elements };
  boundStale = false;
  return snap;
}

async function runHighlight(args: Record<string, unknown>): Promise<HighlightResult> {
  const text = String(args.text ?? "");
  const role = args.role == null || args.role === "" ? undefined : String(args.role);
  const section = args.section == null || args.section === "" ? undefined : String(args.section);
  const citation = args.citation == null || args.citation === "" ? undefined : String(args.citation);
  let tabId: number | null = null;
  try {
    tabId = (binding.tabId !== undefined ? await binding.tab() : await activeTab()).id ?? null;
  } catch {
    tabId = null;
  }
  const snap = bound;
  const decision = authorizeTarget({ text, role, section, citation, snapshot: snap, stale: boundStale, tabId });
  if (!actionAuthorized(decision)) {
    say("system", highlightOutcome(decision));
    await clearBoundHighlight();
    return highlightResult(decision);
  }
  const live = await toPage<HighlightResult>({
    kind: "highlight",
    text,
    ...(role ? { role } : {}),
    ...(section ? { section } : {}),
    generation: snap!.generation,
    index: decision.i,
    name: decision.name,
  }, snap!.tabId);
  if (!live.found) {
    if (live.reason === "stale") boundStale = true;
    say("system", highlightOutcome(live));
    await clearBoundHighlight();
    return live;
  }
  return { ...live, i: decision.i, name: decision.name, confidence: decision.confidence };
}

function clearJourneyPointer(): Promise<unknown> {
  const snapshot = bound;
  if (!snapshot || snapshot.tabId !== binding.tabId) return Promise.resolve();
  return chrome.tabs.sendMessage(snapshot.tabId, { kind: "clear_highlight", expectedUrl: snapshot.url } satisfies ToPage).catch(() => {});
}

async function clearBoundHighlight() {
  if (!bound) return;
  await toPage({ kind: "clear_highlight" }, bound.tabId).catch(() => {});
}

// ---------- Guide: suggested values before the user types ----------

function renderGuidance(items: ReturnType<typeof guidance>) {
  card.hidden = items.length === 0;
  card.replaceChildren();
  const h = document.createElement("h2");
  h.replaceChildren(stateGlyph("check"), document.createTextNode("Suggested labels"));
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
      const state = violationState(v.severity);
      const field = document.createElement("span");
      field.className = "field";
      field.append(stateGlyph(state), document.createTextNode(`${STATES[state].label} · ${violationFieldLabel(v.field)}`));
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

type TabChanged = { kind: "tab_changed"; tabId: number; url?: string } | { kind: "toggle_voice" };

chrome.runtime.onMessage.addListener((msg: FromPage | TabChanged, sender, reply) => {
  if (msg.kind === "teach_status") { reply({ on: mode === "teach" && binding.tabId === undefined }); return; }
  if (msg.kind === "tab_changed" || msg.kind === "toggle_voice") { handlePageMessage(msg, sender); return; }
  if (sender.frameId && sender.frameId !== 0) return;
  if (binding.tabId !== undefined) {
    if (sender.tab?.id !== binding.tabId) return;
    const paused = "Journey paused: return the bound tab to its Firebase Firestore project.";
    // Chrome keeps sender.url at the document's load URL across in-page route changes, so only its origin is trusted; the project comes from the bound tab's current URL.
    if (!sender.url || new URL(sender.url).origin !== "https://console.firebase.google.com") { journeyPanel.invalidate(paused); return; }
    const generation = binding.generation;
    void binding.tab().then((tab) => {
      if (generation !== binding.generation || sender.tab?.id !== tab.id) return;
      const url = new URL(tab.url!);
      if ((msg.kind === "form_changed" || msg.kind === "submit_intent") && msg.form.url !== url.host + url.pathname) return;
      handlePageMessage(msg, sender);
    }).catch((error) => { if (generation === binding.generation) journeyPanel.invalidate(error instanceof Error ? error.message : paused); });
    return;
  }
  if (sender.tab?.id === undefined || sender.tab.id !== boundTab) return;
  if (sender.url && new URL(sender.url).hostname === "accounts.google.com") return;
  handlePageMessage(msg, sender);
});

function handlePageMessage(msg: Exclude<FromPage, { kind: "teach_status" }> | TabChanged, sender: chrome.runtime.MessageSender) {
  switch (msg.kind) {
    case "toggle_voice": toggleVoice(); break;
    case "customize_event":
      say("system", msg.text);
      appEvent(msg.text);
      break;
    case "tab_changed":
      boundTab = msg.tabId;
      if (binding.tabId !== undefined) {
        if (msg.tabId === binding.tabId && msg.url && binding.accepts({ id: msg.tabId, url: msg.url })) journeyPanel.invalidate("The page changed. Re-read this Step before continuing.", true);
        else journeyPanel.invalidate("The tab changed. Return to the bound Firestore tab and re-read this Step.");
        card.hidden = true; issues.hidden = true;
      } else if (mode === "teach") void followTab(msg.tabId);
      // A reload of the coached tab drops the content script's generation counter, so the old snapshot cannot authorize a target.
      if (bound && msg.tabId === bound.tabId && msg.url) {
        boundStale = true;
        void clearBoundHighlight();
      }
      break;
    case "page_event":
      if (binding.tabId !== undefined) {
        if (msg.generation === undefined) journeyPanel.acted("You clicked the highlighted control. Choose I did this · Next step, or re-read this Step.");
        else journeyPanel.invalidate("The page changed. Re-read this Step before continuing.", true);
      }
      if (bound && sender.tab?.id === bound.tabId && msg.generation !== undefined && msg.generation !== bound.generation) {
        boundStale = true;
        void clearBoundHighlight();
      }
      say("system", msg.text);
      memory.add("page", msg.text);
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
        // A blocking warning is worth a connection: the coach should say it out loud.
        const event = { type: "event" as const, text };
        if (sendServer(event) || !blocking.length) memory.add("page", text);
        else {
          pendingWarning = text;
          sendInput(event, ["page", text]);
        }
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
}

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
  if (on && binding.tabId !== undefined) journeyPanel.endJourney();
  mode = on ? "teach" : "guide";
  docsTabId = undefined;
  journeyPanel.setEnabled(!on);
  showTeachButton(on);
  disconnect(IDLE_STATUS, "idle");
  if (on) {
    violations = [];
    issues.hidden = true;
    $("#issues-list").replaceChildren();
    $("#issues-summary").textContent = "";
    await toPage({ kind: "show_violations", violations: [] }).catch(() => {});
  }
  await toPage({ kind: "teach", on }).catch(() => {});
  $("#teachbar").hidden = !on;
}

// The Teach button is a toggle and shows its state at once, before the mode switch finishes.
function showTeachButton(on: boolean) {
  const button = $<HTMLButtonElement>("#teach");
  button.toggleAttribute("data-on", on);
  button.setAttribute("aria-pressed", String(on));
  button.replaceChildren(...(on ? [stateGlyph("check"), document.createTextNode("Teaching")] : [document.createTextNode("Teach")]));
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
    say("system", `Couldn't reach ${SERVER_HOST}. Try drafting again.`);
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
    say("system", "Couldn't reach the configured GuideRail coach. Your draft is still here; press Publish to try again.");
    return;
  }
  if (!res.ok) { say("system", `Publishing failed: ${await errorText(res)}. Your draft is still here; press Publish to try again.`); return; }
  $("#draft").hidden = true;
  say("system", `Published "${draft.title}". New hires will be guided by it from their next session.`);
  memory.add("app", `Playbook "${draft.title}" was published and is now used for guiding`);
  draft = null;
  await loadRules();
  // The next Guide session starts fresh so the relay loads the new Playbook.
  resumeHandle = undefined;
  void chrome.storage.session.remove("resumeHandle");
  disconnect(IDLE_STATUS, "idle");
  say("system", "The next conversation will use the new Playbook.");
});

// ---------- Input ----------

for (const [id, preset] of [["#calmer", "calm"], ["#restore", null]] as const) {
  $(id).addEventListener("click", () => {
    void runTool("customize", { preset }).then((result) => {
      if (result.error) say("system", String(result.error));
    }).catch((err: Error) => say("system", err.message));
  });
}

$("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  say("user", text);
  open = null;
  lastSent = { text, at: Date.now() };
  sendInput({ type: "text", text }, ["user", text]);
  input.value = "";
});

async function startTalking() {
  try {
    await mic.start((data) => sendInput({ type: "audio", data }));
    talking = true;
    talk.setAttribute("aria-pressed", "true");
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
  talk.setAttribute("aria-pressed", "false");
  talk.textContent = "Talk";
  delete talk.dataset.on;
  if (ready || connecting) sendInput({ type: "audio_end" });
}

talk.addEventListener("click", () => (talking ? stopTalking() : void startTalking()));

void init();
