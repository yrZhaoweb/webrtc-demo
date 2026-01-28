<script lang="ts">
  import { onMount } from 'svelte';
  import { Router, Route } from 'svelte-routing';
  import { slide } from 'svelte/transition';
  import { errorStore, networkStore } from './lib/stores';
  import Home from './routes/Home.svelte';
  import Room from './routes/Room.svelte';

  function handleGlobalError(error: Error): void {
    console.error('Global error:', error);
    errorStore.showError(error.message || '发生未知错误');
  }

  function closeError(): void {
    errorStore.hideError();
  }

  function handleOnline(): void {
    networkStore.setOnline();
  }

  function handleOffline(): void {
    networkStore.setOffline();
    errorStore.showError('网络连接已断开');
  }

  onMount(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    window.addEventListener('unhandledrejection', (event) => {
      handleGlobalError(
        event.reason instanceof Error ? event.reason : new Error(String(event.reason))
      );
      event.preventDefault();
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  });
</script>

<div class="app-container">
  {#if $errorStore.show}
    <div class="global-error-banner" transition:slide={{ duration: 300 }}>
      <div class="error-content">
        <span class="error-icon">⚠️</span>
        <span class="error-message">{$errorStore.message}</span>
        <button class="close-error-btn" on:click={closeError}>✕</button>
      </div>
    </div>
  {/if}

  {#if !$networkStore.isOnline}
    <div class="network-status-banner" transition:slide={{ duration: 300 }}>
      <span class="status-icon">📡</span>
      <span>网络连接已断开</span>
    </div>
  {/if}

  <Router>
    <Route path="/" component={Home} />
    <Route path="/room/:roomId" let:params>
      <Room roomId={params.roomId} />
    </Route>
  </Router>
</div>

<style>
  .app-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .global-error-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #f44336;
    color: white;
    padding: 16px 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 9999;
  }

  .error-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 1200px;
    margin: 0 auto;
    gap: 12px;
  }

  .error-icon {
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .error-message {
    flex: 1;
    font-weight: 500;
  }

  .close-error-btn {
    background: transparent;
    border: none;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s ease;
    flex-shrink: 0;
  }

  .close-error-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .network-status-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #ff9800;
    color: white;
    padding: 12px 24px;
    text-align: center;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 9998;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .status-icon {
    font-size: 1.2rem;
  }
</style>
