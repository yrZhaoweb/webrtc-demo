import { ref, computed, onUnmounted } from "vue";
import { AvesClient, type Participant } from "@yrzhao/aves-core";

/**
 * useRoom - 房间状态管理 Composable
 * 使用 aves-core 的 AvesClient 管理房间和 WebRTC 连接
 */
export function useRoom() {
  // AvesClient 实例
  let avesClient: AvesClient | null = null;

  // 状态
  const roomId = ref<string | null>(null);
  const participants = ref<Participant[]>([]);
  const currentUserId = ref<string>("");
  const currentUserName = ref<string>("");
  const isConnected = ref(false);
  const isConnecting = ref(false);
  const error = ref<string | null>(null);

  // 事件回调
  const userJoinedCallbacks: Set<(user: Participant) => void> = new Set();
  const userLeftCallbacks: Set<(userId: string, userName: string) => void> =
    new Set();
  const messageCallbacks: Set<(peerId: string, message: any) => void> =
    new Set();

  // 计算属性
  const isInRoom = computed(() => roomId.value !== null && isConnected.value);
  const participantCount = computed(() => participants.value.length);

  /**
   * 初始化 AvesClient
   */
  function initializeClient(serverUrl: string): void {
    if (avesClient) {
      return;
    }

    avesClient = new AvesClient({
      signalingUrl: serverUrl,
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
      debug: true,
    });

    // 监听用户加入事件
    avesClient.on("userJoined", (user: Participant) => {
      console.log("[Room] User joined:", user.name);
      participants.value.push(user);

      // 触发用户加入回调
      userJoinedCallbacks.forEach((callback) => callback(user));
    });

    // 监听用户离开事件
    avesClient.on("userLeft", (userId: string) => {
      const user = participants.value.find((p) => p.id === userId);
      const userName = user?.name || "未知用户";
      console.log("[Room] User left:", userName);

      participants.value = participants.value.filter((p) => p.id !== userId);

      // 触发用户离开回调
      userLeftCallbacks.forEach((callback) => callback(userId, userName));
    });

    // 监听消息
    avesClient.on("message", (peerId: string, message: any) => {
      messageCallbacks.forEach((callback) => callback(peerId, message));
    });

    // 监听错误
    avesClient.on("error", (err: Error) => {
      console.error("[Room] Error:", err);
      error.value = err.message;
    });

    // 监听连接状态变化
    avesClient.on(
      "connectionStateChange",
      (peerId: string, state: RTCPeerConnectionState) => {
        console.log(`[Room] Connection with ${peerId}: ${state}`);
      },
    );

    // 监听 DataChannel 状态变化
    avesClient.on(
      "dataChannelStateChange",
      (peerId: string, state: RTCDataChannelState) => {
        console.log(`[Room] DataChannel with ${peerId}: ${state}`);
      },
    );
  }

  /**
   * 创建房间
   */
  async function createRoom(
    serverUrl: string,
    userId: string,
    userName: string,
  ): Promise<string> {
    try {
      isConnecting.value = true;
      error.value = null;

      currentUserId.value = userId;
      currentUserName.value = userName;

      // 初始化客户端
      initializeClient(serverUrl);

      // 创建房间
      const newRoomId = await avesClient!.createRoom();
      roomId.value = newRoomId;

      // 加入房间
      await avesClient!.joinRoom(newRoomId, userId, userName);

      isConnected.value = true;
      isConnecting.value = false;

      return newRoomId;
    } catch (err) {
      isConnecting.value = false;
      error.value =
        err instanceof Error ? err.message : "Failed to create room";
      throw err;
    }
  }

  /**
   * 加入房间
   */
  async function joinRoom(
    serverUrl: string,
    targetRoomId: string,
    userId: string,
    userName: string,
  ): Promise<void> {
    try {
      isConnecting.value = true;
      error.value = null;

      currentUserId.value = userId;
      currentUserName.value = userName;
      roomId.value = targetRoomId;

      // 初始化客户端
      initializeClient(serverUrl);

      // 加入房间
      const existingParticipants = await avesClient!.joinRoom(
        targetRoomId,
        userId,
        userName,
      );

      participants.value = existingParticipants;
      console.log("[Room] Existing participants:", existingParticipants);

      isConnected.value = true;
      isConnecting.value = false;
    } catch (err) {
      isConnecting.value = false;
      roomId.value = null;
      error.value = err instanceof Error ? err.message : "Failed to join room";
      throw err;
    }
  }

  /**
   * 离开房间
   */
  async function leaveRoom(): Promise<void> {
    console.log("[Room] Leaving room");

    if (avesClient) {
      await avesClient.leaveRoom();
      avesClient.destroy();
      avesClient = null;
    }

    // 重置状态
    roomId.value = null;
    participants.value = [];
    isConnected.value = false;
    error.value = null;
  }

  /**
   * 发送消息到所有用户
   */
  function sendMessage(message: any): void {
    if (!avesClient) {
      throw new Error("Client not initialized");
    }
    avesClient.sendMessage(message);
  }

  /**
   * 发送消息到指定用户
   */
  function sendMessageToPeer(peerId: string, message: any): void {
    if (!avesClient) {
      throw new Error("Client not initialized");
    }
    avesClient.sendMessageToPeer(peerId, message);
  }

  /**
   * 监听消息
   */
  function onMessage(callback: (peerId: string, message: any) => void): void {
    messageCallbacks.add(callback);
  }

  /**
   * 获取当前用户信息
   */
  function getCurrentUser(): { id: string; name: string } {
    return {
      id: currentUserId.value,
      name: currentUserName.value,
    };
  }

  /**
   * 监听用户加入事件
   */
  function onUserJoined(callback: (user: Participant) => void): void {
    userJoinedCallbacks.add(callback);
  }

  /**
   * 监听用户离开事件
   */
  function onUserLeft(
    callback: (userId: string, userName: string) => void,
  ): void {
    userLeftCallbacks.add(callback);
  }

  // 组件卸载时清理
  onUnmounted(() => {
    leaveRoom();
  });

  return {
    // 状态
    roomId,
    participants,
    currentUserId,
    currentUserName,
    isConnected,
    isConnecting,
    isInRoom,
    participantCount,
    error,

    // 方法
    createRoom,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendMessageToPeer,
    onMessage,
    getCurrentUser,
    onUserJoined,
    onUserLeft,
  };
}
