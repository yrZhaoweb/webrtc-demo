import { derived, get, writable } from "svelte/store";
import {
  AvesClient,
  type FileTransferInfo,
  type FileTransferProgress,
  type FileTransferResult,
  type LocalAudioState,
  type Participant,
} from "@yrzhao/aves-core";

const SIGNALING_SERVER_URL =
  import.meta.env.VITE_SIGNALING_URL || "ws://localhost:8080";

const ErrorMessages = {
  CREATE_ROOM_FAILED: "创建房间失败",
  JOIN_ROOM_FAILED: "加入房间失败",
  ROOM_ID_MISSING: "房间 ID 不存在",
  CONNECTION_FAILED: "连接失败",
  RECONNECTING: "正在重新连接...",
} as const;

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface PeerConnectionState {
  peerId: string;
  peerName: string;
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | "closed";
}

export interface DemoFileTransfer extends FileTransferInfo {
  peerName: string;
  bytesTransferred: number;
  progress: number;
  status: "in-progress" | "completed" | "failed";
  blob?: Blob;
  error?: string;
}

const DEFAULT_AUDIO_STATE: LocalAudioState = {
  active: false,
  muted: false,
};

const roomId = writable<string | null>(null);
const participants = writable<Participant[]>([]);
const currentUserId = writable<string>("");
const currentUserName = writable<string>("");
const isConnecting = writable<boolean>(false);
const error = writable<string | null>(null);
const connectionState = writable<ConnectionState>("disconnected");
const peerStates = writable<Map<string, PeerConnectionState>>(new Map());
const localAudioState = writable<LocalAudioState>(DEFAULT_AUDIO_STATE);
const remoteAudioStreams = writable<Map<string, MediaStream>>(new Map());
const fileTransfers = writable<DemoFileTransfer[]>([]);

let clientInstance: AvesClient | null = null;
let reconnectAttempts = 0;
let reconnectInFlight = false;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

const client = derived([roomId], (_, set) => {
  set(clientInstance);
});

function getClient(): AvesClient {
  if (!clientInstance) {
    clientInstance = new AvesClient({
      signalingUrl: SIGNALING_SERVER_URL,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      fileChunkSize: 32 * 1024,
      debug: true,
    });

    setupEventListeners(clientInstance);
    localAudioState.set(clientInstance.getLocalAudioState());
  }

  return clientInstance;
}

function setupEventListeners(client: AvesClient): void {
  client.on("userJoined", (user: Participant) => {
    participants.update((prev) => {
      if (prev.some((participant) => participant.id === user.id)) {
        return prev;
      }

      return [...prev, user];
    });
  });

  client.on("userLeft", (userId: string) => {
    participants.update((prev) =>
      prev.filter((participant) => participant.id !== userId),
    );
    peerStates.update((states) => {
      states.delete(userId);
      return new Map(states);
    });
    remoteAudioStreams.update((streams) => {
      streams.delete(userId);
      return new Map(streams);
    });
  });

  client.on("error", (err: Error) => {
    console.error("[AvesService] Error:", err);
    error.set(err.message);
    connectionState.set("failed");
  });

  client.on("signalingStateChange", (state: string) => {
    if (state === "connected") {
      connectionState.set("connected");
      reconnectAttempts = 0;
    } else if (state === "disconnected") {
      connectionState.set("disconnected");
      void handleDisconnection();
    }
  });

  client.on(
    "connectionStateChange",
    (peerId: string, state: RTCPeerConnectionState) => {
      updatePeerState(peerId, { connectionState: state });
    },
  );

  client.on(
    "dataChannelStateChange",
    (peerId: string, state: RTCDataChannelState) => {
      updatePeerState(peerId, { dataChannelState: state });
    },
  );

  client.on("localAudioStateChange", (state: LocalAudioState) => {
    localAudioState.set(state);
  });

  client.on(
    "remoteAudioTrack",
    (peerId: string, stream: MediaStream, _track: MediaStreamTrack) => {
      remoteAudioStreams.update((streams) => {
        streams.set(peerId, stream);
        return new Map(streams);
      });
    },
  );

  client.on("fileTransferStarted", (peerId: string, info: FileTransferInfo) => {
    upsertFileTransfer({
      ...info,
      peerName: getPeerName(peerId),
      bytesTransferred: 0,
      progress: 0,
      status: "in-progress",
    });
  });

  client.on(
    "fileTransferProgress",
    (peerId: string, progress: FileTransferProgress) => {
      upsertFileTransfer({
        ...progress,
        peerName: getPeerName(peerId),
        status: "in-progress",
      });
    },
  );

  client.on(
    "fileTransferCompleted",
    (peerId: string, result: FileTransferResult) => {
      upsertFileTransfer({
        ...result,
        peerName: getPeerName(peerId),
        bytesTransferred: result.size,
        progress: 100,
        status: "completed",
        blob: result.blob,
      });
    },
  );

  client.on(
    "fileTransferFailed",
    (peerId: string, info: FileTransferInfo | null, transferError: Error) => {
      if (!info) {
        return;
      }

      upsertFileTransfer({
        ...info,
        peerName: getPeerName(peerId),
        bytesTransferred: 0,
        progress: 0,
        status: "failed",
        error: transferError.message,
      });
    },
  );
}

