import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import type { WebSocket } from "ws";
import { runServerTool, SERVER_TOOLS, tools } from "./tools.ts";
import { instructionFor, playbookTitle, type Mode } from "./instructions.ts";
import { guideJourneyInstruction } from "./journeys/compile.ts";
import { loadPlaybooks, loadRuleLines } from "./playbooks/load.ts";

// Messages between the side panel and this relay. Audio is base64 PCM16:
// 16 kHz from the client, 24 kHz to the client.
export type ClientMessage =
  | { type: "audio"; data: string }
  | { type: "audio_end" }
  | { type: "text"; text: string }
  | { type: "event"; text: string } // a page event the model should respond to, e.g. a new Violation or an expert choice
  | { type: "session"; text: string } // summary of this side-panel session, sent once when a connection opens
  | { type: "app"; text: string } // something the app did, e.g. a Playbook draft is ready
  | { type: "context"; text: string } // a page event the model should only know about, with no reply, e.g. a click while teaching
  | { type: "tool_result"; id: string; name: string; response: Record<string, unknown> };

export type ServerMessage =
  | { type: "ready" }
  | { type: "audio"; data: string }
  | { type: "transcript"; role: "user" | "model"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "resumption"; handle: string }
  | { type: "error"; message: string };

const project = process.env.GOOGLE_CLOUD_PROJECT ?? "zoop-innovation";
const location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
const model = process.env.LIVE_MODEL ?? "gemini-live-2.5-flash-native-audio";
const MAX_SESSION_MS = 10 * 60 * 1000;
export const IDLE_MS = 60 * 1000;
const ACTIVITY = new Set<ClientMessage["type"]>(["text", "audio_end", "event", "context", "app"]);

const ai = new GoogleGenAI({ vertexai: true, project, location });

async function buildInstruction(mode: Mode, goal?: string, goalId?: string): Promise<string> {
  const playbooks = await loadPlaybooks();
  if (mode === "guide") return instructionFor("guide", playbooks, {}, await guideJourneyInstruction(goalId));
  return instructionFor("teach", playbooks, { goal, rules: await loadRuleLines(), playbookTitles: playbooks.map(playbookTitle) });
}

/**
 * Relays one client to Vertex Live. Returns `end`, which closes the billable Live session at once and then the client.
 * `release` runs once, as soon as the Live session is shut down, without waiting for the client's close handshake.
 */
