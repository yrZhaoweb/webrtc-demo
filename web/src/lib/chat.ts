import { writable } from "svelte/store";
import type { AvesClient } from "@yrzhao/aves-core";
import { generateMessageId, isValidMessage } from "../utils";
import {
  createChatEnvelope,
  isChatMessage,
  isRoomEnvelope,
  limitSharedHistory,
  mergeChatMessages,
} from "./roomProtocol";
import type { ChatMessage } from "./types";

// Configuration
const MAX_MESSAGES = 1000; // Prevent memory leaks

export interface ChatService {
  messages: ReturnType<typeof writable<ChatMessage[]>>;
  sendMessage: (content: string) => void;
  addSystemMessage: (content: string) => void;
  hydrateMessages: (history: ChatMessage[]) => void;
  getMessages: () => ChatMessage[];
  destroy: () => void;
}

export function createChat(
  client: AvesClient,
  currentUserId: string,
  currentUserName: string,
): ChatService {
  const messages = writable<ChatMessage[]>([]);
  let currentMessages: ChatMessage[] = [];

  function syncMessages(nextMessages: ChatMessage[]): void {
    currentMessages =
      nextMessages.length > MAX_MESSAGES
        ? nextMessages.slice(-MAX_MESSAGES)
        : nextMessages;
    messages.set(currentMessages);
  }

  function appendMessages(nextMessages: ChatMessage[]): void {
    syncMessages(mergeChatMessages(currentMessages, nextMessages));
  }

  const messageListener = (_peerId: string, message: unknown) => {
    if (isRoomEnvelope(message) && message.kind === "chat-message") {
      appendMessages([message.payload]);
      return;
    }

    if (isChatMessage(message)) {
      appendMessages([message]);
    }
  };

  client.on("message", messageListener);

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

    client.sendMessage(createChatEnvelope(message));
    appendMessages([message]);
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

    appendMessages([message]);
  }

  function hydrateMessages(history: ChatMessage[]): void {
    syncMessages(limitSharedHistory(mergeChatMessages(currentMessages, history)));
  }

  return {
    messages,
    sendMessage,
    addSystemMessage,
    hydrateMessages,
    getMessages: () => currentMessages,
    destroy: () => {
      client.off("message", messageListener);
    },
  };
}
