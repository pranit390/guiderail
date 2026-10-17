import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import type { WebSocket } from "ws";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runServerTool, SERVER_TOOLS, systemInstruction, tools } from "./tools.ts";

// Messages between the side panel and this relay. Audio is base64 PCM16:
// 16 kHz from the client, 24 kHz to the client.
export type ClientMessage =
  | { type: "audio"; data: string }
  | { type: "audio_end" }
  | { type: "text"; text: string }
  | { type: "event"; text: string } // a page event the model should know about, e.g. a new Violation
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

const ai = new GoogleGenAI({ vertexai: true, project, location });

// Playbooks: how this org does things and where things live in each tool. Appended to the instruction.
const PLAYBOOKS = join(import.meta.dirname, "..", "..", "seed", "playbooks");
const playbooks = readdirSync(PLAYBOOKS)
  .filter((f) => f.endsWith(".md"))
  .map((f) => readFileSync(join(PLAYBOOKS, f), "utf8"))
  .join("\n\n---\n\n");
const instruction = `${systemInstruction}\n\n# Playbooks\n\n${playbooks}`;

export async function relay(client: WebSocket, resumptionHandle?: string) {
  const send = (msg: ServerMessage) => client.readyState === client.OPEN && client.send(JSON.stringify(msg));

  let session: Session;
  try {
    session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: instruction,
        tools: [{ functionDeclarations: tools }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
        contextWindowCompression: { slidingWindow: {} },
      },
      callbacks: {
        onmessage: (msg) => forward(msg, send, session),
        onerror: (e) => send({ type: "error", message: String(e.message ?? e) }),
        onclose: () => client.close(),
      },
    });
  } catch (err) {
    send({ type: "error", message: `Couldn't reach the voice model: ${(err as Error).message}` });
    client.close();
    return;
  }

  const cap = setTimeout(() => client.close(4000, "session limit"), MAX_SESSION_MS);
  send({ type: "ready" });

  client.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
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
      case "tool_result":
        session.sendToolResponse({ functionResponses: [{ id: msg.id, name: msg.name, response: msg.response }] });
        break;
    }
  });

  client.on("close", () => {
    clearTimeout(cap);
    session.close();
  });
}

function forward(msg: LiveServerMessage, send: (m: ServerMessage) => void, session: Session) {
  for (const call of msg.toolCall?.functionCalls ?? []) {
    const name = call.name ?? "";
    const args = (call.args ?? {}) as Record<string, unknown>;
    // Server tools run here and answer the model directly; the client never sees them.
    if (SERVER_TOOLS.has(name)) {
      void runServerTool(name, args)
        .catch((err: Error) => ({ error: err.message }))
        .then((response) => session.sendToolResponse({ functionResponses: [{ id: call.id, name, response }] }));
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
