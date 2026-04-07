import { writable, derived, get } from "svelte/store";
import { AvesClient, type Participant } from "@yrzhao/aves-core";

const SIGNALING_SERVER_URL =
  import.meta.env.VITE_SIGNALING_URL || "ws://localhost:8080";

// Error messages enum for consistency
const ErrorMessages = {
  CREATE_ROOM_FAILED: "创建房间失败",
  JOIN_ROOM_FAILED: "加入房间失败",
  ROOM_ID_MISSING: "房间 ID 不存在",
  CONNECTION_FAILED: "连接失败",
  RECONNECTING: "正在重新连接...",
} as const;

// Connection state type
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

// Peer connection states
export interface PeerConnectionState {
  peerId: string;
  peerName: string;
  connectionState: RTCPeerConnectionState;
  dataChannelState: RTCDataChannelState | "closed";
}

// Writable stores
const roomId = writable<string | null>(null);
const participants = writable<Participant[]>([]);
const currentUserId = writable<string>("");
const currentUserName = writable<string>("");
const isConnecting = writable<boolean>(false);
const error = writable<string | null>(null);
const connectionState = writable<ConnectionState>("disconnected");
const peerStates = writable<Map<string, PeerConnectionState>>(new Map());

// Client instance (singleton)
let clientInstance: AvesClient | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

// Derived store for client
const client = derived([roomId], (_, set) => {
  set(clientInstance);
});

/**
 * Get or create AvesClient singleton instance
 * @returns AvesClient instance (guaranteed non-null)
 */
function getClient(): AvesClient {
  if (!clientInstance) {
    clientInstance = new AvesClient({
      signalingUrl: SIGNALING_SERVER_URL,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      debug: true,
    });

    setupEventListeners(clientInstance);
  }

  return clientInstance;
}

/**
 * Setup event listeners for AvesClient
 * Extracted for better separation of concerns
 */
function setupEventListeners(client: AvesClient): void {
  client.on("userJoined", (user: Participant) => {
    participants.update((prev) => [...prev, user]);
  });

  client.on("userLeft", (userId: string) => {
    participants.update((prev) =>
      prev.filter((participant) => participant.id !== userId),
    );
    // Remove peer state
    peerStates.update((states) => {
      states.delete(userId);
      return new Map(states);
    });
  });

  client.on("error", (err: Error) => {
    console.error("[AvesService] Error:", err);
    error.set(err.message);
    connectionState.set("failed");
  });

  // Monitor signaling state
  client.on("signalingStateChange", (state: string) => {
    console.log("[AvesService] Signaling state:", state);
    if (state === "connected") {
      connectionState.set("connected");
      reconnectAttempts = 0;
    } else if (state === "disconnected") {
      connectionState.set("disconnected");
      handleDisconnection();
    }
  });

  // Monitor WebRTC connection states
  client.on(
    "connectionStateChange",
    (peerId: string, state: RTCPeerConnectionState) => {
      console.log(`[AvesService] Peer ${peerId} connection state:`, state);
      updatePeerState(peerId, { connectionState: state });
    },
  );

  // Monitor DataChannel states
  client.on(
    "dataChannelStateChange",
    (peerId: string, state: RTCDataChannelState) => {
      console.log(`[AvesService] Peer ${peerId} data channel state:`, state);
      updatePeerState(peerId, { dataChannelState: state });
    },
  );
}

/**
 * Update peer connection state
 */
function updatePeerState(
  peerId: string,
  updates: Partial<Omit<PeerConnectionState, "peerId" | "peerName">>,
): void {
  peerStates.update((states) => {
    const existing = states.get(peerId);
    const participant = clientInstance
      ?.getParticipants()
      .find((p) => p.id === peerId);

    const newState: PeerConnectionState = {
      peerId,
      peerName: participant?.name || existing?.peerName || "Unknown",
      connectionState:
        updates.connectionState ?? existing?.connectionState ?? "new",
      dataChannelState:
        updates.dataChannelState ?? existing?.dataChannelState ?? "closed",
    };

    states.set(peerId, newState);
    return new Map(states);
  });
}

/**
 * Handle disconnection and attempt reconnection
 */
async function handleDisconnection(): Promise<void> {
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
  connectionState.set("reconnecting");
  error.set(
    `${ErrorMessages.RECONNECTING} (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  console.log(
    `[AvesService] Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`,
  );

  await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY));

  try {
    // Try to rejoin the room
    await joinRoom(
      currentRoomIdValue,
      currentUserIdValue,
      currentUserNameValue,
    );
    error.set(null);
    connectionState.set("connected");
    reconnectAttempts = 0;
  } catch (err) {
    console.error("[AvesService] Reconnection failed:", err);
    await handleDisconnection(); // Retry
  }
}

/**
 * Check if client is initialized
 */
function isClientInitialized(): boolean {
  return clientInstance !== null;
}

/**
 * Create a new room
 * @param userId - Unique user identifier
 * @param userName - Display name for the user
 * @returns Promise resolving to the created room ID
 * @throws Error if room creation fails
 */
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

/**
 * Join an existing room
 * @param targetRoomId - ID of the room to join
 * @param userId - Unique user identifier
 * @param userName - Display name for the user
 * @throws Error if joining fails
 */
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

    // Initialize peer states for existing participants
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

/**
 * Leave the current room and cleanup resources
 */
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

/**
 * Reset all state to initial values
 */
function resetState(): void {
  roomId.set(null);
  participants.set([]);
  currentUserId.set("");
  currentUserName.set("");
  error.set(null);
  connectionState.set("disconnected");
  peerStates.set(new Map());
}

/**
 * Export the aves service
 */
export const avesService = {
  // Stores (read-only from outside)
  roomId,
  participants,
  currentUserId,
  currentUserName,
  isConnecting,
  error,
  client,
  connectionState,
  peerStates,

  // Methods
  createRoom,
  joinRoom,
  leaveRoom,
  getClient,
  isClientInitialized,
} as const;

// Export error messages for use in components
export { ErrorMessages };
