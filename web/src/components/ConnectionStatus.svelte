<script lang="ts">
  import { avesService, type ConnectionState, type PeerConnectionState } from '../services/avesService';
  import { slide } from 'svelte/transition';

  const { connectionState, peerStates } = avesService;

  let showDetails = false;

  function toggleDetails() {
    showDetails = !showDetails;
  }

  function getStateColor(state: ConnectionState): string {
    switch (state) {
      case 'connected':
        return '#4caf50';
      case 'connecting':
      case 'reconnecting':
        return '#ff9800';
      case 'failed':
        return '#f44336';
      case 'disconnected':
      default:
        return '#9e9e9e';
    }
  }

  function getStateIcon(state: ConnectionState): string {
    switch (state) {
      case 'connected':
        return '✓';
      case 'connecting':
      case 'reconnecting':
        return '⟳';
      case 'failed':
        return '✗';
      case 'disconnected':
      default:
        return '○';
    }
  }

  function getStateText(state: ConnectionState): string {
    switch (state) {
      case 'connected':
        return '已连接';
      case 'connecting':
        return '连接中';
      case 'reconnecting':
        return '重连中';
      case 'failed':
        return '连接失败';
      case 'disconnected':
      default:
        return '未连接';
    }
  }

  function getPeerStateColor(state: RTCPeerConnectionState): string {
    switch (state) {
      case 'connected':
        return '#4caf50';
      case 'connecting':
      case 'new':
        return '#2196f3';
      case 'failed':
        return '#f44336';
      case 'disconnected':
        return '#ff9800';
      case 'closed':
      default:
        return '#9e9e9e';
    }
  }

  function getDataChannelStateColor(state: RTCDataChannelState | 'closed'): string {
    switch (state) {
      case 'open':
        return '#4caf50';
      case 'connecting':
        return '#2196f3';
      case 'closing':
        return '#ff9800';
      case 'closed':
      default:
        return '#9e9e9e';
    }
  }
</script>

<div class="connection-status">
  <button class="status-button" on:click={toggleDetails} style="--state-color: {getStateColor($connectionState)}">
    <span class="status-icon">{getStateIcon($connectionState)}</span>
    <span class="status-text">{getStateText($connectionState)}</span>
    <span class="expand-icon">{showDetails ? '▼' : '▶'}</span>
  </button>

  {#if showDetails}
    <div class="status-details" transition:slide={{ duration: 200 }}>
      <div class="details-header">
        <h4>连接详情</h4>
      </div>

      <div class="signaling-status">
        <div class="status-row">
          <span class="label">信令服务器:</span>
          <span class="value" style="color: {getStateColor($connectionState)}">
            {getStateText($connectionState)}
          </span>
        </div>
      </div>

      {#if $peerStates.size > 0}
        <div class="peer-connections">
          <h5>对等连接 ({$peerStates.size})</h5>
          {#each Array.from($peerStates.values()) as peer (peer.peerId)}
            <div class="peer-item">
              <div class="peer-name">{peer.peerName}</div>
              <div class="peer-states">
                <div class="peer-state">
                  <span class="state-label">连接:</span>
                  <span 
                    class="state-badge" 
                    style="background-color: {getPeerStateColor(peer.connectionState)}"
                  >
                    {peer.connectionState}
                  </span>
                </div>
                <div class="peer-state">
                  <span class="state-label">数据通道:</span>
                  <span 
                    class="state-badge" 
                    style="background-color: {getDataChannelStateColor(peer.dataChannelState)}"
                  >
                    {peer.dataChannelState}
                  </span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else if $connectionState === 'connected'}
        <div class="no-peers">
          <p>暂无对等连接</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .connection-status {
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 1000;
    max-width: 350px;
  }

  .status-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: white;
    border: 2px solid var(--state-color);
    border-radius: 24px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.3s ease;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .status-button:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    transform: translateY(-1px);
  }

  .status-icon {
    font-size: 1.2rem;
    color: var(--state-color);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  .status-text {
    color: #333;
  }

  .expand-icon {
    font-size: 0.8rem;
    color: #666;
    margin-left: 4px;
  }

  .status-details {
    margin-top: 8px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    overflow: hidden;
  }

  .details-header {
    padding: 12px 16px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
  }

  .details-header h4 {
    margin: 0;
    font-size: 0.95rem;
    color: #333;
  }

  .signaling-status {
    padding: 12px 16px;
    border-bottom: 1px solid #e0e0e0;
  }

  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
  }

  .label {
    color: #666;
    font-weight: 500;
  }

  .value {
    font-weight: 600;
  }

  .peer-connections {
    padding: 12px 16px;
  }

  .peer-connections h5 {
    margin: 0 0 12px 0;
    font-size: 0.85rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .peer-item {
    padding: 10px;
    background: #f9f9f9;
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .peer-item:last-child {
    margin-bottom: 0;
  }

  .peer-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #333;
    margin-bottom: 8px;
  }

  .peer-states {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .peer-state {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
  }

  .state-label {
    color: #666;
  }

  .state-badge {
    padding: 2px 8px;
    border-radius: 12px;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .no-peers {
    padding: 20px 16px;
    text-align: center;
  }

  .no-peers p {
    margin: 0;
    color: #999;
    font-size: 0.85rem;
  }

  @media (max-width: 768px) {
    .connection-status {
      top: 70px;
      right: 10px;
      max-width: 300px;
    }

    .status-button {
      padding: 8px 12px;
      font-size: 0.85rem;
    }
  }
</style>
