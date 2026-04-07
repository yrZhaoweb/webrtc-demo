<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { navigate } from "svelte-routing";
  import { avesService } from "../services/avesService";
  import { createChat, type ChatService } from "../lib/chat";
  import ConnectionStatus from "../components/ConnectionStatus.svelte";
  import {
    generateInviteLink,
    formatTimestamp,
    generateUserId,
  } from "../utils";
  import type { Participant } from "@yrzhao/aves-core";
  import type { ChatMessage } from "../lib/types";

  export let roomId: string;

  const {
    client,
    participants,
    currentUserId,
    currentUserName,
    isConnecting,
    error,
    joinRoom,
    leaveRoom,
  } = avesService;

  let chat: ChatService | null = null;
  let messages: ChatMessage[] = [];
  let messageInput = "";
  let inviteLink = "";
  let copySuccess = false;
  let showParticipants = true;
  let showNameInput = false;
  let inputUserName = "";
  let messageListElement: HTMLElement | null = null;

  // Subscribe to messages
  $: if (chat) {
    chat.messages.subscribe((msgs) => {
      messages = msgs;
      // Auto-scroll after message update
      scrollToBottom();
    });
  }

  /**
   * Scroll message list to bottom
   * Uses requestAnimationFrame for better performance
   */
  async function scrollToBottom(): Promise<void> {
    await tick();
    if (messageListElement) {
      requestAnimationFrame(() => {
        if (messageListElement) {
          messageListElement.scrollTop = messageListElement.scrollHeight;
        }
      });
    }
  }

  /**
   * Extract user credentials from URL or use defaults
   */
  function getUserCredentials(): { userName: string; userId: string } {
    const params = new URLSearchParams(window.location.search);
    return {
      userName: params.get("userName") || inputUserName || "",
      userId: params.get("userId") || generateUserId(),
    };
  }

  /**
   * Check if already in the target room
   */
  function isAlreadyInRoom(): boolean {
    return $avesService.roomId === roomId && $client !== null;
  }

  /**
   * Handle room join logic
   */
  async function handleJoinRoom(): Promise<void> {
    if (!roomId) {
      error.set("房间 ID 不存在");
      return;
    }

    // If already in this room, just initialize chat
    if (isAlreadyInRoom()) {
      initializeChat();
      inviteLink = generateInviteLink(roomId);
      return;
    }

    const { userName, userId } = getUserCredentials();

    // Show name input if no username provided
    if (!userName) {
      showNameInput = true;
      return;
    }

    try {
      await joinRoom(roomId, userId, userName);
      initializeChat();
      inviteLink = generateInviteLink(roomId);
      showNameInput = false;
    } catch (err) {
      console.error("Failed to join room:", err);
    }
  }

  /**
   * Initialize chat service and setup event listeners
   */
  function initializeChat(): void {
    const clientInstance = $client;
    if (!clientInstance) {
      return;
    }

    // Initialize chat service
    chat = createChat(clientInstance, $currentUserId, $currentUserName);

    // Setup user join/leave event listeners
    setupUserEventListeners(clientInstance);
  }

  /**
   * Setup event listeners for user join/leave events
   */
  function setupUserEventListeners(clientInstance: NonNullable<typeof $client>): void {
    clientInstance.on("userJoined", (user: Participant) => {
      chat?.addSystemMessage(`${user.name} 已进入房间`);
    });

    clientInstance.on("userLeft", (userId: string) => {
      const user = $participants.find((p) => p.id === userId);
      chat?.addSystemMessage(`${user?.name || "用户"} 已离开房间`);
    });
  }

  /**
   * Confirm and join room with input username
   */
  function confirmJoinRoom(): void {
    if (inputUserName.trim()) {
      handleJoinRoom();
    }
  }

  /**
   * Copy invite link to clipboard
   */
  async function copyInviteLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteLink);
      copySuccess = true;
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy invite link:", err);
    }
  }

  /**
   * Send message to chat
   */
  async function sendMessage(): Promise<void> {
    if (!chat || !messageInput.trim()) {
      return;
    }

    chat.sendMessage(messageInput);
    messageInput = "";
    await scrollToBottom();
  }

  /**
   * Leave room and navigate to home
   */
  function handleLeaveRoom(): void {
    leaveRoom();
    navigate("/");
  }

  /**
   * Toggle participants sidebar
   */
  function toggleParticipants(): void {
    showParticipants = !showParticipants;
  }

  /**
   * Handle Enter key press
   */
  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      if (showNameInput) {
        confirmJoinRoom();
      } else {
        sendMessage();
      }
    }
  }

  onMount(() => {
    handleJoinRoom();
  });

  onDestroy(() => {
    // Cleanup will be handled by avesService.leaveRoom()
  });
