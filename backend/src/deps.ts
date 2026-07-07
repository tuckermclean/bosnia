import type { Db } from "./db/client.js";
import type { Transcriber } from "./services/groq.js";
import type { RoomTokenMinter } from "./services/livekit.js";

/** Everything the routes need, injected so tests can supply fakes. */
export interface AppDeps {
  db: Db;
  transcriber: Transcriber;
  minter: RoomTokenMinter;
}
