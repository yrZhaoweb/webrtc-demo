import { derived, get, writable } from "svelte/store";
import {
  AvesClient,
  type AvesError,
  type AvesErrorCode,
  type AvesVideoConstraints,
  type FileTransferInfo,
  type FileTransferProgress,
  type FileTransferResult,
  type LocalAudioState,
  type LocalVideoState,
  type Participant,
  type ScreenShareState,
} from "@yrzhao/aves-core";

const SIGNALING_SERVER_URL =
  import.meta.env.VITE_SIGNALING_URL || "ws://localhost:8080";

const FILE_CHUNK_SIZE = 32 * 1024;
const DEFAULT_VIDEO_CONSTRAINTS: AvesVideoConstraints = {
  width: 1280,
  height: 720,
  frameRate: 30,
};

export const SDK_VERSIONS = {
  core: "1.1.0",
  node: "1.1.0",
} as const;

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

export interface DemoServerHealth {
  connections: number;
  rooms: number;
  storage: "memory" | "redis" | "mongodb";
  roomTimeout: number;
  uptime: number;
}

export interface DemoServerMetrics extends DemoServerHealth {
  participants: number;
  pendingDisconnects: number;
  rateLimitBuckets: number;
  reconnectGraceMs: number;
  maxMessageSize: number;
}

export interface DemoServerRoom {
  id: string;
  name?: string;
  maxCapacity?: number;
  hasPassword: boolean;
  participantCount: number;
  createdAt: number;
}

export interface DemoAvesError {
  name: string;
  message: string;
  code?: AvesErrorCode | string;
  stage?: string;
  retryable?: boolean;
  peerId?: string;
  roomId?: string;
  requestId?: string;
}

export type DiagnosticEventLevel = "info" | "warn" | "error";
export type DiagnosticEventSource =
  | "aves-core"
  | "aves-node"
  | "signaling"
  | "peer"
  | "media"
  | "file";

export interface DemoDiagnosticEvent {
  id: string;
  timestamp: number;
  level: DiagnosticEventLevel;
  source: DiagnosticEventSource;
  message: string;
  details?: Record<string, unknown>;
}

const DEFAULT_AUDIO_STATE: LocalAudioState = {
  active: false,
  muted: false,
};

const DEFAULT_VIDEO_STATE: LocalVideoState = {
  active: false,
  muted: false,
};