</script>

<div class="room">
  <!-- 连接状态指示器 -->
  {#if $avesService.roomId}
    <ConnectionStatus />
  {/if}

  <div class="room-header">
    <div class="header-left">
      <h1>聊天室</h1>
      {#if $avesService.roomId}
        <span class="room-id">房间 ID: {$avesService.roomId}</span>
      {/if}
    </div>
    <div class="header-right">
      <button class="leave-btn" on:click={handleLeaveRoom}>离开房间</button>
    </div>
  </div>

  <!-- 用户名输入弹窗 -->
  {#if showNameInput}
    <div class="name-input-overlay">
      <div class="name-input-modal">
        <h2>输入您的名字</h2>
        <p>加入房间前请输入您的名字</p>
        <input
          bind:value={inputUserName}
          type="text"
          placeholder="请输入您的名字"
          class="name-input"
          on:keyup={handleKeyUp}
          autofocus
        />
        <button class="confirm-btn" on:click={confirmJoinRoom} disabled={!inputUserName.trim()}>
          加入房间
        </button>
      </div>
    </div>
  {/if}

  {#if $isConnecting}
    <div class="connecting-status">
      <div class="spinner"></div>
      <p>正在连接...</p>
    </div>
  {/if}

  {#if $error}
    <div class="error-banner">
      {$error}
      <button on:click={() => navigate('/')}>返回首页</button>
    </div>
  {/if}

  {#if $avesService.roomId && !$error}
    <div class="room-content">
      <div class="sidebar" class:collapsed={!showParticipants}>
        <button class="toggle-sidebar-btn" on:click={toggleParticipants}>
          {showParticipants ? '◀' : '▶'}
        </button>

        {#if showParticipants}
          <div class="sidebar-content">
            <div class="invite-section">
              <h3>邀请链接</h3>
              <div class="invite-link-container">
                <input type="text" value={inviteLink} readonly class="invite-link-input" />
                <button class="copy-btn" on:click={copyInviteLink}>
                  {copySuccess ? '✓ 已复制' : '复制'}
                </button>
              </div>
            </div>

            <div class="participants-section">
              <h3>在线 ({$participants.length + 1})</h3>
              <div class="participants-list">
                <div class="participant current-user">
                  <span class="participant-icon">👤</span>
                  <span class="participant-name">{$currentUserName} (你)</span>
                </div>
                {#each $participants as participant (participant.id)}
                  <div class="participant">
                    <span class="participant-icon">👤</span>
                    <span class="participant-name">{participant.name}</span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="chat-area">
        <div class="message-list" bind:this={messageListElement}>
          {#each messages as message (message.id)}
            <div
              class="message"
              class:own-message={message.senderId === $currentUserId && message.type !== 'system'}
              class:other-message={message.senderId !== $currentUserId && message.type !== 'system'}
              class:system-message={message.type === 'system'}
            >
              {#if message.type === 'system'}
                <div class="system-message-content">{message.content}</div>
              {:else}
                <div class="message-header">
                  <span class="message-sender">{message.senderName}</span>
                  <span class="message-time">{formatTimestamp(message.timestamp)}</span>
                </div>
                <div class="message-content">{message.content}</div>
              {/if}
            </div>
          {/each}

          {#if messages.length === 0}
            <div class="empty-messages">
              <p>还没有消息，开始聊天吧！</p>
            </div>
          {/if}
        </div>

        <div class="message-input-container">
          <div class="message-input-wrapper">
            <input
              bind:value={messageInput}
              type="text"
              placeholder="输入消息..."
              class="message-input"
              on:keyup={handleKeyUp}
            />
            <button class="send-btn" on:click={sendMessage} disabled={!messageInput.trim()}>
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .room {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #f5f5f5;
  }

  /* 头部 */
  .room-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    background: white;
    border-bottom: 1px solid #e0e0e0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-left h1 {
    font-size: 1.5rem;
    color: #333;
    margin: 0;
  }

  .room-id {
    font-size: 0.9rem;
    color: #666;
    background: #f0f0f0;
    padding: 4px 12px;
    border-radius: 12px;
  }

  .leave-btn {
    padding: 8px 20px;
    background: #f44336;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.3s ease;
  }

  .leave-btn:hover {
    background: #d32f2f;
  }

  /* 连接状态 */
  .connecting-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px;
    color: #666;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  /* 错误提示 */
  .error-banner {
    background: #fee;
    color: #c33;
    padding: 16px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .error-banner button {
    padding: 6px 16px;
    background: #c33;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  /* 主要内容区域 */
  .room-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* 侧边栏 */
  .sidebar {
    width: 300px;
    background: white;
    border-right: 1px solid #e0e0e0;
    display: flex;
    transition: width 0.3s ease;
    position: relative;
  }

  .sidebar.collapsed {
    width: 40px;
  }

  .toggle-sidebar-btn {
    position: absolute;
    right: 8px;
    top: 8px;
    background: #f0f0f0;
    border: none;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    z-index: 10;
  }

  .sidebar-content {
    flex: 1;
    padding: 16px;
    overflow-y: auto;
  }

  .invite-section,
  .participants-section {
    margin-bottom: 24px;
  }

  .invite-section h3,
  .participants-section h3 {
    font-size: 1rem;
    color: #333;
    margin-bottom: 12px;
  }

  .invite-link-container {
    display: flex;
    gap: 8px;
  }

  .invite-link-input {
    flex: 1;
    padding: 8px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    font-size: 0.85rem;
    background: #f9f9f9;
  }

  .copy-btn {
    padding: 8px 16px;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    white-space: nowrap;
    transition: background 0.3s ease;
  }

  .copy-btn:hover {
    background: #5568d3;
  }

  .participants-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .participant {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: #f9f9f9;
    border-radius: 6px;
  }

  .participant.current-user {
    background: #e3f2fd;
  }

  .participant-icon {
    font-size: 1.2rem;
  }

  .participant-name {
    font-size: 0.9rem;
    color: #333;
  }

  /* 聊天区域 */
  .chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: white;
  }

  .message-list {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .message {
    display: flex;
    flex-direction: column;
    max-width: 70%;
  }

  .own-message {
    align-self: flex-end;
  }

  .other-message {
    align-self: flex-start;
  }

  .system-message {
    align-self: center;
    max-width: 100%;
  }

  .system-message-content {
    padding: 6px 16px;
    background: #e8f5e9;
    color: #2e7d32;
    border-radius: 16px;
    font-size: 0.85rem;
    text-align: center;
  }

  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    gap: 12px;
  }

  .message-sender {
    font-size: 0.85rem;
    font-weight: 600;
    color: #666;
  }

  .message-time {
    font-size: 0.75rem;
    color: #999;
  }

  .message-content {
    padding: 12px 16px;
    border-radius: 12px;
    word-wrap: break-word;
  }

  .own-message .message-content {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .other-message .message-content {
    background: #f0f0f0;
    color: #333;
    border-bottom-left-radius: 4px;
  }

  .empty-messages {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #999;
  }

  /* 消息输入 */
  .message-input-container {
    border-top: 1px solid #e0e0e0;
    padding: 16px 24px;
    background: white;
  }

  .message-input-wrapper {
    display: flex;
    gap: 12px;
  }

  .message-input {
    flex: 1;
    padding: 12px 16px;
    border: 1px solid #e0e0e0;
    border-radius: 24px;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.3s ease;
  }

  .message-input:focus {
    border-color: #667eea;
  }

  .send-btn {
    padding: 12px 32px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 24px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s ease;
  }

  .send-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .send-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* 用户名输入弹窗 */
  .name-input-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .name-input-modal {
    background: white;
    padding: 40px;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    max-width: 400px;
    width: 90%;
    text-align: center;
  }

  .name-input-modal h2 {
    font-size: 1.5rem;
    color: #333;
    margin-bottom: 12px;
  }

  .name-input-modal p {
    color: #666;
    margin-bottom: 24px;
  }

  .name-input-modal .name-input {
    width: 100%;
    padding: 12px 16px;
    font-size: 1rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    margin-bottom: 20px;
    transition: border-color 0.3s ease;
  }

  .name-input-modal .name-input:focus {
    outline: none;
    border-color: #667eea;
  }

  .name-input-modal .confirm-btn {
    width: 100%;
    padding: 12px 32px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 1rem;
    transition: all 0.3s ease;
  }

  .name-input-modal .confirm-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  }

  .name-input-modal .confirm-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
