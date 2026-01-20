<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useRoom } from "../composables/useRoom";
import { generateUserId } from "../utils";

const router = useRouter();
const SIGNALING_SERVER_URL = "ws://localhost:8080";

const room = useRoom(SIGNALING_SERVER_URL);
const userName = ref("");
const showNameInput = ref(false);

function handleCreateRoomClick() {
  showNameInput.value = true;
}

async function handleCreateRoom() {
  if (!userName.value.trim()) return;

  try {
    const userId = generateUserId();
    const name = userName.value.trim();
    const roomId = await room.createRoom(userId, name);

    router.push({
      name: "room",
      params: { roomId },
      query: { userName: name, userId },
    });
  } catch (err) {
    console.error("Failed to create room:", err);
  }
}

function cancelNameInput() {
  showNameInput.value = false;
  userName.value = "";
  room.error.value = null;
}
</script>

<template>
  <div class="home">
    <div class="home-content">
      <h1>WebRTC 聊天室</h1>
      <p class="subtitle">基于 WebRTC 的实时点对点文本聊天</p>

      <div v-if="!showNameInput" class="action-section">
        <button
          class="create-room-btn"
          @click="handleCreateRoomClick"
          :disabled="room.isConnecting.value"
        >
          创建房间
        </button>
      </div>

      <div v-else class="name-input-section">
        <h2>输入您的名字</h2>
        <input
          v-model="userName"
          type="text"
          placeholder="请输入您的名字"
          class="name-input"
          @keyup.enter="handleCreateRoom"
          autofocus
        />
        <div class="button-group">
          <button
            class="confirm-btn"
            @click="handleCreateRoom"
            :disabled="!userName.trim() || room.isConnecting.value"
          >
            {{ room.isConnecting.value ? "创建中..." : "确认创建" }}
          </button>
          <button
            class="cancel-btn"
            @click="cancelNameInput"
            :disabled="room.isConnecting.value"
          >
            取消
          </button>
        </div>
      </div>

      <div v-if="room.error.value" class="error-message">
        {{ room.error.value }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.home-content {
  background: white;
  border-radius: 16px;
  padding: 48px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 500px;
  width: 100%;
  text-align: center;
}

h1 {
  font-size: 2.5rem;
  color: #333;
  margin-bottom: 12px;
  font-weight: 700;
}

.subtitle {
  color: #666;
  font-size: 1rem;
  margin-bottom: 40px;
}

.action-section {
  margin-top: 32px;
}

.create-room-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 16px 48px;
  font-size: 1.1rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.create-room-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.create-room-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.name-input-section {
  margin-top: 32px;
}

.name-input-section h2 {
  font-size: 1.5rem;
  color: #333;
  margin-bottom: 20px;
}

.name-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 20px;
  transition: border-color 0.3s ease;
}

.name-input:focus {
  outline: none;
  border-color: #667eea;
}

.button-group {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.confirm-btn,
.cancel-btn {
  padding: 12px 32px;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
}

.confirm-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.confirm-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.confirm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancel-btn {
  background: #f5f5f5;
  color: #666;
}

.cancel-btn:hover:not(:disabled) {
  background: #e0e0e0;
}

.cancel-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  margin-top: 20px;
  padding: 12px;
  background: #fee;
  color: #c33;
  border-radius: 8px;
  font-size: 0.9rem;
}
</style>
