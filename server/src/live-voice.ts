const DEFAULT_LIVE_VOICE = "Erinome";

export function liveSpeechConfig() {
  return { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.LIVE_VOICE || DEFAULT_LIVE_VOICE } } };
}