const DEFAULT_SCREEN_SHARE_STATE: ScreenShareState = {
  active: false,
  source: "camera",
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
const localVideoState = writable<LocalVideoState>(DEFAULT_VIDEO_STATE);
const screenShareState = writable<ScreenShareState>(DEFAULT_SCREEN_SHARE_STATE);
const remoteAudioStreams = writable<Map<string, MediaStream>>(new Map());
const remoteVideoStreams = writable<Map<string, MediaStream>>(new Map());
const fileTransfers = writable<DemoFileTransfer[]>([]);
const localPreviewStream = writable<MediaStream | null>(null);
const serverHealth = writable<DemoServerHealth | null>(null);
const serverMetrics = writable<DemoServerMetrics | null>(null);
const serverRooms = writable<DemoServerRoom[]>([]);
const serverDiagnosticsError = writable<string | null>(null);
const lastAvesError = writable<DemoAvesError | null>(null);
const diagnosticEvents = writable<DemoDiagnosticEvent[]>([]);

let clientInstance: AvesClient | null = null;
let reconnectAttempts = 0;
let reconnectInFlight = false;
let diagnosticsPollTimer: ReturnType<typeof setInterval> | null = null;
let diagnosticEventSequence = 0;
let cameraPreviewStream: MediaStream | null = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

const client = derived([roomId], (_, set) => {
  set(clientInstance);
});

function getDiagnosticsBaseUrl(signalingUrl = SIGNALING_SERVER_URL): string {
  const url = new URL(signalingUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function appendDiagnosticEvent(
  level: DiagnosticEventLevel,
  source: DiagnosticEventSource,
  message: string,
  details?: Record<string, unknown>,
): void {
  const timestamp = Date.now();
  const event: DemoDiagnosticEvent = {
    id: `${timestamp}-${++diagnosticEventSequence}`,
    timestamp,
    level,
    source,
    message,
    details,
  };

  diagnosticEvents.update((items) => [event, ...items].slice(0, 50));
}

function normalizeAvesError(err: unknown): DemoAvesError {
  if (err instanceof Error) {
    const maybeAvesError = err as AvesError;
    return {
      name: maybeAvesError.name || "Error",
      message: maybeAvesError.message,
      code: maybeAvesError.code,
      stage: maybeAvesError.stage,
      retryable: maybeAvesError.retryable,
      peerId: maybeAvesError.peerId,
      roomId: maybeAvesError.roomId,
      requestId: maybeAvesError.requestId,
    };
  }

  const maybeError = err as Partial<DemoAvesError> | null;
  if (maybeError && typeof maybeError === "object") {
    return {
      name: typeof maybeError.name === "string" ? maybeError.name : "AvesError",
      message:
        typeof maybeError.message === "string"
          ? maybeError.message
          : "Unknown aves error",
      code: maybeError.code,
      stage: maybeError.stage,
      retryable: maybeError.retryable,
      peerId: maybeError.peerId,
      roomId: maybeError.roomId,
      requestId: maybeError.requestId,
    };
  }

  return {
    name: "Error",
    message: String(err),
  };
}

function recordAvesError(err: unknown): DemoAvesError {
  const avesError = normalizeAvesError(err);
  lastAvesError.set(avesError);
  appendDiagnosticEvent("error", "aves-core", avesError.message, {
    code: avesError.code,
    stage: avesError.stage,
    retryable: avesError.retryable,
    peerId: avesError.peerId,
    roomId: avesError.roomId,
    requestId: avesError.requestId,
  });
  return avesError;
}

function getClient(): AvesClient {
  if (!clientInstance) {
    clientInstance = new AvesClient({
      signalingUrl: SIGNALING_SERVER_URL,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      fileChunkSize: FILE_CHUNK_SIZE,
      video: DEFAULT_VIDEO_CONSTRAINTS,
      reconnect: {
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        delay: RECONNECT_DELAY,
        requestTimeoutMs: 30000,
      },
      debug: true,
    });

    setupEventListeners(clientInstance);
    localAudioState.set(clientInstance.getLocalAudioState());
    localVideoState.set(clientInstance.getLocalVideoState());
    screenShareState.set(clientInstance.getScreenShareState());
    appendDiagnosticEvent("info", "aves-core", "AvesClient initialized", {
      signalingUrl: SIGNALING_SERVER_URL,
      coreVersion: SDK_VERSIONS.core,
    });
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
    appendDiagnosticEvent("info", "signaling", `${user.name} joined`, {
      peerId: user.id,
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
    remoteVideoStreams.update((streams) => {
      streams.delete(userId);
      return new Map(streams);
    });
    appendDiagnosticEvent("info", "signaling", "Peer left room", {
      peerId: userId,
    });
  });

  client.on("error", (err: Error) => {
    console.error("[AvesService] Error:", err);
    const avesError = recordAvesError(err);
    error.set(avesError.message);
    connectionState.set("failed");
  });

  client.on("signalingStateChange", (state: string) => {
    appendDiagnosticEvent("info", "signaling", `Signaling ${state}`);
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
      appendDiagnosticEvent("info", "peer", `Peer connection ${state}`, {
        peerId,
      });
    },
  );

  client.on(
    "dataChannelStateChange",
    (peerId: string, state: RTCDataChannelState) => {
      updatePeerState(peerId, { dataChannelState: state });
      appendDiagnosticEvent("info", "peer", `DataChannel ${state}`, {
        peerId,
      });
    },
  );

  client.on("localAudioStateChange", (state: LocalAudioState) => {
    localAudioState.set(state);
    appendDiagnosticEvent("info", "media", "Local audio state changed", {
      ...state,
    });
  });

  client.on(
    "remoteAudioTrack",
    (peerId: string, stream: MediaStream, _track: MediaStreamTrack) => {
      remoteAudioStreams.update((streams) => {
        streams.set(peerId, stream);
        return new Map(streams);
      });
      appendDiagnosticEvent("info", "media", "Remote audio track received", {
        peerId,
      });
    },
  );

  client.on("localVideoStateChange", (state: LocalVideoState) => {
    localVideoState.set(state);
    if (!state.active && !get(screenShareState).active) {
      localPreviewStream.set(null);
    }
    appendDiagnosticEvent("info", "media", "Local video state changed", {
      ...state,
    });
  });

  client.on(
    "remoteVideoTrack",
    (peerId: string, stream: MediaStream, _track: MediaStreamTrack) => {
      remoteVideoStreams.update((streams) => {
        streams.set(peerId, stream);
        return new Map(streams);
      });
      appendDiagnosticEvent("info", "media", "Remote video track received", {
        peerId,
      });
    },
  );

  client.on("screenShareStateChange", (state: ScreenShareState) => {
    screenShareState.set(state);
    appendDiagnosticEvent("info", "media", "Screen share state changed", {
      ...state,
    });
  });

  client.on("fileTransferStarted", (peerId: string, info: FileTransferInfo) => {
    upsertFileTransfer({
      ...info,
      peerName: getPeerName(peerId),
      bytesTransferred: 0,
      progress: 0,
      status: "in-progress",
    });
    appendDiagnosticEvent("info", "file", `File transfer started: ${info.name}`, {
      peerId,
      transferId: info.transferId,
      size: info.size,
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
      if (progress.progress === 100) {
        appendDiagnosticEvent("info", "file", `File transfer reached 100%: ${progress.name}`, {
          peerId,
          transferId: progress.transferId,
        });
      }
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
      appendDiagnosticEvent("info", "file", `File transfer completed: ${result.name}`, {
        peerId,
        transferId: result.transferId,
        size: result.size,
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
      appendDiagnosticEvent("error", "file", `File transfer failed: ${info.name}`, {
        peerId,
        transferId: info.transferId,
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
    appendDiagnosticEvent("error", "signaling", "Reconnect attempts exhausted", {
      attempts: reconnectAttempts,
    });
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
  appendDiagnosticEvent("warn", "signaling", "Attempting room reconnect", {
    roomId: currentRoomIdValue,
    attempt: reconnectAttempts,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
  });
  error.set(
    `${ErrorMessages.RECONNECTING} (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY));

  try {
    await joinRoom(currentRoomIdValue, currentUserIdValue, currentUserNameValue);
    error.set(null);
    connectionState.set("connected");
    reconnectAttempts = 0;
    appendDiagnosticEvent("info", "signaling", "Room reconnect succeeded", {
      roomId: currentRoomIdValue,
    });
  } catch (reconnectError) {
    console.error("[AvesService] Reconnection failed:", reconnectError);
    recordAvesError(reconnectError);
    reconnectInFlight = false;
    await handleDisconnection();
    return;
  }

  reconnectInFlight = false;
}

function isClientInitialized(): boolean {
  return clientInstance !== null;
}

async function fetchServerDiagnostics(): Promise<{
  health: DemoServerHealth;
  metrics: DemoServerMetrics;
  rooms: DemoServerRoom[];
} | null> {
  try {
    const baseUrl = getDiagnosticsBaseUrl();
    const [healthResponse, metricsResponse, roomsResponse] = await Promise.all([
      fetch(`${baseUrl}/health`),
      fetch(`${baseUrl}/metrics`),
      fetch(`${baseUrl}/rooms`),
    ]);

    if (!healthResponse.ok) {
      throw new Error(`Health request failed with ${healthResponse.status}`);
    }

    if (!roomsResponse.ok) {
      throw new Error(`Rooms request failed with ${roomsResponse.status}`);
    }

    if (!metricsResponse.ok) {
      throw new Error(`Metrics request failed with ${metricsResponse.status}`);
    }

    const health = (await healthResponse.json()) as DemoServerHealth;
    const metrics = (await metricsResponse.json()) as DemoServerMetrics;
    const roomsPayload = (await roomsResponse.json()) as {
      rooms?: DemoServerRoom[];
    };
    const rooms = Array.isArray(roomsPayload.rooms) ? roomsPayload.rooms : [];

    serverHealth.set(health);
    serverMetrics.set(metrics);
    serverRooms.set(rooms);
    serverDiagnosticsError.set(null);
    appendDiagnosticEvent("info", "aves-node", "Server diagnostics refreshed", {
      connections: health.connections,
      rooms: health.rooms,
      participants: metrics.participants,
      storage: health.storage,
    });

    return { health, metrics, rooms };
  } catch (diagnosticsError) {
    const message =
      diagnosticsError instanceof Error
        ? diagnosticsError.message
        : String(diagnosticsError);
    serverDiagnosticsError.set(message);
    appendDiagnosticEvent("warn", "aves-node", "Server diagnostics failed", {
      error: message,
    });
    return null;
  }
}

function startServerDiagnosticsPolling(intervalMs = 5000): () => void {
  stopServerDiagnosticsPolling();
  void fetchServerDiagnostics();
  diagnosticsPollTimer = setInterval(() => {
    void fetchServerDiagnostics();
  }, intervalMs);

  return stopServerDiagnosticsPolling;
}

function stopServerDiagnosticsPolling(): void {
  if (diagnosticsPollTimer) {
    clearInterval(diagnosticsPollTimer);
    diagnosticsPollTimer = null;
  }
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
    appendDiagnosticEvent("info", "signaling", "Room created and joined", {
      roomId: newRoomId,
      userId,
    });
    return newRoomId;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : ErrorMessages.CREATE_ROOM_FAILED;
    error.set(errorMessage);
    connectionState.set("failed");
    recordAvesError(err);
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
    appendDiagnosticEvent("info", "signaling", "Room joined", {
      roomId: targetRoomId,
      userId,
      participants: existingParticipants.length,
    });

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
    recordAvesError(err);
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
    appendDiagnosticEvent("info", "signaling", "Room left");
  } catch (err) {
    console.error("Error during room cleanup:", err);
    recordAvesError(err);
  } finally {
    clientInstance = null;
    reconnectAttempts = 0;
    stopServerDiagnosticsPolling();
    resetState();
  }
}

async function startVoice(): Promise<void> {
  const client = getClient();
  await client.startVoice();
  localAudioState.set(client.getLocalAudioState());
  appendDiagnosticEvent("info", "media", "Microphone started");
}

function stopVoice(): void {
  if (!clientInstance) {
    return;
  }

  clientInstance.stopVoice();
  localAudioState.set(clientInstance.getLocalAudioState());
  appendDiagnosticEvent("info", "media", "Microphone stopped");
}

function setMuted(muted: boolean): void {
  if (!clientInstance) {
    return;
  }

  clientInstance.setMuted(muted);
  localAudioState.set(clientInstance.getLocalAudioState());
  appendDiagnosticEvent("info", "media", muted ? "Microphone muted" : "Microphone unmuted");
}

function toggleMute(): void {
  setMuted(!get(localAudioState).muted);
}

// --- Video ---

async function startVideo(): Promise<MediaStream> {
  const client = getClient();
  const stream = await client.startVideo(DEFAULT_VIDEO_CONSTRAINTS);
  localVideoState.set(client.getLocalVideoState());
  cameraPreviewStream = stream;
  localPreviewStream.set(stream);
  appendDiagnosticEvent("info", "media", "Camera started", {
    ...DEFAULT_VIDEO_CONSTRAINTS,
  });
  return stream;
}

function stopVideo(): void {
  if (!clientInstance) {
    return;
  }

  clientInstance.stopVideo();
  localVideoState.set(clientInstance.getLocalVideoState());
  cameraPreviewStream = null;
  if (!get(screenShareState).active) {
    localPreviewStream.set(null);
  }
  appendDiagnosticEvent("info", "media", "Camera stopped");
}

function setVideoMuted(muted: boolean): void {
  if (!clientInstance) {
    return;
  }

  clientInstance.setVideoMuted(muted);
  localVideoState.set(clientInstance.getLocalVideoState());
  appendDiagnosticEvent("info", "media", muted ? "Camera muted" : "Camera unmuted");
}

function toggleVideoMute(): void {
  setVideoMuted(!get(localVideoState).muted);
}

// --- Screen Share ---

async function startScreenShare(): Promise<MediaStream> {
  const client = getClient();
  const stream = await client.startScreenShare();
  screenShareState.set(client.getScreenShareState());
  localPreviewStream.set(stream);
  appendDiagnosticEvent("info", "media", "Screen share started");
  return stream;
}

function stopScreenShare(): void {
  if (!clientInstance) {
    return;
  }

  clientInstance.stopScreenShare();
  screenShareState.set(clientInstance.getScreenShareState());
  localVideoState.set(clientInstance.getLocalVideoState());
  localPreviewStream.set(get(localVideoState).active ? cameraPreviewStream : null);
  appendDiagnosticEvent("info", "media", "Screen share stopped");
}

async function sendFile(file: File, peerId?: string): Promise<void> {
  const client = getClient();
  await client.sendFile(file, {
    peerId,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    lastModified: file.lastModified,
    chunkSize: FILE_CHUNK_SIZE,
  });
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
  localVideoState.set(DEFAULT_VIDEO_STATE);
  screenShareState.set(DEFAULT_SCREEN_SHARE_STATE);
  remoteAudioStreams.set(new Map());
  remoteVideoStreams.set(new Map());
  fileTransfers.set([]);
  localPreviewStream.set(null);
  serverHealth.set(null);
  serverMetrics.set(null);
  serverRooms.set([]);
  serverDiagnosticsError.set(null);
  lastAvesError.set(null);
  diagnosticEvents.set([]);
  cameraPreviewStream = null;
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
  localVideoState,
  screenShareState,
  remoteAudioStreams,
  remoteVideoStreams,
  fileTransfers,
  localPreviewStream,
  serverHealth,
  serverMetrics,
  serverRooms,
  serverDiagnosticsError,
  lastAvesError,
  diagnosticEvents,
  sdkVersions: SDK_VERSIONS,
  createRoom,
  joinRoom,
  leaveRoom,
  getClient,
  isClientInitialized,
  startVoice,
  stopVoice,
  setMuted,
  toggleMute,
  startVideo,
  stopVideo,
  setVideoMuted,
  toggleVideoMute,
  startScreenShare,
  stopScreenShare,
  sendFile,
  fetchServerDiagnostics,
  startServerDiagnosticsPolling,
  stopServerDiagnosticsPolling,
} as const;

export { ErrorMessages };
