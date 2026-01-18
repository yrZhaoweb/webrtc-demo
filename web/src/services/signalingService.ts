import type { SignalingMessage, Participant } from "../types";

/**
 * SignalingService - 管理 WebSocket 连接和信令消息交换
 */
export class SignalingService {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  /**
   * 连接到信令服务器
   */
  async connect(serverUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
          console.log("WebSocket connected");
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          reject(new Error("WebSocket connection failed"));
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
          console.log("WebSocket closed");
          this.handleReconnect(serverUrl);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理重连逻辑
   */
  private handleReconnect(serverUrl: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );
      setTimeout(() => {
        this.connect(serverUrl).catch((error) => {
          console.error("Reconnection failed:", error);
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: string): void {
    try {
      const message: SignalingMessage = JSON.parse(data);
      const handlers = this.messageHandlers.get(message.type);
      if (handlers) {
        handlers.forEach((handler) => handler(message));
      }
    } catch (error) {
      console.error("Failed to parse message:", error);
    }
  }

  /**
   * 发送消息到服务器
   */
  private send(message: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error("WebSocket is not connected");
      throw new Error("WebSocket is not connected");
    }
  }

  /**
   * 注册消息处理器
   */
  private on(type: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
  }

  /**
   * 移除消息处理器
   */
  private off(type: string, handler: (data: any) => void): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * 创建房间
   */
  async createRoom(): Promise<string> {
    return new Promise((resolve, reject) => {
      const handler = (message: SignalingMessage) => {
        if (message.type === "room-created") {
          this.off("room-created", handler);
          this.off("error", errorHandler);
          resolve(message.roomId);
        }
      };

      const errorHandler = (message: SignalingMessage) => {
        if (message.type === "error") {
          this.off("room-created", handler);
          this.off("error", errorHandler);
          reject(new Error(message.message));
        }
      };

      this.on("room-created", handler);
      this.on("error", errorHandler);

      this.send({ type: "create-room" });
    });
  }

  async joinRoom(
    roomId: string,
    userId: string,
    userName: string
  ): Promise<Participant[]> {
    return new Promise((resolve, reject) => {
      const handler = (message: SignalingMessage) => {
        if (message.type === "room-joined") {
          this.off("room-joined", handler);
          this.off("error", errorHandler);
          resolve(message.participants);
        }
      };

      const errorHandler = (message: SignalingMessage) => {
        if (message.type === "error") {
          this.off("room-joined", handler);
          this.off("error", errorHandler);
          reject(new Error(message.message));
        }
      };

      this.on("room-joined", handler);
      this.on("error", errorHandler);

      this.send({ type: "join-room", roomId, userId, userName });
    });
  }

  /**
   * 发送 SDP offer
   */
  sendOffer(
    targetId: string,
    fromId: string,
    offer: RTCSessionDescriptionInit
  ): void {
    this.send({ type: "offer", targetId, fromId, offer });
  }

  /**
   * 发送 SDP answer
   */
  sendAnswer(
    targetId: string,
    fromId: string,
    answer: RTCSessionDescriptionInit
  ): void {
    this.send({ type: "answer", targetId, fromId, answer });
  }

  /**
   * 发送 ICE candidate
   */
  sendIceCandidate(
    targetId: string,
    fromId: string,
    candidate: RTCIceCandidateInit
  ): void {
    this.send({ type: "ice-candidate", targetId, fromId, candidate });
  }

  /**
   * 监听用户加入事件
   */
  onUserJoined(callback: (user: Participant) => void): void {
    this.on("user-joined", (message: SignalingMessage) => {
      if (message.type === "user-joined") {
        callback(message.user);
      }
    });
  }

  /**
   * 监听用户离开事件
   */
  onUserLeft(callback: (userId: string) => void): void {
    this.on("user-left", (message: SignalingMessage) => {
      if (message.type === "user-left") {
        callback(message.userId);
      }
    });
  }

  /**
   * 监听 offer 消息
   */
  onOffer(
    callback: (fromId: string, offer: RTCSessionDescriptionInit) => void
  ): void {
    this.on("offer", (message: SignalingMessage) => {
      if (message.type === "offer") {
        callback(message.fromId, message.offer);
      }
    });
  }

  /**
   * 监听 answer 消息
   */
  onAnswer(
    callback: (fromId: string, answer: RTCSessionDescriptionInit) => void
  ): void {
    this.on("answer", (message: SignalingMessage) => {
      if (message.type === "answer") {
        callback(message.fromId, message.answer);
      }
    });
  }

  /**
   * 监听 ICE candidate 消息
   */
  onIceCandidate(
    callback: (fromId: string, candidate: RTCIceCandidateInit) => void
  ): void {
    this.on("ice-candidate", (message: SignalingMessage) => {
      if (message.type === "ice-candidate") {
        callback(message.fromId, message.candidate);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
    this.reconnectAttempts = 0;
  }
}
