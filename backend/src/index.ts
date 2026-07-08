import { buildApp } from "./app.js";
import { maybeAutoSeed } from "./auto-seed.js";
import { createDbHandle } from "./db/client.js";
import { assertProductionSecretsAreSafe, env, isLocalDb } from "./env.js";
import { createGroqTranscriber } from "./services/groq.js";
import { createLiveKitMinter } from "./services/livekit.js";

async function main(): Promise<void> {
  assertProductionSecretsAreSafe();

  const { db, initSchema } = createDbHandle();
  await initSchema();

  // Default: auto-seed only in local dev (no DATABASE_URL) when the DB is
  // empty — production seeding stays a deliberate Job. AUTO_SEED=false/true
  // override the default in either direction (see src/env.ts).
  const shouldAutoSeed = env.AUTO_SEED === "true" ? true : env.AUTO_SEED === "false" ? false : isLocalDb;
  if (shouldAutoSeed) {
    await maybeAutoSeed(db);
  }

  const app = buildApp({
    db,
    transcriber: createGroqTranscriber(),
    minter: createLiveKitMinter(),
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Ljiljan backend listening on port ${env.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
