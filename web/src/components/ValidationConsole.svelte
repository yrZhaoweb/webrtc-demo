<script lang="ts">
  import { avesService } from "../services/avesService";
  import {
    buildValidationChecks,
    countConnectedPeers,
    countOpenDataChannels,
    formatDuration,
    getCurrentServerRoom,
    type ValidationStatus,
  } from "../lib/validationConsole";

  export let currentRoomId: string | null = null;

  const {
    participants,
    localAudioState,
    localVideoState,
    screenShareState,
    remoteAudioStreams,
    remoteVideoStreams,
    fileTransfers,
    peerStates,
    serverHealth,
    serverMetrics,
    serverRooms,
    serverDiagnosticsError,
    lastAvesError,
    diagnosticEvents,
    sdkVersions,
    fetchServerDiagnostics,
  } = avesService;

  type TabId = "overview" | "connection" | "media" | "files" | "events";

  let activeTab: TabId = "overview";
  let diagnosticsRefreshing = false;

  $: peerStateEntries = Array.from($peerStates.values());
  $: remoteAudioCount = $remoteAudioStreams.size;
  $: remoteVideoCount = $remoteVideoStreams.size;
  $: participantCount = $participants.length + 1;
  $: connectedPeerCount = countConnectedPeers(peerStateEntries);
  $: openDataChannelCount = countOpenDataChannels(peerStateEntries);
  $: activeTransferCount = $fileTransfers.filter(
    (transfer) => transfer.status === "in-progress",
  ).length;
  $: completedTransferCount = $fileTransfers.filter(
    (transfer) => transfer.status === "completed",
  ).length;
  $: failedTransferCount = $fileTransfers.filter(
    (transfer) => transfer.status === "failed",
  ).length;
  $: currentServerRoom = getCurrentServerRoom($serverRooms, currentRoomId);
  $: validationChecks = buildValidationChecks({
    serverHealth: $serverHealth,
    serverDiagnosticsError: $serverDiagnosticsError,
    currentRoomId,
    participantCount,
    serverRooms: $serverRooms,
    peerStates: peerStateEntries,
    localAudioActive: $localAudioState.active,
    localVideoActive: $localVideoState.active,
    screenShareActive: $screenShareState.active,
    remoteAudioCount,
    remoteVideoCount,
    fileTransfers: $fileTransfers,
    lastAvesError: $lastAvesError,
  });

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "overview", label: "概览" },
    { id: "connection", label: "连接" },
    { id: "media", label: "媒体" },
    { id: "files", label: "文件" },
    { id: "events", label: "事件" },
  ];

  async function refreshDiagnostics(): Promise<void> {
    diagnosticsRefreshing = true;
    try {
      await fetchServerDiagnostics();
    } finally {
      diagnosticsRefreshing = false;
    }
  }

  function formatEventTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  function statusText(status: ValidationStatus): string {
    switch (status) {
      case "pass":
        return "通过";
      case "warn":
        return "注意";
      case "fail":
        return "失败";
      case "idle":
      default:
        return "待测";
    }
  }
</script>

