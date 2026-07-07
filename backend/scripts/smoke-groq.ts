#!/usr/bin/env tsx
/**
 * Opt-in smoke test: if GROQ_API_KEY is configured, transcribe a tiny synthetic
 * audio sample through the real Groq API and print the result. Skips politely
 * (exit 0) when no key is present so CI/local runs without secrets don't fail.
 */
import { env } from "../src/env.js";
import { createGroqTranscriber } from "../src/services/groq.js";

/**
 * A minimal valid WAV file: 8kHz, 16-bit mono PCM, ~0.5s of a faint tone (not
 * true silence, since some ASR APIs reject or empty-transcribe silence).
 */
function buildSyntheticWav(): Buffer {
  const sampleRate = 8000;
  const durationSec = 0.5;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * 220 * t) * 3000);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

async function main(): Promise<void> {
  if (!env.GROQ_API_KEY) {
    console.log("[smoke:groq] GROQ_API_KEY not set — skipping live Groq smoke test.");
    return;
  }

  const transcriber = createGroqTranscriber();
  const audio = buildSyntheticWav();
  console.log("[smoke:groq] Sending synthetic audio to Groq whisper-large-v3 (language=bs)...");
  const transcript = await transcriber.transcribe(audio, "smoke.wav");
  console.log(`[smoke:groq] Transcript: ${JSON.stringify(transcript)}`);
}

main().catch((err) => {
  console.error("[smoke:groq] Failed:", err);
  process.exit(1);
});