function updatePeerState(
  peerId: string,
  updates: Partial<Omit<PeerConnectionState, "peerId" | "peerName">>,
): void {
  peerStates.update((states) => {
    const existing = states.get(peerId);

    const newState: PeerConnectionState = {
      peerId,
      peerName: getPeerName(peerId),
      connectionState:
        updates.connectionState ?? existing?.connectionState ?? "new",
      dataChannelState:
        updates.dataChannelState ?? existing?.dataChannelState ?? "closed",
    };

    states.set(peerId, newState);
    return new Map(states);
  });
}

function upsertFileTransfer(transfer: DemoFileTransfer): void {
  fileTransfers.update((items) => {
    const next = [...items];
    const index = next.findIndex((item) => item.transferId === transfer.transferId);

    if (index === -1) {
      next.unshift(transfer);
      return next;
    }

    next[index] = {
      ...next[index],
      ...transfer,
    };
    return next;
  });
}

function getPeerName(peerId: string): string {
  const participant = get(participants).find((item) => item.id === peerId);
  return participant?.name || peerId;
}

async function handleDisconnection(): Promise<void> {
  if (reconnectInFlight) {
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    error.set("连接失败，已达到最大重试次数");
    connectionState.set("failed");
    return;
  }

  const currentRoomIdValue = get(roomId);
  const currentUserIdValue = get(currentUserId);
  const currentUserNameValue = get(currentUserName);

  if (
    !clientInstance ||
    !currentRoomIdValue ||
    !currentUserIdValue ||
    !currentUserNameValue
  ) {
    return;
  }

  reconnectAttempts++;
  reconnectInFlight = true;
  connectionState.set("reconnecting");
  error.set(
    `${ErrorMessages.RECONNECTING} (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY));

  try {
    await joinRoom(currentRoomIdValue, currentUserIdValue, currentUserNameValue);
    error.set(null);
    connectionState.set("connected");
    reconnectAttempts = 0;
  } catch (reconnectError) {
    console.error("[AvesService] Reconnection failed:", reconnectError);
    reconnectInFlight = false;
    await handleDisconnection();
    return;
  }

  reconnectInFlight = false;
}

function isClientInitialized(): boolean {
  return clientInstance !== null;
}

async function createRoom(userId: string, userName: string): Promise<string> {
  isConnecting.set(true);
  connectionState.set("connecting");
  error.set(null);
  currentUserId.set(userId);
  currentUserName.set(userName);

  try {
    const client = getClient();
    const newRoomId = await client.createRoom();
    await client.joinRoom(newRoomId, userId, userName);
    roomId.set(newRoomId);
    connectionState.set("connected");
    return newRoomId;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : ErrorMessages.CREATE_ROOM_FAILED;
    error.set(errorMessage);
    connectionState.set("failed");
    throw err;
  } finally {
    isConnecting.set(false);
  }
}

async function joinRoom(
  targetRoomId: string,
  userId: string,
  userName: string,
): Promise<void> {
  isConnecting.set(true);
  connectionState.set("connecting");
  error.set(null);
  currentUserId.set(userId);
  currentUserName.set(userName);

  try {
    const client = getClient();
    const existingParticipants = await client.joinRoom(
      targetRoomId,
      userId,
      userName,
    );
    participants.set(existingParticipants);
    roomId.set(targetRoomId);
    connectionState.set("connected");

    existingParticipants.forEach((participant) => {
      updatePeerState(participant.id, {
        connectionState: "new",
        dataChannelState: "connecting",
      });
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : ErrorMessages.JOIN_ROOM_FAILED;
    error.set(errorMessage);
    connectionState.set("failed");
    throw err;
  } finally {
    isConnecting.set(false);
  }
}

async function leaveRoom(): Promise<void> {
  if (!clientInstance) {
    return;
  }

  try {
    await clientInstance.leaveRoom();
    clientInstance.destroy();
  } catch (err) {
    console.error("Error during room cleanup:", err);
  } finally {
    clientInstance = null;
    reconnectAttempts = 0;
    resetState();
  }
}

async function startVoice(): Promise<void> {
  const client = getClient();
  await client.startVoice();
  localAudioState.set(client.getLocalAudioState());
}

function stopVoice(): void {
  if (!clientInstance) {
    return;
  }

  clientInstance.stopVoice();
  localAudioState.set(clientInstance.getLocalAudioState());
}

function setMuted(muted: boolean): void {
  if (!clientInstance) {
    return;
  }

  clientInstance.setMuted(muted);
  localAudioState.set(clientInstance.getLocalAudioState());
}

function toggleMute(): void {
  setMuted(!get(localAudioState).muted);
}

async function sendFile(file: File, peerId?: string): Promise<void> {
  const client = getClient();
  await client.sendFile(file, { peerId });
}

function resetState(): void {
  roomId.set(null);
  participants.set([]);
  currentUserId.set("");
  currentUserName.set("");
  error.set(null);
  connectionState.set("disconnected");
  peerStates.set(new Map());
  localAudioState.set(DEFAULT_AUDIO_STATE);
  remoteAudioStreams.set(new Map());
  fileTransfers.set([]);
  reconnectInFlight = false;
}

export const avesService = {
  roomId,
  participants,
  currentUserId,
  currentUserName,
  isConnecting,
  error,
  client,
  connectionState,
  peerStates,
  localAudioState,
  remoteAudioStreams,
  fileTransfers,
  createRoom,
  joinRoom,
  leaveRoom,
  getClient,
  isClientInitialized,
  startVoice,
  stopVoice,
  setMuted,
  toggleMute,
  sendFile,
} as const;

export { ErrorMessages };
