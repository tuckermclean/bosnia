import type { Transcriber } from "../src/services/groq.js";
import type { RoomTokenMinter, TutorRoomGrant } from "../src/services/livekit.js";

/** A transcriber fake that always returns a fixed transcript, for tests. */
export function fakeTranscriber(transcript: string): Transcriber {
  return {
    async transcribe() {
      return transcript;
    },
  };
}

/** A LiveKit minter fake that returns fixed/overridable grant fields, for tests. */
export function fakeMinter(overrides: Partial<TutorRoomGrant> = {}): RoomTokenMinter {
  return {
    async mint(_identity, roomName) {
      return {
        token: overrides.token ?? "fake-token",
        url: overrides.url ?? "wss://fake.livekit.cloud",
        roomName: overrides.roomName ?? roomName,
      };
    },
  };
}
