<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { navigate } from "svelte-routing";
  import type { AvesClient, AvesMessage, Participant } from "@yrzhao/aves-core";
  import ConnectionStatus from "../components/ConnectionStatus.svelte";
  import ValidationConsole from "../components/ValidationConsole.svelte";
  import { createChat, type ChatService } from "../lib/chat";
  import {
    createAudioPolicyEnvelope,
    createHistoryRequestEnvelope,
    createHistorySnapshotEnvelope,
    createRoomDissolvedEnvelope,
    isRoomEnvelope,
  } from "../lib/roomProtocol";
  import type { ChatMessage } from "../lib/types";
  import {
    avesService,
    type DemoFileTransfer,
  } from "../services/avesService";
  import {
    formatTimestamp,
    generateInviteLink,
    generateUserId,
  } from "../utils";

  export let roomId: string;

  const {
    roomId: joinedRoomId,
    client,
    participants,
    currentUserId,
    currentUserName,
    isConnecting,
    error,
    joinRoom,
    leaveRoom,
    localAudioState,
    localVideoState,
    screenShareState,
    remoteAudioStreams,
    remoteVideoStreams,
    fileTransfers,
    localPreviewStream,
    startVoice,
    stopVoice,
    toggleMute,
    startVideo,
    stopVideo,
    toggleVideoMute,
    startScreenShare,
    stopScreenShare,
    sendFile,
    startServerDiagnosticsPolling,
    stopServerDiagnosticsPolling,
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
  let fileInputElement: HTMLInputElement | null = null;
  let selectedFile: File | null = null;
  let selectedPeerId = "";
  let remoteAudioEntries: Array<[string, MediaStream]> = [];
  let remoteVideoEntries: Array<[string, MediaStream]> = [];
  let chatUnsubscribe: (() => void) | null = null;
  let chatEventClient: AvesClient | null = null;
  let knownParticipantNames = new Map<string, string>();
  let roomHostId = "";
  let roomHostName = "";
  let roomVoiceEnabled = false;
  let roomStateSynced = false;
  let isHost = false;
  let canOpenMicrophone = false;
  let showHostDisbandConfirm = false;
  let showRoomClosedDialog = false;
  let roomClosedMessage = "房间已解散";
  let isClosingRoom = false;

  $: {
    chatUnsubscribe?.();
    chatUnsubscribe = null;

    if (chat) {
      chatUnsubscribe = chat.messages.subscribe((msgs) => {
      messages = msgs;
      void scrollToBottom();
      });
    }
  }

  $: remoteAudioEntries = Array.from($remoteAudioStreams.entries());
  $: remoteVideoEntries = Array.from($remoteVideoStreams.entries());
  $: isHost = !!$currentUserId && roomHostId === $currentUserId;
  $: canOpenMicrophone = roomVoiceEnabled;
  $: if (
    selectedPeerId &&
    !$participants.some((participant) => participant.id === selectedPeerId)
  ) {
    selectedPeerId = "";
  }
  $: {
    if ($currentUserId && $currentUserName) {
      knownParticipantNames.set($currentUserId, $currentUserName);
    }

    $participants.forEach((participant) => {
      knownParticipantNames.set(participant.id, participant.name);
    });
  }

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

  function getUserCredentials(): { userName: string; userId: string } {
    const params = new URLSearchParams(window.location.search);
    return {
      userName: params.get("userName") || inputUserName || "",
      userId: params.get("userId") || generateUserId(),
    };
  }

  function isAlreadyInRoom(): boolean {
    return $joinedRoomId === roomId && $client !== null;
  }

  async function handleJoinRoom(): Promise<void> {
    if (!roomId) {
      error.set("房间 ID 不存在");
      return;
    }

    if (isAlreadyInRoom()) {
      initializeChat();
      inviteLink = generateInviteLink(roomId);
      return;
    }

    const { userName, userId } = getUserCredentials();
    if (!userName) {
      showNameInput = true;
      return;
    }

    try {
      await joinRoom(roomId, userId, userName);
      initializeChat();
      inviteLink = generateInviteLink(roomId);
      showNameInput = false;
    } catch (joinError) {
      console.error("Failed to join room:", joinError);
    }
  }

  function initializeChat(): void {
    const clientInstance = $client as AvesClient | null;
    if (!clientInstance) {
      return;
    }

    if (chat && chatEventClient === clientInstance) {
      return;
    }

    chat?.destroy();
    chat = createChat(clientInstance, $currentUserId, $currentUserName);
    setupUserEventListeners(clientInstance);

    if ($participants.length === 0) {
      roomHostId = $currentUserId;
      roomHostName = $currentUserName;
      roomVoiceEnabled = false;
      roomStateSynced = true;
      return;
    }

    roomStateSynced = false;
    requestRoomSnapshot();
  }

  function setupUserEventListeners(
    clientInstance: AvesClient,
  ): void {
    if (chatEventClient === clientInstance) {
      return;
    }

    if (chatEventClient) {
      chatEventClient.off("userJoined", handleSystemUserJoined);
      chatEventClient.off("userLeft", handleSystemUserLeft);
      chatEventClient.off("message", handleRoomMessage);
    }

    chatEventClient = clientInstance;
    clientInstance.on("userJoined", handleSystemUserJoined);
    clientInstance.on("userLeft", handleSystemUserLeft);
    clientInstance.on("message", handleRoomMessage);
  }

  function handleSystemUserJoined(user: Participant): void {
    knownParticipantNames.set(user.id, user.name);
    chat?.addSystemMessage(`${user.name} 已进入房间`);

    if (isHost) {
      sendSnapshotToPeer(user.id);
    }
  }

  function handleSystemUserLeft(userId: string): void {
    const departedName = knownParticipantNames.get(userId) || "用户";
    chat?.addSystemMessage(`${departedName} 已离开房间`);
    knownParticipantNames.delete(userId);

    if (userId === roomHostId && !isHost) {
      roomHostId = "";
      roomHostName = "";
      roomVoiceEnabled = false;
      roomStateSynced = false;

      if ($localAudioState.active) {
        stopVoice();
      }

      openRoomClosedDialog(`${departedName} 已退出，房间已解散`);
    }
  }

  function handleRoomMessage(peerId: string, message: unknown): void {
    if (!isRoomEnvelope(message)) {
      return;
    }

    if (message.kind === "history-request") {
      if (isHost) {
        sendSnapshotToPeer(peerId);
      }
      return;
    }

    if (message.kind === "history-snapshot") {
      roomHostId = message.payload.hostId;
      roomHostName = message.payload.hostName;
      roomVoiceEnabled = message.payload.audioEnabled;
      roomStateSynced = true;
      knownParticipantNames.set(message.payload.hostId, message.payload.hostName);
      chat?.hydrateMessages(message.payload.history);

      if (!message.payload.audioEnabled && $localAudioState.active) {
        stopVoice();
      }
      return;
    }

    if (message.kind === "audio-policy") {
      roomHostId = message.payload.hostId;
      roomHostName = message.payload.hostName;
      roomVoiceEnabled = message.payload.enabled;
      roomStateSynced = true;
      knownParticipantNames.set(message.payload.hostId, message.payload.hostName);

      if (!message.payload.enabled && $localAudioState.active) {
        stopVoice();
      }

      chat?.addSystemMessage(
        message.payload.enabled
          ? `${message.payload.hostName} 已开启房间语音`
          : `${message.payload.hostName} 已关闭房间语音`,
      );
      return;
    }

    if (message.kind === "room-dissolved") {
      openRoomClosedDialog(message.payload.reason);
    }
  }

  function sendEnvelopeToPeerWithRetry(
    peerId: string,
    message: AvesMessage,
    attempt = 0,
  ): void {
    const clientInstance = $client as AvesClient | null;
    if (!clientInstance) {
      return;
    }

    try {
      clientInstance.sendMessageToPeer(peerId, message);
    } catch (sendError) {
      if (attempt >= 5) {
        console.warn("Failed to send room envelope:", sendError);
        return;
      }

      window.setTimeout(() => {
        sendEnvelopeToPeerWithRetry(peerId, message, attempt + 1);
      }, 400 * (attempt + 1));
    }
  }

  function sendSnapshotToPeer(peerId: string): void {
    if (!chat) {
      return;
    }

    const nextHostId = roomHostId || $currentUserId;
    const nextHostName = roomHostName || $currentUserName;

    if (!nextHostId || !nextHostName) {
      return;
    }

    sendEnvelopeToPeerWithRetry(
      peerId,
      createHistorySnapshotEnvelope(
        nextHostId,
        nextHostName,
        roomVoiceEnabled,
        chat.getMessages(),
      ),
    );
  }

  function sendAudioPolicyToPeer(peerId: string, enabled: boolean): void {
    const nextHostId = roomHostId || $currentUserId;
    const nextHostName = roomHostName || $currentUserName;

    if (!nextHostId || !nextHostName) {
      return;
    }

    sendEnvelopeToPeerWithRetry(
      peerId,
      createAudioPolicyEnvelope(enabled, nextHostId, nextHostName),
    );
  }

  function requestRoomSnapshot(): void {
    const clientInstance = $client as AvesClient | null;
    if (!clientInstance || isHost || roomStateSynced) {
      return;
    }

    const request = createHistoryRequestEnvelope($currentUserId, $currentUserName);
    $participants.forEach((participant) => {
      sendEnvelopeToPeerWithRetry(participant.id, request);
    });
  }

  function openRoomClosedDialog(message: string): void {
    roomClosedMessage = message;
    showRoomClosedDialog = true;
    roomVoiceEnabled = false;
    roomStateSynced = false;

    if ($localAudioState.active) {
      stopVoice();
    }
  }

  function confirmJoinRoom(): void {
    if (inputUserName.trim()) {
      void handleJoinRoom();
    }
  }

  async function copyInviteLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteLink);
      copySuccess = true;
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    } catch (copyError) {
      console.error("Failed to copy invite link:", copyError);
    }
  }

  async function sendMessage(): Promise<void> {
    if (!chat || !messageInput.trim()) {
      return;
    }

    chat.sendMessage(messageInput);
    messageInput = "";
    await scrollToBottom();
  }

  async function handleVoiceToggle(): Promise<void> {
    try {
      if ($localAudioState.active) {
        stopVoice();
        return;
      }

      if (!canOpenMicrophone) {
        chat?.addSystemMessage(
          roomHostName
            ? `${roomHostName} 尚未开启房间语音`
            : "请等待房主开启房间语音",
        );
        return;
      }

      await startVoice();
    } catch (voiceError) {
      console.error("Failed to toggle voice:", voiceError);
    }
  }

  function handleRoomVoiceToggle(): void {
    if (!isHost) {
      return;
    }

    roomVoiceEnabled = !roomVoiceEnabled;
    roomStateSynced = true;
    chat?.addSystemMessage(
      roomVoiceEnabled
        ? "房主已开启房间语音，所有成员可以打开麦克风"
        : "房主已关闭房间语音",
    );

    if (!roomVoiceEnabled && $localAudioState.active) {
      stopVoice();
    }

    $participants.forEach((participant) => {
      sendAudioPolicyToPeer(participant.id, roomVoiceEnabled);
    });
  }

  function handleMuteToggle(): void {
    toggleMute();
  }

  async function handleVideoToggle(): Promise<void> {
    try {
      if ($localVideoState.active) {
        stopVideo();
        return;
      }

      await startVideo();
    } catch (videoError) {
      console.error("Failed to toggle video:", videoError);
    }
  }

  function handleVideoMuteToggle(): void {
    toggleVideoMute();
  }

  async function handleScreenShareToggle(): Promise<void> {
    try {
      if ($screenShareState.active) {
        stopScreenShare();
        return;
      }

      await startScreenShare();
    } catch (shareError) {
      console.error("Failed to toggle screen share:", shareError);
    }
  }

  function attachVideoStream(node: HTMLVideoElement, stream: MediaStream) {
    node.srcObject = stream;
    void node.play().catch(() => {});

    return {
      update(nextStream: MediaStream) {
        node.srcObject = nextStream;
        void node.play().catch(() => {});
      },
      destroy() {
        node.pause();
        node.srcObject = null;
      },
    };
  }

  function handleFileChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    selectedFile = input.files?.[0] ?? null;
  }

  async function handleFileSend(): Promise<void> {
    if (!selectedFile) {
      return;
    }

    await sendFiles([selectedFile]);
  }

  async function sendFiles(files: File[]): Promise<void> {
    try {
      for (const file of files) {
        await sendFile(file, selectedPeerId || undefined);
      }

      selectedFile = null;
      if (fileInputElement) {
        fileInputElement.value = "";
      }
    } catch (fileError) {
      console.error("Failed to send file:", fileError);
    }
  }

  function downloadTransfer(transfer: DemoFileTransfer): void {
    if (!transfer.blob) {
      return;
    }

    const url = URL.createObjectURL(transfer.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = transfer.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handleLeaveRoom(): void {
    if (isHost) {
      showHostDisbandConfirm = true;
      return;
    }

    void leaveRoomAndNavigateHome();
  }

  async function leaveRoomAndNavigateHome(): Promise<void> {
    await leaveRoom();
    navigate("/");
  }

  async function confirmHostDisband(): Promise<void> {
    if (isClosingRoom) {
      return;
    }

    isClosingRoom = true;
    showHostDisbandConfirm = false;

    const hostId = roomHostId || $currentUserId;
    const hostName = roomHostName || $currentUserName;

    $participants.forEach((participant) => {
      sendEnvelopeToPeerWithRetry(
        participant.id,
        createRoomDissolvedEnvelope(
          hostId,
          hostName,
          `${hostName} 已解散房间`,
        ),
      );
    });

    await new Promise((resolve) => window.setTimeout(resolve, 180));
    await leaveRoomAndNavigateHome();
  }

  function cancelHostDisband(): void {
    showHostDisbandConfirm = false;
  }

  async function confirmRoomClosed(): Promise<void> {
    showRoomClosedDialog = false;
    await leaveRoomAndNavigateHome();
  }

  function toggleParticipants(): void {
    showParticipants = !showParticipants;
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key !== "Enter") {
      return;
    }

    if (showNameInput) {
      confirmJoinRoom();
      return;
    }

    void sendMessage();
  }

  async function handleMessagePaste(event: ClipboardEvent): Promise<void> {
    const files = Array.from(event.clipboardData?.items ?? [])
      .map((item) => (item.kind === "file" ? item.getAsFile() : null))
      .filter((file): file is File => file !== null);

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    await sendFiles(files);
  }

  function participantLabel(peerId: string): string {
    const participant = $participants.find((item) => item.id === peerId);
    return participant?.name || knownParticipantNames.get(peerId) || peerId;
  }

  function attachStream(node: HTMLAudioElement, stream: MediaStream) {
    node.srcObject = stream;
    void node.play().catch(() => {});

    return {
      update(nextStream: MediaStream) {
        node.srcObject = nextStream;
        void node.play().catch(() => {});
      },
      destroy() {
        node.pause();
        node.srcObject = null;
      },
    };
  }

  onMount(() => {
    const stopDiagnosticsPolling = startServerDiagnosticsPolling();
    const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      if (!isHost || !$joinedRoomId) {
        return;
      }

      event.preventDefault();
      event.returnValue = "房主退出将解散房间";
    };

    window.addEventListener("beforeunload", beforeUnloadHandler);
    void handleJoinRoom();

    return () => {
      stopDiagnosticsPolling();
      window.removeEventListener("beforeunload", beforeUnloadHandler);
    };
  });

  onDestroy(() => {
    chatUnsubscribe?.();
    chat?.destroy();
    if (chatEventClient) {
      chatEventClient.off("userJoined", handleSystemUserJoined);
      chatEventClient.off("userLeft", handleSystemUserLeft);
      chatEventClient.off("message", handleRoomMessage);
    }
    remoteAudioEntries = [];
    stopServerDiagnosticsPolling();
  });
