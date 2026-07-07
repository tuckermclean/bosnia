import { buildApp } from "./app.js";
import { createDbHandle } from "./db/client.js";
import { assertProductionSecretsAreSafe, env } from "./env.js";
import { createGroqTranscriber } from "./services/groq.js";
import { createLiveKitMinter } from "./services/livekit.js";

async function main(): Promise<void> {
  assertProductionSecretsAreSafe();

  const { db, initSchema } = createDbHandle();
  await initSchema();

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
