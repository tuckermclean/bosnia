import Groq, { toFile } from "groq-sdk";
import { env } from "../env.js";
import { FeatureUnavailableError, missingSettings } from "../unavailable.js";

/** Injectable transcriber so routes can be tested without hitting Groq. */
export interface Transcriber {
  transcribe(audio: Buffer, filename: string): Promise<string>;
}

/** Real Groq-backed transcriber: whisper-large-v3, forced to Bosnian. */
export function createGroqTranscriber(apiKey = env.GROQ_API_KEY): Transcriber {
  return {
    async transcribe(audio, filename) {
      const missing = missingSettings({ GROQ_API_KEY: apiKey });
      if (missing.length > 0) throw new FeatureUnavailableError("pronunciation", missing);
      const client = new Groq({ apiKey });
      const file = await toFile(audio, filename);
      const result = await client.audio.transcriptions.create({
        file,
        model: "whisper-large-v3",
        language: "bs",
        temperature: 0,
      });
      return result.text.trim();
    },
  };
}
