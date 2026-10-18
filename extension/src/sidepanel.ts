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
import { actionAuthorized, authorizeTarget, highlightOutcome, highlightResult, resolutionResult, type BoundSnapshot } from "./resolve.ts";
import { describeForModel, shouldSpeak, TeachSession } from "./teach/session.ts";
import { SessionLog } from "./sessionlog.ts";
import { parseCalmPreset } from "./calm.ts";

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

// ---------- Startup ----------

async function init() {
  const saved = await chrome.storage.local.get("voiceOut").catch(() => ({ voiceOut: undefined }));
  voiceOn = saved.voiceOut !== false;
  renderVoice();
  voice.disabled = false;
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
  status.replaceChildren(stateGlyph(state === "on" ? "go" : "check"), document.createTextNode(text));
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
  restartPending = false;
  liveReady = false;
  setStatus("Connecting…", "busy");
  const params = new URLSearchParams({ mode });
  if (mode === "guide" && compiledGoal) params.set("goalId", FIRESTORE_GOAL.id);
  if (mode === "guide" && resumeHandle) params.set("resume", resumeHandle);
  if (mode === "teach" && teach) params.set("goal", teach.goal);
  const sock = new WebSocket(`${SERVER}/live?${params}`);
  ws = sock;
  sock.onmessage = (e) => { if (ws === sock) void onServer(JSON.parse(e.data)); };
  sock.onclose = () => {
    if (ws !== sock) return;
    liveReady = false;
    setStatus("Disconnected. Click to reconnect", "off");
    speaker.interrupt();
    speaker.turnEnded();
    held.audio = [];
    if (talking) stopTalking();
  };
  sock.onerror = () => { if (ws === sock) setStatus("Can't reach the GuideRail server on localhost:8787", "off"); };
}

status.addEventListener("click", () => ws?.readyState !== WebSocket.OPEN && connect());

const sendServer = (msg: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

async function onServer(msg: any) {
  switch (msg.type) {
    case "ready":
      liveReady = true;
      setStatus("Ready", "on");
      if (memory.size) sendServer({ type: "session", text: memory.summary() });
      break;
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
      const sandbox = tab.url?.startsWith("http://localhost:8787/sandbox/");
      const base = sandbox ? "http://localhost:8787/sandbox/gmail-compose.html?" : "https://mail.google.com/mail/?view=cm&";
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
  bound = { tabId: tab.id!, url: snap.url, generation: snap.generation, elements: snap.elements };
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
  let decision = authorizeTarget({ text, role, section, citation, snapshot: snap, stale: boundStale, tabId });
  // A bound Journey points only at an exact accessible name, never a fuzzy match.
  if (binding.tabId !== undefined && actionAuthorized(decision) && decision.confidence < 1) {
    decision = { authorized: false, ...(resolutionResult(text, { status: "missing", alternatives: [decision.name] }, citation) as Extract<HighlightResult, { found: false }>) };
  }
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
    if (!sender.tab || !binding.accepts({ id: sender.tab.id, url: sender.url })) {
      if (sender.tab?.id === binding.tabId) journeyPanel.invalidate("Journey paused: return the bound tab to its Firebase Firestore project.");
      return;
    }
    const generation = binding.generation;
    void binding.tab().then((tab) => {
      if (generation !== binding.generation || sender.tab?.id !== tab.id || sender.url !== tab.url) return;
      const url = new URL(tab.url!);
      if ((msg.kind === "form_changed" || msg.kind === "submit_intent") && msg.form.url !== url.host + url.pathname) return;
      handlePageMessage(msg, sender);
    }).catch(() => {});
    return;
  }
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
