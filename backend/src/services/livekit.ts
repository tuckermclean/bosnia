import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { env } from "../env.js";

export interface TutorRoomGrant {
  token: string;
  url: string;
  roomName: string;
}

/** JSON shape written to the LiveKit room's metadata — read back by
 * voice-agent/agent.py's `_session_metadata()` via `ctx.room.metadata`. */
export interface TutorRoomMetadata {
  level?: string;
  scenario?: string;
}

/** Injectable minter so the tutor route can be tested without LiveKit secrets. */
export interface RoomTokenMinter {
  mint(identity: string, roomName: string, metadata?: TutorRoomMetadata): Promise<TutorRoomGrant>;
}

/** The LiveKit server (room/egress/etc.) APIs take an http(s) host; the
 * realtime `LIVEKIT_URL` used by clients/the token grant is typically
 * wss://. Same LiveKit project, different scheme. */
function toHttpUrl(url: string): string {
  return url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

export function createLiveKitMinter(
  apiKey = env.LIVEKIT_API_KEY,
  apiSecret = env.LIVEKIT_API_SECRET,
  url = env.LIVEKIT_URL,
): RoomTokenMinter {
  const roomService = new RoomServiceClient(toHttpUrl(url), apiKey, apiSecret);

  return {
    async mint(identity, roomName, metadata) {
      if (metadata && (metadata.level || metadata.scenario)) {
        // Set the learner's CEFR level / role-play scenario as JSON room
        // metadata *before* minting the join token, so it's already present
        // when the voice-agent worker picks up the job for this room.
        const metadataJson = JSON.stringify(metadata);
        try {
          await roomService.createRoom({ name: roomName, metadata: metadataJson });
        } catch {
          // Race-safe fallback in case the room already exists.
          await roomService.updateRoomMetadata(roomName, metadataJson);
        }
      }

      const at = new AccessToken(apiKey, apiSecret, { identity, ttl: "1h" });
      at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
      const token = await at.toJwt();
      return { token, url, roomName };
    },
  };
}
