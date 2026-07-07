import { AccessToken } from "livekit-server-sdk";
import { env } from "../env.js";

export interface TutorRoomGrant {
  token: string;
  url: string;
  roomName: string;
}

/** Injectable minter so the tutor route can be tested without LiveKit secrets. */
export interface RoomTokenMinter {
  mint(identity: string, roomName: string): Promise<TutorRoomGrant>;
}

export function createLiveKitMinter(
  apiKey = env.LIVEKIT_API_KEY,
  apiSecret = env.LIVEKIT_API_SECRET,
  url = env.LIVEKIT_URL,
): RoomTokenMinter {
  return {
    async mint(identity, roomName) {
      const at = new AccessToken(apiKey, apiSecret, { identity, ttl: "1h" });
      at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
      const token = await at.toJwt();
      return { token, url, roomName };
    },
  };
}
