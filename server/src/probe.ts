// One-off check that Vertex Live connects, calls a tool and answers with audio.
// Run: npm run probe -w server
import { GoogleGenAI, Modality, type LiveServerMessage } from "@google/genai";

const project = process.env.GOOGLE_CLOUD_PROJECT ?? "zoop-innovation";
const location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
const model = process.env.LIVE_MODEL ?? "gemini-live-2.5-flash-native-audio";

const ai = new GoogleGenAI({ vertexai: true, project, location });

let audioBytes = 0;
let transcript = "";
const done = new Promise<void>((resolve) => setTimeout(resolve, 30_000));

const session = await ai.live.connect({
  model,
  config: {
    responseModalities: [Modality.AUDIO],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.LIVE_VOICE ?? "Aoede" } } },
    outputAudioTranscription: {},
    systemInstruction: "You guide users through web UIs. Always call read_page before answering where something is.",
    tools: [{ functionDeclarations: [{ name: "read_page", description: "List the interactive elements on the current page." }] }],
  },
  callbacks: {
    onopen: () => console.log(`open: ${model} @ ${location}`),
    onmessage: (msg: LiveServerMessage) => {
      for (const call of msg.toolCall?.functionCalls ?? []) {
        console.log(`toolCall: ${call.name}`);
        session.sendToolResponse({
          functionResponses: [{
            id: call.id, name: call.name,
            response: { elements: [{ i: 1, role: "button", name: "Create service" }, { i: 2, role: "region", name: "Labels" }] },
          }],
        });
      }
      for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) audioBytes += Buffer.from(part.inlineData.data, "base64").length;
      }
      if (msg.serverContent?.outputTranscription?.text) transcript += msg.serverContent.outputTranscription.text;
      if (msg.serverContent?.turnComplete && audioBytes > 0) {
        console.log(`audio: ${audioBytes} bytes (~${(audioBytes / 48000).toFixed(1)} s at 24 kHz)`);
        console.log(`said: ${transcript.trim()}`);
        session.close();
        process.exit(0);
      }
    },
    onerror: (e) => console.error("error:", e.message ?? e),
    onclose: (e) => console.log(`close: ${e.code} ${e.reason}`),
  },
});

session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "Where do I add labels on this page?" }] }], turnComplete: true });
await done;
console.log("timed out");
process.exit(1);
