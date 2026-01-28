import { writable } from "svelte/store";
import type { AvesClient } from "@yrzhao/aves-core";
import { generateMessageId, isValidMessage } from "../utils";
import type { ChatMessage } from "./types";

// Configuration
const MAX_MESSAGES = 1000; // Prevent memory leaks

export interface ChatService {
  messages: ReturnType<typeof writable<ChatMessage[]>>;
  sendMessage: (content: string) => void;
  addSystemMessage: (content: string) => void;
}

export function createChat(
  client: AvesClient,
  currentUserId: string,
  currentUserName: string,
): ChatService {
  const messages = writable<ChatMessage[]>([]);

  // Listen for messages from other users
  client.on("message", (_peerId: string, message: ChatMessage) => {
    messages.update((msgs) => {
      const updated = [...msgs, message];
      // Limit message history to prevent memory issues
      return updated.length > MAX_MESSAGES
        ? updated.slice(-MAX_MESSAGES)
        : updated;
    });
  });

  function sendMessage(content: string): void {
    if (!isValidMessage(content)) {
      return;
    }

    const message: ChatMessage = {
      id: generateMessageId(),
      senderId: currentUserId,
      senderName: currentUserName,
      content: content.trim(),
      timestamp: Date.now(),
      type: "user",
    };

    client.sendMessage(message);

    messages.update((msgs) => {
      const updated = [...msgs, message];
      return updated.length > MAX_MESSAGES
        ? updated.slice(-MAX_MESSAGES)
        : updated;
    });
  }

  function addSystemMessage(content: string): void {
    if (!content.trim()) {
      return;
    }

    const message: ChatMessage = {
      id: generateMessageId(),
      senderId: "system",
      senderName: "系统",
      content: content.trim(),
      timestamp: Date.now(),
      type: "system",
    };

    messages.update((msgs) => {
      const updated = [...msgs, message];
      return updated.length > MAX_MESSAGES
        ? updated.slice(-MAX_MESSAGES)
        : updated;
    });
  }

  return {
    messages,
    sendMessage,
    addSystemMessage,
  };
}
