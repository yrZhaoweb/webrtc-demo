<script setup lang="ts">
import { ref, onMounted } from "vue";

const globalError = ref<string | null>(null);
const showError = ref(false);
const isOnline = ref(navigator.onLine);

function handleGlobalError(error: Error): void {
  console.error("Global error:", error);
  globalError.value = error.message || "发生未知错误";
  showError.value = true;
  setTimeout(() => {
    showError.value = false;
  }, 5000);
}

function closeError(): void {
  showError.value = false;
  globalError.value = null;
}

function handleOnline(): void {
  isOnline.value = true;
}

function handleOffline(): void {
  isOnline.value = false;
  globalError.value = "网络连接已断开";
  showError.value = true;
}

onMounted(() => {
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  window.addEventListener("unhandledrejection", (event) => {
    handleGlobalError(
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason))
    );
    event.preventDefault();
  });
});
</script>

<template>
  <div class="app-container">
    <transition name="slide-down">
      <div v-if="showError" class="global-error-banner">
        <div class="error-content">
          <span class="error-icon">⚠️</span>
          <span class="error-message">{{ globalError }}</span>
          <button class="close-error-btn" @click="closeError">✕</button>
        </div>
      </div>
    </transition>

    <transition name="slide-down">
      <div v-if="!isOnline" class="network-status-banner">
        <span class="status-icon">📡</span>
        <span>网络连接已断开</span>
      </div>
    </transition>

    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<style scoped>
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

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
