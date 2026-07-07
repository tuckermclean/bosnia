import type { Transcriber } from "../src/services/groq.js";
import type { RoomTokenMinter, TutorRoomGrant, TutorRoomMetadata } from "../src/services/livekit.js";

/** A transcriber fake that always returns a fixed transcript, for tests. */
export function fakeTranscriber(transcript: string): Transcriber {
  return {
    async transcribe() {
      return transcript;
    },
  };
}

export interface FakeMinterCall {
  identity: string;
  roomName: string;
  metadata?: TutorRoomMetadata;
}

/** A LiveKit minter fake that returns fixed/overridable grant fields, for tests.
 * Records every `mint()` call (incl. the metadata argument) on `.calls` so
 * tests can assert what the tutor route asked it to set. */
export function fakeMinter(overrides: Partial<TutorRoomGrant> = {}): RoomTokenMinter & { calls: FakeMinterCall[] } {
  const calls: FakeMinterCall[] = [];
  return {
    calls,
    async mint(identity, roomName, metadata) {
      calls.push({ identity, roomName, metadata });
      return {
        token: overrides.token ?? "fake-token",
        url: overrides.url ?? "wss://fake.livekit.cloud",
        roomName: overrides.roomName ?? roomName,
      };
    },
  };
}
