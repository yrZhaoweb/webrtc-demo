import { AvesClient, type Participant } from "@yrzhao/aves-core";
import { ref, computed } from "vue";

const SIGNALING_SERVER_URL = "ws://localhost:8080";

// 单例 AvesClient 实例
let clientInstance: AvesClient | null = null;

// 响应式状态
const roomId = ref<string | null>(null);
const participants = ref<Participant[]>([]);
const currentUserId = ref("");
const currentUserName = ref("");
const isConnecting = ref(false);
const error = ref<string | null>(null);

/**
 * 获取或创建 AvesClient 单例实例
 */
function getClient(): AvesClient {
  if (!clientInstance) {
    clientInstance = new AvesClient({
      signalingUrl: SIGNALING_SERVER_URL,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      debug: true,
    });

    // 设置事件监听
    clientInstance.on("userJoined", (user: Participant) => {
      participants.value.push(user);
    });

    clientInstance.on("userLeft", (userId: string) => {
      participants.value = participants.value.filter((p) => p.id !== userId);
    });

    clientInstance.on("error", (err: Error) => {
      error.value = err.message;
    });
  }

  return clientInstance;
}

/**
 * 创建房间
 */
export async function createRoom(
  userId: string,
  userName: string,
): Promise<string> {
  isConnecting.value = true;
  error.value = null;
  currentUserId.value = userId;
  currentUserName.value = userName;

  try {
    const client = getClient();
    const newRoomId = await client.createRoom();
    await client.joinRoom(newRoomId, userId, userName);
    roomId.value = newRoomId;
    return newRoomId;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "创建房间失败";
    throw err;
  } finally {
    isConnecting.value = false;
  }
}

/**
 * 加入房间
 */
export async function joinRoom(
  targetRoomId: string,
  userId: string,
  userName: string,
): Promise<void> {
  isConnecting.value = true;
  error.value = null;
  currentUserId.value = userId;
  currentUserName.value = userName;

  try {
    const client = getClient();
    const existingParticipants = await client.joinRoom(
      targetRoomId,
      userId,
      userName,
    );
    participants.value = existingParticipants;
    roomId.value = targetRoomId;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "加入房间失败";
    throw err;
  } finally {
    isConnecting.value = false;
  }
}

/**
 * 离开房间
 */
export async function leaveRoom(): Promise<void> {
  if (clientInstance) {
    await clientInstance.leaveRoom();
    clientInstance.destroy();
    clientInstance = null;
  }
  roomId.value = null;
  participants.value = [];
  currentUserId.value = "";
  currentUserName.value = "";
}

/**
 * 发送消息
 */
export function sendMessage(message: any): void {
  const client = getClient();
  client.sendMessage(message);
}

/**
 * 导出响应式状态
 */
export function useAvesService() {
  return {
    client: computed(() => clientInstance),
    roomId,
    participants,
    currentUserId,
    currentUserName,
    isConnecting,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    sendMessage,
  };
}
