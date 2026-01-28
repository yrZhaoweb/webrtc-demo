import { writable, derived, get } from "svelte/store";
import { AvesClient, type Participant } from "@yrzhao/aves-core";

const SIGNALING_SERVER_URL = "ws://localhost:8080";

// Error messages enum for consistency
const ErrorMessages = {
  CREATE_ROOM_FAILED: "创建房间失败",
  JOIN_ROOM_FAILED: "加入房间失败",
  ROOM_ID_MISSING: "房间 ID 不存在",
} as const;

type ErrorMessage = (typeof ErrorMessages)[keyof typeof ErrorMessages];

// Writable stores
const roomId = writable<string | null>(null);
const participants = writable<Participant[]>([]);
const currentUserId = writable<string>("");
const currentUserName = writable<string>("");
const isConnecting = writable<boolean>(false);
const error = writable<string | null>(null);

// Client instance (singleton)
let clientInstance: AvesClient | null = null;

// Derived store for client
const client = derived([roomId], ([$roomId], set) => {
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
  });

  client.on("error", (err: Error) => {
    error.set(err.message);
  });
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
  error.set(null);
  currentUserId.set(userId);
  currentUserName.set(userName);

  try {
    const client = getClient();
    const newRoomId = await client.createRoom();
    await client.joinRoom(newRoomId, userId, userName);
    roomId.set(newRoomId);
    return newRoomId;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : ErrorMessages.CREATE_ROOM_FAILED;
    error.set(errorMessage);
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
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : ErrorMessages.JOIN_ROOM_FAILED;
    error.set(errorMessage);
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

  // Methods
  createRoom,
  joinRoom,
  leaveRoom,
  getClient,
  isClientInitialized,
} as const;

// Export error messages for use in components
export { ErrorMessages };
