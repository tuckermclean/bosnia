/**
 * Stage 4: batch-synthesize bs-BA reference audio for every vocab item and
 * every listen_choose/speak targetPhrase, via Azure Neural TTS.
 *
 * Content-hashed: hash = sha256(text + "|" + voice). Only text/voice pairs not
 * already in the manifest are (re)synthesized, so reruns are cheap. Writes
 * mp3s to audio-out/<hash>.mp3 and a manifest.json of
 * { [hash]: { url, text, voice } }. Also stamps the resolved hash back onto
 * the vocab item / exercise ("audioHash") in the source-of-truth skill files,
 * then reassembles course.json so both stay in sync.
 *
 * If AZURE_SPEECH_KEY (or AZURE_SPEECH_REGION) is absent, runs in dry-run
 * mode: still computes hashes and writes the manifest with placeholder URLs,
 * logs what would be synthesized, and never throws or hits the network.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AudioManifestSchema, SkillSchema, type AudioManifest } from "./schema.js";
import { assembleCourse } from "./generate.js";
import { AUDIO_DIR, AUDIO_MANIFEST_PATH, SKILLS_DIR } from "./paths.js";

const DEFAULT_VOICE = process.env.AZURE_TTS_VOICE || "bs-BA-VesnaNeural";

export function contentHash(text: string, voice: string): string {
  return createHash("sha256").update(`${text}|${voice}`).digest("hex");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function loadManifest(): Promise<AudioManifest> {
  try {
    const raw = JSON.parse(await readFile(AUDIO_MANIFEST_PATH, "utf-8"));
    return AudioManifestSchema.parse(raw);
  } catch {
    return {};
  }
}

export interface SynthEnv {
  azureKey?: string;
  azureRegion?: string;
  fetchImpl?: typeof fetch;
}

async function synthOne(
  hash: string,
  text: string,
  voice: string,
  env: SynthEnv,
): Promise<{ url: string }> {
  if (!env.azureKey || !env.azureRegion) {
    console.log(`[dry-run] would synthesize "${text}" (${voice}) -> ${hash}.mp3`);
    return { url: `PLACEHOLDER://${hash}.mp3` };
  }

  const doFetch = env.fetchImpl ?? fetch;
  const ssml = `<speak version="1.0" xml:lang="bs-BA"><voice name="${voice}">${escapeXml(text)}</voice></speak>`;
  const res = await doFetch(
    `https://${env.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": env.azureKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "ljiljan-content-pipeline",
      },
      body: ssml,
    },
  );
  if (!res.ok) {
    throw new Error(`Azure TTS request failed (${res.status}): ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const fileName = `${hash}.mp3`;
  await writeFile(path.join(AUDIO_DIR, fileName), buf);
  return { url: `audio-out/${fileName}` };
}

export interface SynthesizeResult {
  manifest: AudioManifest;
  synthesized: number;
  cached: number;
  dryRun: boolean;
}

export async function synthesizeAudio(envOverride?: SynthEnv): Promise<SynthesizeResult> {
  const env: SynthEnv = envOverride ?? {
    azureKey: process.env.AZURE_SPEECH_KEY,
    azureRegion: process.env.AZURE_SPEECH_REGION,
  };
  const dryRun = !(env.azureKey && env.azureRegion);

  await mkdir(AUDIO_DIR, { recursive: true });
  const manifest = await loadManifest();

  let files: string[] = [];
  try {
    files = (await readdir(SKILLS_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }

  let synthesized = 0;
  let cached = 0;

  const ensure = async (text: string): Promise<string> => {
    const hash = contentHash(text, DEFAULT_VOICE);
    if (manifest[hash]) {
      cached += 1;
      return hash;
    }
    const { url } = await synthOne(hash, text, DEFAULT_VOICE, env);
    manifest[hash] = { url, text, voice: DEFAULT_VOICE };
    synthesized += 1;
    return hash;
  };

  for (const file of files) {
    const filePath = path.join(SKILLS_DIR, file);
    const skill = SkillSchema.parse(JSON.parse(await readFile(filePath, "utf-8")));
    let changed = false;

    for (const v of skill.vocab) {
      const hash = await ensure(v.bs);
      if (v.audioHash !== hash) {
        v.audioHash = hash;
        changed = true;
      }
    }

    for (const lesson of skill.lessons) {
      for (const ex of lesson.exercises) {
        if (ex.type !== "listen_choose" && ex.type !== "speak") continue;
        const hash = await ensure(ex.targetPhrase);
        if (ex.audioHash !== hash) {
          ex.audioHash = hash;
          changed = true;
        }
      }
    }

    if (changed) {
      await writeFile(filePath, `${JSON.stringify(skill, null, 2)}\n`, "utf-8");
    }
  }

  await writeFile(AUDIO_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  // Keep the assembled course.json's audioHash fields in sync, if a blueprint
  // (and therefore an assemblable course) exists yet.
  try {
    await assembleCourse();
  } catch {
    // No blueprint/course yet — fine, audio can run before generate in tests.
  }

  return { manifest, synthesized, cached, dryRun };
}

async function main() {
  const result = await synthesizeAudio();
  console.log(
    `Audio ${result.dryRun ? "dry-run" : "synthesis"} complete: ${result.synthesized} new, ${result.cached} already cached. Manifest -> ${AUDIO_MANIFEST_PATH}`,
  );
  if (result.dryRun) {
    console.log("AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set — wrote placeholder URLs only.");
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
