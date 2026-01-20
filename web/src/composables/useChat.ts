import { ref } from "vue";
import type { AvesClient } from "@yrzhao/aves-core";

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type?: "user" | "system";
}

export function useChat(
  client: AvesClient,
  currentUserId: string,
  currentUserName: string,
) {
  const messages = ref<ChatMessage[]>([]);

  // 监听消息
  client.on("message", (_peerId: string, message: ChatMessage) => {
    messages.value.push(message);
  });

  function sendMessage(content: string): void {
    if (!content.trim()) return;

    const message: ChatMessage = {
      id: `${currentUserId}-${Date.now()}`,
      senderId: currentUserId,
      senderName: currentUserName,
      content: content.trim(),
      timestamp: Date.now(),
    };

    client.sendMessage(message);
    messages.value.push(message);
  }

  function addSystemMessage(content: string): void {
    messages.value.push({
      id: `system-${Date.now()}`,
      senderId: "system",
      senderName: "系统",
      content,
      timestamp: Date.now(),
      type: "system",
    });
  }

  return {
    messages,
    sendMessage,
    addSystemMessage,
  };
}
