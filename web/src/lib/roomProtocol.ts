import type { JsonObject } from "@yrzhao/aves-core";
import type { ChatMessage } from "./types";

const ROOM_ENVELOPE_TYPE = "webrtc-demo-room-envelope";
const SHARED_HISTORY_LIMIT = 200;

export interface HistoryRequestPayload extends JsonObject {
  requesterId: string;
  requesterName: string;
  requestedAt: number;
}

export interface HistorySnapshotPayload extends JsonObject {
  hostId: string;
  hostName: string;
  audioEnabled: boolean;
  history: ChatMessage[];
  sentAt: number;
}

export interface AudioPolicyPayload extends JsonObject {
  enabled: boolean;
  hostId: string;
  hostName: string;
  updatedAt: number;
}

export interface RoomDissolvedPayload extends JsonObject {
  hostId: string;
  hostName: string;
  reason: string;
  dissolvedAt: number;
}

interface BaseRoomEnvelope<Kind extends string, Payload extends JsonObject>
  extends JsonObject {
  __demoType: typeof ROOM_ENVELOPE_TYPE;
  kind: Kind;
  payload: Payload;
}

export type RoomEnvelope =
  | BaseRoomEnvelope<"chat-message", ChatMessage>
  | BaseRoomEnvelope<"history-request", HistoryRequestPayload>
  | BaseRoomEnvelope<"history-snapshot", HistorySnapshotPayload>
  | BaseRoomEnvelope<"audio-policy", AudioPolicyPayload>
  | BaseRoomEnvelope<"room-dissolved", RoomDissolvedPayload>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.senderId === "string" &&
    typeof value.senderName === "string" &&
    typeof value.content === "string" &&
    typeof value.timestamp === "number" &&
    (value.type === "user" || value.type === "system")
  );
}

export function isRoomEnvelope(value: unknown): value is RoomEnvelope {
  return (
    isObject(value) &&
    value.__demoType === ROOM_ENVELOPE_TYPE &&
    typeof value.kind === "string" &&
    "payload" in value
  );
}

export function createChatEnvelope(message: ChatMessage): RoomEnvelope {
  return {
    __demoType: ROOM_ENVELOPE_TYPE,
    kind: "chat-message",
    payload: message,
  };
}

export function createHistoryRequestEnvelope(
  requesterId: string,
  requesterName: string,
): RoomEnvelope {
  return {
    __demoType: ROOM_ENVELOPE_TYPE,
    kind: "history-request",
    payload: {
      requesterId,
      requesterName,
      requestedAt: Date.now(),
    },
  };
}

export function createHistorySnapshotEnvelope(
  hostId: string,
  hostName: string,
  audioEnabled: boolean,
  history: ChatMessage[],
): RoomEnvelope {
  return {
    __demoType: ROOM_ENVELOPE_TYPE,
    kind: "history-snapshot",
    payload: {
      hostId,
      hostName,
      audioEnabled,
      history: limitSharedHistory(history),
      sentAt: Date.now(),
    },
  };
}

export function createAudioPolicyEnvelope(
  enabled: boolean,
  hostId: string,
  hostName: string,
): RoomEnvelope {
  return {
    __demoType: ROOM_ENVELOPE_TYPE,
    kind: "audio-policy",
    payload: {
      enabled,
      hostId,
      hostName,
      updatedAt: Date.now(),
    },
  };
}

export function createRoomDissolvedEnvelope(
  hostId: string,
  hostName: string,
  reason = "房主已解散房间",
): RoomEnvelope {
  return {
    __demoType: ROOM_ENVELOPE_TYPE,
    kind: "room-dissolved",
    payload: {
      hostId,
      hostName,
      reason,
      dissolvedAt: Date.now(),
    },
  };
}

export function mergeChatMessages(
  currentMessages: ChatMessage[],
  nextMessages: ChatMessage[],
): ChatMessage[] {
  const merged = new Map<string, ChatMessage>();

  [...currentMessages, ...nextMessages].forEach((message) => {
    if (!isChatMessage(message)) {
      return;
    }

    merged.set(message.id, message);
  });

  return Array.from(merged.values())
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-Math.max(SHARED_HISTORY_LIMIT, currentMessages.length));
}

export function limitSharedHistory(messages: ChatMessage[]): ChatMessage[] {
  return mergeChatMessages([], messages).slice(-SHARED_HISTORY_LIMIT);
}