<section class="validation-console" data-testid="validation-console">
  <div class="console-header">
    <div>
      <span class="eyebrow">1.1.0 验证台</span>
      <h3>测试控制台</h3>
    </div>
    <button
      class="refresh-btn"
      on:click={() => void refreshDiagnostics()}
      disabled={diagnosticsRefreshing}
      data-testid="refresh-diagnostics"
    >
      {diagnosticsRefreshing ? "刷新中" : "刷新"}
    </button>
  </div>

  <div class="version-line">
    <span>aves-core {sdkVersions.core}</span>
    <span>aves-node {sdkVersions.node}</span>
    {#if $serverHealth}
      <span>{$serverHealth.storage} / {formatDuration($serverHealth.uptime)}</span>
    {:else}
      <span>{$serverDiagnosticsError || "等待服务端诊断"}</span>
    {/if}
  </div>

  <div class="check-strip" data-testid="validation-checks">
    {#each validationChecks as check (check.id)}
      <div class={`check-pill ${check.status}`} data-testid={`validation-${check.id}`}>
        <span>{check.label}</span>
        <strong>{statusText(check.status)}</strong>
      </div>
    {/each}
  </div>

  <div class="tab-row" role="tablist" aria-label="测试控制台分区">
    {#each tabs as tab}
      <button
        class:active={activeTab === tab.id}
        role="tab"
        aria-selected={activeTab === tab.id}
        on:click={() => {
          activeTab = tab.id;
        }}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === "overview"}
    <div class="summary-grid">
      {#each validationChecks as check (check.id)}
        <div class="summary-row">
          <span class={`status-dot ${check.status}`}></span>
          <div>
            <strong>{check.label}</strong>
            <span>{check.detail}</span>
          </div>
        </div>
      {/each}
    </div>
  {:else if activeTab === "connection"}
    <div class="detail-grid">
      <div class="metric-list">
        <div><span>服务端连接</span><strong>{$serverHealth?.connections ?? 0}</strong></div>
        <div><span>服务端房间</span><strong>{$serverHealth?.rooms ?? $serverRooms.length}</strong></div>
        <div><span>服务端参与者</span><strong>{$serverMetrics?.participants ?? 0}</strong></div>
        <div><span>待恢复断线</span><strong>{$serverMetrics?.pendingDisconnects ?? 0}</strong></div>
        <div><span>限流桶</span><strong>{$serverMetrics?.rateLimitBuckets ?? 0}</strong></div>
        <div><span>当前房间人数</span><strong>{currentServerRoom?.participantCount ?? participantCount}</strong></div>
        <div><span>P2P connected</span><strong>{connectedPeerCount}/{peerStateEntries.length}</strong></div>
        <div><span>DataChannel open</span><strong>{openDataChannelCount}/{peerStateEntries.length}</strong></div>
      </div>

      <div class="peer-table">
        {#if peerStateEntries.length === 0}
          <p class="empty-line">等待第二个浏览器加入后验证 P2P 和 DataChannel。</p>
        {:else}
          {#each peerStateEntries as peer (peer.peerId)}
            <div class="peer-row">
              <strong>{peer.peerName}</strong>
              <span>{peer.connectionState}</span>
              <span>{peer.dataChannelState}</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {:else if activeTab === "media"}
    <div class="metric-list compact">
      <div><span>本地音频</span><strong>{$localAudioState.active ? "active" : "off"}</strong></div>
      <div><span>本地视频</span><strong>{$localVideoState.active ? "active" : "off"}</strong></div>
      <div><span>屏幕共享</span><strong>{$screenShareState.active ? "active" : "off"}</strong></div>
      <div><span>远端音频流</span><strong>{remoteAudioCount}</strong></div>
      <div><span>远端视频流</span><strong>{remoteVideoCount}</strong></div>
    </div>
  {:else if activeTab === "files"}
    <div class="metric-list compact">
      <div><span>传输中</span><strong>{activeTransferCount}</strong></div>
      <div><span>已完成</span><strong>{completedTransferCount}</strong></div>
      <div><span>失败</span><strong>{failedTransferCount}</strong></div>
      <div><span>总记录</span><strong>{$fileTransfers.length}</strong></div>
    </div>
    <div class="file-history">
      {#if $fileTransfers.length === 0}
        <p class="empty-line">选择一个文件发送后，这里会显示传输结果。</p>
      {:else}
        {#each $fileTransfers.slice(0, 5) as transfer (transfer.transferId)}
          <div class="history-row">
            <strong>{transfer.name}</strong>
            <span>{transfer.status}</span>
            <span>{transfer.progress.toFixed(0)}%</span>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <div class="event-log" data-testid="diagnostic-events">
      {#if $lastAvesError}
        <div class="error-detail">
          <strong>{$lastAvesError.code || $lastAvesError.name}</strong>
          <span>{$lastAvesError.stage || "unknown"} / {$lastAvesError.retryable ? "retryable" : "fatal"}</span>
          <p>{$lastAvesError.message}</p>
        </div>
      {/if}

      {#if $diagnosticEvents.length === 0}
        <p class="empty-line">还没有 SDK 事件。</p>
      {:else}
        {#each $diagnosticEvents.slice(0, 10) as event (event.id)}
          <div class={`event-row ${event.level}`}>
            <span>{formatEventTime(event.timestamp)}</span>
            <strong>{event.source}</strong>
            <span>{event.message}</span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</section>

<style>
  .validation-console {
    display: flex;
    flex-direction: column;
    gap: 14px;
    grid-column: 1 / -1;
    width: 100%;
    box-sizing: border-box;
    padding: 16px;
    border: 1px solid #d7dde8;
    border-radius: 12px;
    background: #ffffff;
  }

  .console-header,
  .version-line,
  .check-strip,
  .tab-row,
  .summary-row,
  .peer-row,
  .history-row,
  .event-row,
  .metric-list div {
    display: flex;
    align-items: center;
  }

  .console-header {
    justify-content: space-between;
    gap: 12px;
  }

  .eyebrow {
    color: #64748b;
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h3 {
    margin: 2px 0 0;
    font-size: 1rem;
  }

  .refresh-btn,
  .tab-row button {
    border: 1px solid #cfd8ea;
    border-radius: 8px;
    background: #f8fafc;
    color: #1f2937;
    cursor: pointer;
    font-weight: 700;
  }

  .refresh-btn {
    padding: 8px 12px;
  }

  .refresh-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .version-line {
    gap: 10px;
    flex-wrap: wrap;
    color: #475569;
    font-size: 0.86rem;
  }

  .version-line span {
    padding: 5px 9px;
    border-radius: 999px;
    background: #f1f5f9;
  }

  .check-strip {
    gap: 8px;
    flex-wrap: wrap;
  }

  .check-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid #d8dee9;
    background: #f8fafc;
    font-size: 0.82rem;
  }

  .check-pill.pass {
    border-color: #a7f3d0;
    background: #ecfdf5;
    color: #047857;
  }

  .check-pill.warn {
    border-color: #fde68a;
    background: #fffbeb;
    color: #92400e;
  }

  .check-pill.fail {
    border-color: #fecaca;
    background: #fef2f2;
    color: #b91c1c;
  }

  .check-pill.idle {
    color: #64748b;
  }

  .tab-row {
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 2px;
  }

  .tab-row button {
    padding: 8px 12px;
  }

  .tab-row button.active {
    background: #1f2937;
    border-color: #1f2937;
    color: white;
  }

  .summary-grid,
  .detail-grid {
    display: grid;
    gap: 10px;
  }

  .summary-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .summary-row {
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
    padding: 10px 0;
    border-top: 1px solid #edf2f7;
  }

  .summary-row div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }

  .summary-row strong,
  .summary-row span,
  .event-row span:last-child {
    overflow-wrap: anywhere;
  }

  .summary-row strong {
    color: #111827;
    font-size: 0.9rem;
  }

  .summary-row span {
    color: #64748b;
    font-size: 0.82rem;
  }

  .status-dot {
    width: 9px;
    height: 9px;
    margin-top: 4px;
    border-radius: 999px;
    background: #94a3b8;
    flex: 0 0 auto;
  }

  .status-dot.pass {
    background: #10b981;
  }

  .status-dot.warn {
    background: #f59e0b;
  }

  .status-dot.fail {
    background: #ef4444;
  }

  .detail-grid {
    grid-template-columns: minmax(220px, 0.85fr) minmax(0, 1.15fr);
  }

  .metric-list {
    display: grid;
    gap: 1px;
    overflow: hidden;
    border: 1px solid #e5eaf2;
    border-radius: 10px;
  }

  .metric-list.compact {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .metric-list div {
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
    padding: 10px 12px;
    background: #f8fafc;
  }

  .metric-list span {
    color: #64748b;
    font-size: 0.84rem;
  }

  .metric-list strong {
    color: #111827;
    font-size: 0.9rem;
  }

  .peer-table,
  .file-history,
  .event-log {
    display: grid;
    gap: 8px;
  }

  .peer-row,
  .history-row,
  .event-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px 120px;
    gap: 10px;
    padding: 9px 10px;
    border-bottom: 1px solid #edf2f7;
    font-size: 0.86rem;
  }

  .history-row {
    grid-template-columns: minmax(0, 1fr) 100px 70px;
  }

  .event-row {
    grid-template-columns: 86px 96px minmax(0, 1fr);
    border-left: 3px solid #94a3b8;
    border-bottom: 0;
    background: #f8fafc;
  }

  .event-row.info {
    border-left-color: #2563eb;
  }

  .event-row.warn {
    border-left-color: #f59e0b;
  }

  .event-row.error {
    border-left-color: #ef4444;
  }

  .error-detail {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid #fed7aa;
    border-radius: 10px;
    background: #fff7ed;
    color: #9a3412;
  }

  .error-detail p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .empty-line {
    margin: 0;
    color: #64748b;
    font-size: 0.9rem;
  }

  @media (max-width: 1180px) {
    .summary-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .metric-list.compact {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .summary-grid,
    .detail-grid,
    .metric-list.compact,
    .peer-row,
    .history-row,
    .event-row {
      grid-template-columns: 1fr;
    }
  }
</style>
