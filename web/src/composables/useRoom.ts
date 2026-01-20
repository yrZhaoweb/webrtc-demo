import { ref, onUnmounted } from "vue";
import { AvesClient, type Participant } from "@yrzhao/aves-core";

export function useRoom(serverUrl: string) {
  const client = new AvesClient({
    signalingUrl: serverUrl,
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    debug: true,
  });

  const roomId = ref<string | null>(null);
  const participants = ref<Participant[]>([]);
  const currentUserId = ref("");
  const currentUserName = ref("");
  const isConnecting = ref(false);
  const error = ref<string | null>(null);

  // 设置事件监听
  client.on("userJoined", (user: Participant) => {
    participants.value.push(user);
  });

  client.on("userLeft", (userId: string) => {
    participants.value = participants.value.filter((p) => p.id !== userId);
  });

  client.on("error", (err: Error) => {
    error.value = err.message;
  });

  async function createRoom(userId: string, userName: string): Promise<string> {
    isConnecting.value = true;
    error.value = null;
    currentUserId.value = userId;
    currentUserName.value = userName;

    try {
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

  async function joinRoom(
    targetRoomId: string,
    userId: string,
    userName: string,
  ): Promise<void> {
    isConnecting.value = true;
    error.value = null;
    currentUserId.value = userId;
    currentUserName.value = userName;

    try {
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

  async function leaveRoom(): Promise<void> {
    await client.leaveRoom();
    client.destroy();
    roomId.value = null;
    participants.value = [];
  }

  onUnmounted(() => {
    leaveRoom();
  });

  return {
    client,
    roomId,
    participants,
    currentUserId,
    currentUserName,
    isConnecting,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
  };
}
