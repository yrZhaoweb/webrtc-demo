import { ref, computed, onUnmounted } from "vue";
import { SignalingService } from "../services/signalingService";
import { WebRTCManager } from "../services/webrtcManager";
import { WebRTCConnectionManager } from "../services/webrtcConnectionManager";
import type { Participant } from "../types";

/**
 * useRoom - 房间状态管理 Composable
 * 专注于房间业务逻辑：房间信息、参与者列表、连接状态
 * WebRTC 连接逻辑已抽离到 WebRTCConnectionManager
 */
export function useRoom() {
  // 服务实例
  const signalingService = new SignalingService();
  const webrtcManager = new WebRTCManager();
  const webrtcConnectionManager = new WebRTCConnectionManager(
    signalingService,
    webrtcManager
  );

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

  // 计算属性
  const isInRoom = computed(() => roomId.value !== null && isConnected.value);
  const participantCount = computed(() => participants.value.length);

  /**
   * 连接到信令服务器并初始化 WebRTC
   */
  async function connectToSignalingServer(serverUrl: string): Promise<void> {
    try {
      await signalingService.connect(serverUrl);

      // 初始化 WebRTC 连接管理器
      webrtcConnectionManager.initialize(currentUserId.value);

      // 设置业务逻辑相关的信令处理器
      setupBusinessHandlers();
    } catch (err) {
      error.value = "Failed to connect to signaling server";
      throw err;
    }
  }

  /**
   * 设置业务逻辑相关的信令处理器
   * 只处理房间业务，不涉及 WebRTC 连接细节
   */
  function setupBusinessHandlers(): void {
    signalingService.onUserJoined((user: Participant) => {
      console.log("[Room] User joined:", user.name);
      participants.value.push(user);

      // 触发用户加入回调
      userJoinedCallbacks.forEach((callback) => callback(user));

      // 使用 ID 比较避免双方同时发起连接
      // 规则：ID 较小的用户主动发起连接
      if (currentUserId.value < user.id) {
        console.log(
          `[Room] Initiating connection to ${user.name} (我的 ID 较小)`
        );
        webrtcConnectionManager.connectToPeer(user.id).catch((err) => {
          console.error(`[Room] Failed to connect to ${user.name}:`, err);
        });
      } else {
        console.log(
          `[Room] Waiting for ${user.name} to initiate connection (对方 ID 较小)`
        );
      }
    });

    signalingService.onUserLeft((userId: string) => {
      const user = participants.value.find((p) => p.id === userId);
      const userName = user?.name || "未知用户";
      console.log("[Room] User left:", userName);

      participants.value = participants.value.filter((p) => p.id !== userId);
      webrtcConnectionManager.disconnectFromPeer(userId);

      // 触发用户离开回调
      userLeftCallbacks.forEach((callback) => callback(userId, userName));
    });
  }

  /**
   * 创建房间
   */
  async function createRoom(
    serverUrl: string,
    userId: string,
    userName: string
  ): Promise<string> {
    try {
      isConnecting.value = true;
      error.value = null;

      currentUserId.value = userId;
      currentUserName.value = userName;

      // 连接到信令服务器
      await connectToSignalingServer(serverUrl);

      // 创建房间
      const newRoomId = await signalingService.createRoom();
      roomId.value = newRoomId;

      // 加入房间
      await signalingService.joinRoom(newRoomId, userId, userName);

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

  async function joinRoom(
    serverUrl: string,
    targetRoomId: string,
    userId: string,
    userName: string
  ): Promise<void> {
    try {
      isConnecting.value = true;
      error.value = null;

      currentUserId.value = userId;
      currentUserName.value = userName;
      roomId.value = targetRoomId;

      await connectToSignalingServer(serverUrl);

      const existingParticipants = await signalingService.joinRoom(
        targetRoomId,
        userId,
        userName
      );

      participants.value = existingParticipants;
      console.log("[Room] Existing participants:", existingParticipants);

      // 使用 ID 比较避免双方同时发起连接
      // 规则：ID 较小的用户主动发起连接
      existingParticipants.forEach((participant) => {
        if (currentUserId.value < participant.id) {
          console.log(
            `[Room] Initiating connection to ${participant.name} (我的 ID 较小)`
          );
          webrtcConnectionManager.connectToPeer(participant.id).catch((err) => {
            console.error(
              `[Room] Failed to connect to ${participant.name}:`,
              err
            );
          });
        } else {
          console.log(
            `[Room] Waiting for ${participant.name} to initiate connection (对方 ID 较小)`
          );
        }
      });

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
  function leaveRoom(): void {
    console.log("[Room] Leaving room");

    // 断开所有 WebRTC 连接
    webrtcConnectionManager.disconnectAll();

    // 断开信令服务器连接
    signalingService.disconnect();

    // 重置状态
    roomId.value = null;
    participants.value = [];
    isConnected.value = false;
    error.value = null;
  }

  /**
   * 获取 WebRTC Manager 实例（供 useChat 使用）
   */
  function getWebRTCManager(): WebRTCManager {
    return webrtcConnectionManager.getWebRTCManager();
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
    callback: (userId: string, userName: string) => void
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
    getWebRTCManager,
    getCurrentUser,
    onUserJoined,
    onUserLeft,
  };
}