export function relay(client: WebSocket, resumptionHandle?: string, mode: Mode = "guide", goal?: string, release: () => void = () => {}, goalId?: string) {
  const send = (msg: ServerMessage) => client.readyState === client.OPEN && client.send(JSON.stringify(msg));

  let session: Session | undefined;
  const started = Date.now();
  let audioBytes = 0;
  let textChars = 0;
  let turns = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(cap);
    clearTimeout(idle);
    session?.close();
    release();
  };
  const end = (reason: string, message: string) => {
    send({ type: "error", message });
    shutdown();
    client.close(4000, reason);
  };
  // Only user input, page activity and model output keep a connection open; raw mic frames (often silence) do not.
  const active = () => {
    clearTimeout(idle);
    if (client.readyState !== client.OPEN) return;
    idle = setTimeout(() => end("idle", "Disconnected after one minute without activity. Type or press Talk to reconnect."), IDLE_MS);
  };
  const cap = setTimeout(() => end("session limit", "This demo session reached its ten-minute limit. Type or press Talk to reconnect if today's allowance remains."), MAX_SESSION_MS);
  client.once("close", shutdown);
  void open();
  return end;

  async function open() {
    try {
      session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          maxOutputTokens: 512,
          systemInstruction: await buildInstruction(mode, goal, goalId),
          tools: mode === "teach" ? [] : [{ functionDeclarations: tools }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
          contextWindowCompression: { triggerTokens: "8192", slidingWindow: { targetTokens: "4096" } },
        },
        callbacks: {
          onmessage: (msg) => {
            forward(msg, send, session);
            if (msg.serverContent || msg.toolCall) active();
            if (msg.serverContent?.turnComplete && ++turns >= 8) {
              end("reply allowance reached", "This demo session reached its eight-reply allowance. Reconnect if today's allowance remains.");
            }
          },
          onerror: (e) => send({ type: "error", message: String(e.message ?? e) }),
          onclose: () => { shutdown(); client.close(); },
        },
      });
    } catch (err) {
      shutdown();
      send({ type: "error", message: `Couldn't reach the voice model: ${(err as Error).message}` });
      client.close();
      return;
    }

    if (stopped || client.readyState !== client.OPEN) { session.close(); shutdown(); return; }
    send({ type: "ready" });
    active();

    client.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!session || !msg || typeof msg !== "object") return;
      if ("text" in msg && (typeof msg.text !== "string" || msg.text.length > 4000)) return;
      if (msg.type === "audio" && (typeof msg.data !== "string" || msg.data.length > 48_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(msg.data))) return;
      if (msg.type === "tool_result" && (typeof msg.id !== "string" || typeof msg.name !== "string" || !msg.response || typeof msg.response !== "object")) return;
      if ("text" in msg) textChars += msg.text.length;
      if (msg.type === "audio") audioBytes += Buffer.byteLength(msg.data, "base64");
      if (textChars > 24_000 || audioBytes > (Date.now() - started) * 32 + 64_000) {
        end("input allowance reached", "This demo session reached its input allowance.");
        return;
      }
      if (ACTIVITY.has(msg.type)) active();
      switch (msg.type) {
        case "audio":
          session.sendRealtimeInput({ audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" } });
          break;
        case "audio_end":
          session.sendRealtimeInput({ audioStreamEnd: true });
          break;
        case "text":
          session.sendClientContent({ turns: [{ role: "user", parts: [{ text: msg.text }] }], turnComplete: true });
          break;
        case "event":
          session.sendClientContent({ turns: [{ role: "user", parts: [{ text: `[page event] ${msg.text}` }] }], turnComplete: true });
          break;
        case "session":
          session.sendClientContent({ turns: [{ role: "user", parts: [{ text: `[session so far]\n${msg.text}` }] }], turnComplete: false });
          break;
        case "app":
          session.sendClientContent({ turns: [{ role: "user", parts: [{ text: `[app event] ${msg.text}` }] }], turnComplete: false });
          break;
        case "context":
          // Context only: the model takes it in without starting a reply.
          session.sendClientContent({ turns: [{ role: "user", parts: [{ text: `[page event] ${msg.text}` }] }], turnComplete: false });
          break;
        case "tool_result":
          session.sendToolResponse({ functionResponses: [{ id: msg.id, name: msg.name, response: msg.response }] });
          break;
      }
    });
  }
}

function forward(msg: LiveServerMessage, send: (m: ServerMessage) => void, session: Session | undefined) {
  for (const call of msg.toolCall?.functionCalls ?? []) {
    const name = call.name ?? "";
    const args = (call.args ?? {}) as Record<string, unknown>;
    // Server tools run here and answer the model directly; the client never sees them.
    if (SERVER_TOOLS.has(name)) {
      void runServerTool(name, args)
        .catch((err: Error) => ({ error: err.message }))
        .then((response) => session?.sendToolResponse({ functionResponses: [{ id: call.id, name, response }] }));
      continue;
    }
    send({ type: "tool_call", id: call.id ?? "", name, args });
  }
  const content = msg.serverContent;
  if (content) {
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) send({ type: "audio", data: part.inlineData.data });
    }
    if (content.inputTranscription?.text) send({ type: "transcript", role: "user", text: content.inputTranscription.text });
    if (content.outputTranscription?.text) send({ type: "transcript", role: "model", text: content.outputTranscription.text });
    if (content.interrupted) send({ type: "interrupted" });
    if (content.turnComplete) send({ type: "turn_complete" });
  }
  const update = msg.sessionResumptionUpdate;
  if (update?.resumable && update.newHandle) send({ type: "resumption", handle: update.newHandle });
}
