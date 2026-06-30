import { AccessToken, EgressClient, RoomServiceClient, EncodedFileOutput, EncodedFileType } from "livekit-server-sdk";

export function livekitConfigured() {
  return !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
}

function requireConfig() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    throw new Error("LiveKit is not configured. Add LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL to enable live interviews.");
  }
  return { apiKey, apiSecret, url };
}

export async function mintLiveKitToken(opts: {
  room: string;
  identity: string;
  name: string;
  canPublish: boolean;
  metadata?: Record<string, unknown>;
  ttlSeconds?: number;
}) {
  const { apiKey, apiSecret, url } = requireConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl: opts.ttlSeconds ?? 60 * 60 * 2,
    metadata: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
  });
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: opts.canPublish,
    canPublishData: true,
    canSubscribe: true,
  });
  const jwt = await at.toJwt();
  return { token: jwt, url };
}

export function roomServiceClient() {
  const { apiKey, apiSecret, url } = requireConfig();
  // HTTP base for server APIs: livekit-server-sdk expects an HTTP(S) URL.
  const http = url.replace(/^ws/, "http");
  return new RoomServiceClient(http, apiKey, apiSecret);
}

export function egressClient() {
  const { apiKey, apiSecret, url } = requireConfig();
  const http = url.replace(/^ws/, "http");
  return new EgressClient(http, apiKey, apiSecret);
}

/**
 * Start a composite (rendered grid) recording egress to S3-compatible storage.
 * Self-hosters who don't want LiveKit egress configured can skip this entirely;
 * the room still works without it (consent log + scorecards remain compliant).
 */
export async function startRoomRecording(opts: { room: string; filename: string }) {
  const eg = egressClient();
  const file = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: opts.filename,
  });
  return eg.startRoomCompositeEgress(opts.room, { file });
}

export async function stopEgress(egressId: string) {
  const eg = egressClient();
  return eg.stopEgress(egressId);
}