</script>

<div class="room">
  <div class="room-header">
    <div class="header-left">
      <h1>聊天室</h1>
      {#if $joinedRoomId}
        <span class="room-id">房间 ID: {$joinedRoomId}</span>
      {/if}
    </div>
    <div class="header-actions">
      {#if $joinedRoomId}
        <ConnectionStatus />
      {/if}
      <button class="leave-btn" on:click={handleLeaveRoom}>离开房间</button>
    </div>
  </div>

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
        />
        <button
          class="confirm-btn"
          on:click={confirmJoinRoom}
          disabled={!inputUserName.trim()}
        >
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
      <span>{$error}</span>
      <button on:click={() => navigate("/")}>返回首页</button>
    </div>
  {/if}

  {#if showHostDisbandConfirm}
    <div class="dialog-overlay">
      <div class="dialog-card">
        <h2>解散房间</h2>
        <p>你是房主，退出房间会直接解散房间，所有成员都会被移出。</p>
        <div class="dialog-actions">
          <button class="secondary-btn" on:click={cancelHostDisband}>取消</button>
          <button class="leave-btn" on:click={() => void confirmHostDisband()} disabled={isClosingRoom}>
            {isClosingRoom ? "正在解散..." : "退出并解散"}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showRoomClosedDialog}
    <div class="dialog-overlay">
      <div class="dialog-card">
        <h2>房间已解散</h2>
        <p>{roomClosedMessage}</p>
        <div class="dialog-actions single">
          <button class="confirm-btn" on:click={() => void confirmRoomClosed()}>
            确认
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if $joinedRoomId}
    <div class="room-content">
      <aside class="sidebar" class:collapsed={!showParticipants}>
        <button class="toggle-sidebar-btn" on:click={toggleParticipants}>
          {showParticipants ? "◀" : "▶"}
        </button>

        {#if showParticipants}
          <div class="sidebar-content">
            <section class="invite-section">
              <h3>邀请链接</h3>
              <div class="invite-link-container">
                <input type="text" value={inviteLink} readonly class="invite-link-input" />
                <button class="copy-btn" on:click={copyInviteLink}>
                  {copySuccess ? "✓ 已复制" : "复制"}
                </button>
              </div>
            </section>

            <section class="participants-section" data-testid="participants-panel">
              <h3>在线 ({$participants.length + 1})</h3>
              <div class="participants-list">
                <div class="participant current-user">
                  <span class="participant-icon">👤</span>
                  <span class="participant-name">
                    {$currentUserName} (你)
                    {#if isHost}
                      <span class="host-badge">房主</span>
                    {/if}
                  </span>
                </div>
                {#each $participants as participant (participant.id)}
                  <div class="participant" data-testid={`participant-${participant.id}`}>
                    <span class="participant-icon">👤</span>
                    <span class="participant-name">
                      {participant.name}
                      {#if participant.id === roomHostId}
                        <span class="host-badge">房主</span>
                      {/if}
                    </span>
                  </div>
                {/each}
              </div>
            </section>
          </div>
        {/if}
      </aside>

      <div class="chat-area">
        <div class="room-tools" data-testid="room-tools">
          <ValidationConsole currentRoomId={$joinedRoomId} />

          <div class="toolbelt" data-testid="toolbelt">
          <section class="tool-card" data-testid="voice-panel">
            <div class="tool-card-header">
              <h3>实时语音</h3>
              <span class:status-live={roomVoiceEnabled}>
                {roomVoiceEnabled ? "房间语音已开放" : "房间语音未开放"}
              </span>
            </div>
            <div class="tool-card-actions">
              {#if isHost}
                <button class="secondary-btn" on:click={handleRoomVoiceToggle}>
                  {roomVoiceEnabled ? "关闭房间语音" : "开启房间语音"}
                </button>
              {/if}
              <button
                class="secondary-btn"
                data-testid="voice-toggle"
                on:click={handleVoiceToggle}
                disabled={!roomVoiceEnabled && !$localAudioState.active}
              >
                {$localAudioState.active ? "关闭麦克风" : "开启麦克风"}
              </button>
              <button
                class="secondary-btn"
                data-testid="mute-toggle"
                on:click={handleMuteToggle}
                disabled={!$localAudioState.active}
              >
                {$localAudioState.muted ? "取消静音" : "静音"}
              </button>
            </div>
            <p class="muted-text">
              {#if isHost}
                你控制全房语音开关。开启后，所有成员都可以主动打开麦克风。
              {:else if roomVoiceEnabled}
                房主已开放语音，你现在可以打开麦克风交流。
              {:else}
                等待房主开放语音后再打开麦克风。
              {/if}
            </p>
            <div class="remote-audio-list">
              {#if remoteAudioEntries.length === 0}
                <p class="muted-text">当前没有远端音频流</p>
              {:else}
                {#each remoteAudioEntries as [peerId, stream] (peerId)}
                  <div class="remote-audio-item" data-testid={`remote-audio-${peerId}`}>
                    <span>{participantLabel(peerId)}</span>
                    <audio autoplay playsinline use:attachStream={stream}></audio>
                  </div>
                {/each}
              {/if}
            </div>
          </section>

          <section class="tool-card" data-testid="video-panel">
            <div class="tool-card-header">
              <h3>实时视频</h3>
              <span class:status-live={$localVideoState.active && !$localVideoState.muted}>
                {#if $screenShareState.active}
                  屏幕共享中
                {:else if $localVideoState.active && !$localVideoState.muted}
                  摄像头已开启
                {:else if $localVideoState.active && $localVideoState.muted}
                  摄像头已静音
                {:else}
                  摄像头未开启
                {/if}
              </span>
            </div>
            <div class="tool-card-actions">
              <button
                class="secondary-btn"
                data-testid="video-toggle"
                on:click={() => void handleVideoToggle()}
              >
                {$localVideoState.active ? "关闭摄像头" : "开启摄像头"}
              </button>
              <button
                class="secondary-btn"
                data-testid="video-mute-toggle"
                on:click={handleVideoMuteToggle}
                disabled={!$localVideoState.active}
              >
                {$localVideoState.muted ? "取消静音" : "静音视频"}
              </button>
              <button
                class="secondary-btn"
                data-testid="screen-share-toggle"
                on:click={() => void handleScreenShareToggle()}
              >
                {$screenShareState.active ? "停止共享" : "共享屏幕"}
              </button>
            </div>
            {#if $localPreviewStream}
              <div class="local-video-preview">
                <video
                  muted
                  playsinline
                  autoplay
                  use:attachVideoStream={$localPreviewStream}
                  class="local-video"
                >
                  <track kind="captions" />
                </video>
                {#if $localVideoState.muted}
                  <span class="video-muted-overlay">摄像头已静音</span>
                {/if}
                {#if $screenShareState.active}
                  <span class="screen-share-badge">正在共享屏幕</span>
                {/if}
              </div>
            {/if}
            <p class="muted-text">
              开启摄像头后，远程成员可以看到你的画面。你可以选择静音摄像头或共享屏幕代替画面。
            </p>
          </section>

          <section class="tool-card" data-testid="video-grid-panel">
            <div class="tool-card-header">
              <h3>远程视频</h3>
              <span>{remoteVideoEntries.length} 个视频流</span>
            </div>
            <div class="remote-video-grid">
              {#if remoteVideoEntries.length === 0}
                <p class="muted-text">当前没有远端视频流</p>
              {:else}
                {#each remoteVideoEntries as [peerId, stream] (peerId)}
                  <div class="remote-video-item" data-testid={`remote-video-${peerId}`}>
                    <div class="remote-video-label">{participantLabel(peerId)}</div>
                    <video
                      autoplay
                      playsinline
                      use:attachVideoStream={stream}
                      class="remote-video"
                    >
                      <track kind="captions" />
                    </video>
                  </div>
                {/each}
              {/if}
            </div>
          </section>

          <section class="tool-card" data-testid="file-panel">
            <div class="tool-card-header">
              <h3>文件传输</h3>
              <span>{selectedPeerId ? "单播" : "广播"}</span>
            </div>
            <div class="file-form">
              <select bind:value={selectedPeerId} class="peer-select" data-testid="file-target">
                <option value="">发送给所有已连接节点</option>
                {#each $participants as participant (participant.id)}
                  <option value={participant.id}>{participant.name}</option>
                {/each}
              </select>
              <input
                bind:this={fileInputElement}
                type="file"
                class="file-input"
                data-testid="file-input"
                on:change={handleFileChange}
              />
              <button
                class="secondary-btn"
                data-testid="send-file"
                on:click={handleFileSend}
                disabled={!selectedFile}
              >
                {selectedFile ? `发送 ${selectedFile.name}` : "选择文件后发送"}
              </button>
            </div>
            <p class="muted-text">支持从下方输入框直接粘贴文件，默认按当前目标发送。</p>
            <div class="transfer-list" data-testid="transfer-list">
              {#if $fileTransfers.length === 0}
                <p class="muted-text">还没有文件传输记录</p>
              {:else}
                {#each $fileTransfers as transfer (transfer.transferId)}
                  <div class="transfer-item" data-testid={`transfer-${transfer.transferId}`}>
                    <div class="transfer-meta">
                      <strong>{transfer.name}</strong>
                      <span>{transfer.direction === "send" ? "发送给" : "来自"} {transfer.peerName}</span>
                    </div>
                    <div class="transfer-progress">
                      <div class="progress-track">
                        <div class="progress-fill" style={`width: ${transfer.progress}%`}></div>
                      </div>
                      <span>{transfer.progress.toFixed(0)}%</span>
                    </div>
                    <div class="transfer-footer">
                      <span class={`transfer-status ${transfer.status}`}>{transfer.status}</span>
                      {#if transfer.status === "completed" && transfer.direction === "receive" && transfer.blob}
                        <button class="download-btn" on:click={() => downloadTransfer(transfer)}>
                          下载
                        </button>
                      {/if}
                      {#if transfer.error}
                        <span class="transfer-error">{transfer.error}</span>
                      {/if}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </section>
          </div>
        </div>

        <div class="message-list" bind:this={messageListElement} data-testid="message-list">
          {#each messages as message (message.id)}
            <div
              class="message"
              class:own-message={message.senderId === $currentUserId && message.type !== "system"}
              class:other-message={message.senderId !== $currentUserId && message.type !== "system"}
              class:system-message={message.type === "system"}
            >
              {#if message.type === "system"}
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
              <p>还没有消息，开始聊天吧。</p>
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
              data-testid="message-input"
              on:paste={handleMessagePaste}
              on:keyup={handleKeyUp}
            />
            <button
              class="send-btn"
              data-testid="send-message"
              on:click={() => void sendMessage()}
              disabled={!messageInput.trim()}
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: "Helvetica Neue", "PingFang SC", sans-serif;
    color: #1f2937;
  }

  .room {
    display: flex;
    flex-direction: column;
    height: 100vh;
    min-height: 100vh;
    overflow: hidden;
    background: linear-gradient(180deg, #f7f7fb 0%, #eef2f7 100%);
  }

  .room-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    background: rgba(255, 255, 255, 0.92);
    border-bottom: 1px solid #dde4ee;
    backdrop-filter: blur(12px);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    min-width: 0;
  }

  .header-left h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .room-id {
    padding: 6px 12px;
    border-radius: 999px;
    background: #eef3ff;
    color: #3554c7;
    font-size: 0.9rem;
  }

  .leave-btn,
  .copy-btn,
  .confirm-btn,
  .secondary-btn,
  .send-btn,
  .download-btn {
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
  }

  .leave-btn {
    padding: 10px 18px;
    background: #e5484d;
    color: white;
  }

  .copy-btn,
  .confirm-btn,
  .send-btn {
    background: linear-gradient(135deg, #3151d3 0%, #4d7cff 100%);
    color: white;
  }

  .secondary-btn,
  .download-btn {
    padding: 10px 14px;
    background: #edf2ff;
    color: #3151d3;
  }

  button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 18px rgba(49, 81, 211, 0.12);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .connecting-status,
  .empty-messages {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: #64748b;
  }

  .connecting-status {
    padding: 56px 24px;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e5e7eb;
    border-top-color: #3151d3;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 12px;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }

    to {
      transform: rotate(360deg);
    }
  }

  .error-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 16px 24px;
    background: #fff0f1;
    color: #b42318;
  }

  .error-banner button {
    padding: 8px 14px;
    background: #b42318;
    color: white;
  }

  .room-content {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .sidebar {
    width: 300px;
    flex: 0 0 300px;
    min-height: 0;
    background: rgba(255, 255, 255, 0.9);
    border-right: 1px solid #dde4ee;
    position: relative;
    transition: width 0.24s ease;
  }

  .sidebar.collapsed {
    width: 40px;
    flex-basis: 40px;
  }

  .toggle-sidebar-btn {
    position: absolute;
    top: 10px;
    right: 8px;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: #edf2ff;
    color: #3151d3;
    cursor: pointer;
  }

  .sidebar-content {
    height: 100%;
    box-sizing: border-box;
    padding: 16px;
    overflow-y: auto;
  }

  .invite-section,
  .participants-section {
    margin-bottom: 24px;
  }

  .invite-link-container {
    display: flex;
    gap: 8px;
  }

  .invite-link-input,
  .peer-select,
  .file-input,
  .message-input,
  .name-input {
    width: 100%;
    border: 1px solid #d8dee9;
    border-radius: 10px;
    padding: 12px 14px;
    box-sizing: border-box;
    background: white;
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
    padding: 10px 12px;
    border-radius: 10px;
    background: #f8fafc;
  }

  .current-user {
    background: #eef3ff;
  }

  .participant-name {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .host-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    background: #e7f8ee;
    color: #0f7b6c;
    font-size: 0.76rem;
    font-weight: 700;
  }

  .chat-area {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .room-tools {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    max-height: clamp(300px, 44vh, 520px);
    overflow-y: auto;
    overscroll-behavior: contain;
    box-sizing: border-box;
    padding: 18px 20px;
    border-bottom: 1px solid #dde4ee;
  }

  .toolbelt {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
    gap: 16px;
  }

  .tool-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid #dde4ee;
    min-height: 0;
  }

  .tool-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .tool-card-header h3 {
    margin: 0;
    font-size: 1rem;
  }

  .status-live {
    color: #0f7b6c;
    font-weight: 600;
  }

  .tool-card-actions,
  .file-form {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .peer-select {
    min-width: 220px;
  }

  .remote-audio-list,
  .transfer-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
  }

  .remote-audio-list {
    max-height: 180px;
  }

  .transfer-list {
    max-height: 240px;
  }

  .remote-audio-item,
  .transfer-item {
    padding: 12px;
    border-radius: 12px;
    background: #f8fafc;
    border: 1px solid #e7edf5;
  }

  .remote-audio-item audio {
    width: 100%;
    margin-top: 8px;
  }

  .muted-text {
    margin: 0;
    color: #64748b;
    font-size: 0.92rem;
  }

  [data-testid="video-grid-panel"] {
    grid-column: span 2;
  }

  .local-video-preview {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: #1f2937;
    aspect-ratio: 16 / 9;
    max-height: 200px;
  }

  .local-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .video-muted-overlay,
  .screen-share-badge {
    position: absolute;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    pointer-events: none;
  }

  .video-muted-overlay {
    top: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.64);
    color: #fca5a5;
  }

  .screen-share-badge {
    top: 8px;
    right: 8px;
    background: rgba(49, 81, 211, 0.88);
    color: white;
  }

  .remote-video-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
    max-height: 360px;
    overflow-y: auto;
  }

  .remote-video-item {
    border-radius: 12px;
    overflow: hidden;
    background: #1f2937;
    aspect-ratio: 16 / 9;
    position: relative;
  }

  .remote-video-label {
    position: absolute;
    bottom: 8px;
    left: 8px;
    padding: 4px 10px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.64);
    color: white;
    font-size: 0.8rem;
    font-weight: 600;
    pointer-events: none;
    z-index: 2;
  }

  .remote-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .transfer-meta,
  .transfer-footer,
  .transfer-progress {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .transfer-meta {
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .progress-track {
    flex: 1;
    height: 8px;
    border-radius: 999px;
    background: #e5e7eb;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(135deg, #3151d3 0%, #6aa0ff 100%);
  }

  .transfer-status {
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
  }

  .transfer-status.completed {
    color: #027a48;
  }

  .transfer-status.failed {
    color: #b42318;
  }

  .transfer-status.in-progress {
    color: #3151d3;
  }

  .transfer-error {
    color: #b42318;
    font-size: 0.85rem;
  }

  .message-list {
    flex: 1;
    min-height: 160px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
  }

  .message {
    display: flex;
    flex-direction: column;
    max-width: 72%;
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
    padding: 8px 14px;
    border-radius: 999px;
    background: #e8f5e9;
    color: #166534;
  }

  .message-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
    color: #64748b;
    font-size: 0.8rem;
  }

  .message-content {
    padding: 12px 16px;
    border-radius: 16px;
    line-height: 1.45;
    word-break: break-word;
  }

  .own-message .message-content {
    background: linear-gradient(135deg, #3151d3 0%, #4d7cff 100%);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .other-message .message-content {
    background: white;
    color: #1f2937;
    border: 1px solid #e5e7eb;
    border-bottom-left-radius: 4px;
  }

  .message-input-container {
    flex: 0 0 auto;
    position: sticky;
    bottom: 0;
    z-index: 3;
    padding: 16px 20px 20px;
    border-top: 1px solid #dde4ee;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 -8px 20px rgba(15, 23, 42, 0.06);
  }

  .message-input-wrapper {
    display: flex;
    gap: 12px;
  }

  .message-input {
    flex: 1;
  }

  .send-btn {
    min-width: 120px;
    padding: 12px 18px;
  }

  .name-input-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.48);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }

  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.56);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 60;
    padding: 16px;
  }

  .dialog-card {
    width: min(460px, 92vw);
    padding: 28px;
    border-radius: 18px;
    background: white;
    box-shadow: 0 30px 70px rgba(15, 23, 42, 0.24);
  }

  .dialog-card h2,
  .dialog-card p {
    margin-top: 0;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .dialog-actions.single {
    justify-content: stretch;
  }

  .name-input-modal {
    width: min(420px, 92vw);
    padding: 28px;
    border-radius: 18px;
    background: white;
    box-shadow: 0 30px 70px rgba(15, 23, 42, 0.24);
  }

  .name-input-modal h2,
  .name-input-modal p {
    margin-top: 0;
  }

  .confirm-btn {
    width: 100%;
    padding: 12px 16px;
  }

  @media (max-width: 980px) {
    .room-content {
      flex-direction: column;
    }

    .sidebar,
    .sidebar.collapsed {
      width: 100%;
      flex: 0 0 auto;
      max-height: 220px;
    }

    .toolbelt {
      grid-template-columns: 1fr;
    }

    [data-testid="video-grid-panel"] {
      grid-column: span 1;
    }

    .remote-video-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .room-header,
    .room-tools,
    .message-input-container,
    .message-list {
      padding-left: 14px;
      padding-right: 14px;
    }

    .room-tools {
      max-height: min(300px, 34vh);
    }

    .header-left {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .header-actions {
      width: 100%;
      justify-content: space-between;
    }

    .message {
      max-width: 100%;
    }

    .message-list {
      min-height: 120px;
    }

    .message-input-wrapper,
    .tool-card-actions,
    .file-form {
      flex-direction: column;
    }

    .send-btn,
    .secondary-btn {
      width: 100%;
    }

  }
</style>
