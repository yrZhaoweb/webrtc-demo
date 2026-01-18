import { ref, computed } from "vue";
import type { ChatMessage } from "../types";
import type { WebRTCManager } from "../services/webrtcManager";

/**
 * useChat - 聊天状态管理 Composable
 * 管理消息列表、消息发送
 */
export function useChat(
  webrtcManager: WebRTCManager,
  currentUserId: string,
  currentUserName: string
) {
  const messages = ref<ChatMessage[]>([]);
  const isSending = ref(false);
  const sendError = ref<string | null>(null);

  const messageCount = computed(() => messages.value.length);
  const hasMessages = computed(() => messages.value.length > 0);

  function validateMessage(content: string): boolean {
    return content.trim().length > 0;
  }

  function generateMessageId(): string {
    return `${currentUserId}-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  function addMessage(message: ChatMessage): void {
    messages.value.push(message);
  }

  async function sendMessage(content: string): Promise<void> {
    if (!validateMessage(content)) {
      sendError.value = "Cannot send empty message";
      return;
    }

    try {
      isSending.value = true;
      sendError.value = null;

      const message: ChatMessage = {
        id: generateMessageId(),
        senderId: currentUserId,
        senderName: currentUserName,
        content: content.trim(),
        timestamp: Date.now(),
      };

      webrtcManager.sendMessage(message);
      addMessage(message);

      isSending.value = false;
    } catch (err) {
      isSending.value = false;
      sendError.value =
        err instanceof Error ? err.message : "Failed to send message";
      throw err;
    }
  }

  function setupMessageHandler(): void {
    webrtcManager.onMessage((peerId: string, message: ChatMessage) => {
      console.log(`Received message from ${peerId}:`, message);
      addMessage(message);
    });
  }

  function clearMessages(): void {
    messages.value = [];
  }

  function getMessagesByUser(userId: string): ChatMessage[] {
    return messages.value.filter((msg) => msg.senderId === userId);
  }

  function getRecentMessages(count: number): ChatMessage[] {
    return messages.value.slice(-count);
  }

  const sortedMessages = computed(() => {
    return [...messages.value].sort((a, b) => a.timestamp - b.timestamp);
  });

  setupMessageHandler();

  return {
    // 状态
    messages,
    sortedMessages,
    isSending,
    sendError,
    messageCount,
    hasMessages,

    // 方法
    sendMessage,
    addMessage,
    clearMessages,
    getMessagesByUser,
    getRecentMessages,
    validateMessage,
  };
}
