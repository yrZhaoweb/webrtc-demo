import { WebSocketServer, WebSocket } from "ws";
import { RoomManager } from "./roomManager.js";
import { SignalingHandler } from "./signalingHandler.js";
import {
  SignalingMessage,
  RTCSessionDescriptionInit,
  RTCIceCandidateInit,
} from "./types.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

// 创建房间管理器
const roomManager = new RoomManager();

// 创建信令处理器（专门处理 WebRTC 信令）
const signalingHandler = new SignalingHandler(roomManager);

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ port: PORT });

// 存储 socket 到 userId 的映射
const socketToUserId = new Map<WebSocket, string>();

console.log(`WebSocket server started on port ${PORT}`);

wss.on("connection", (socket: WebSocket) => {
  console.log("New client connected");

  socket.on("message", (data: Buffer) => {
    try {
      const message: SignalingMessage = JSON.parse(data.toString());
      handleMessage(socket, message);
    } catch (error) {
      console.error("Error parsing message:", error);
      sendError(socket, "Invalid message format");
    }
  });

  socket.on("close", () => {
    handleDisconnect(socket);
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error);
    handleDisconnect(socket);
  });
});

/**
 * 消息路由 - 根据消息类型分发到不同的处理函数
 */
function handleMessage(socket: WebSocket, message: SignalingMessage): void {
  switch (message.type) {
    // 房间管理相关
    case "create-room":
      handleCreateRoom(socket);
      break;

    case "join-room":
      handleJoinRoom(socket, message.roomId, message.userId, message.userName);
      break;

    // WebRTC 信令相关（委托给 SignalingHandler）
    case "offer":
      signalingHandler.handleOffer(
        message.fromId,
        message.targetId,
        message.offer
      );
      break;

    case "answer":
      signalingHandler.handleAnswer(
        message.fromId,
        message.targetId,
        message.answer
      );
      break;

    case "ice-candidate":
      signalingHandler.handleIceCandidate(
        message.fromId,
        message.targetId,
        message.candidate
      );
      break;

    default:
      console.warn("Unknown message type:", (message as any).type);
  }
}

/**
 * 处理创建房间请求
 */
function handleCreateRoom(socket: WebSocket): void {
  const roomId = roomManager.createRoom();
  const response: SignalingMessage = {
    type: "room-created",
    roomId,
  };
  socket.send(JSON.stringify(response));
  console.log(`[Room] Room created: ${roomId}`);
}

/**
 * 处理加入房间请求
 */
function handleJoinRoom(
  socket: WebSocket,
  roomId: string,
  userId: string,
  userName: string
): void {
  // 检查房间是否存在
  if (!roomManager.roomExists(roomId)) {
    sendError(socket, "房间不存在");
    return;
  }

  // 获取当前房间参与者列表
  const currentParticipants = roomManager.getRoomParticipants(roomId);

  // 将用户加入房间
  const success = roomManager.joinRoom(roomId, userId, userName, socket);
  if (!success) {
    sendError(socket, "Failed to join room");
    return;
  }

  // 记录 socket 到 userId 的映射
  socketToUserId.set(socket, userId);

  // 向新用户发送当前参与者列表
  const joinedResponse: SignalingMessage = {
    type: "room-joined",
    participants: currentParticipants,
  };
  socket.send(JSON.stringify(joinedResponse));

  // 通知房间内其他用户有新用户加入
  const userJoinedMessage: SignalingMessage = {
    type: "user-joined",
    user: { id: userId, name: userName },
  };
  roomManager.broadcastToRoom(roomId, userJoinedMessage, userId);

  console.log(`[Room] User ${userName} (${userId}) joined room ${roomId}`);
}

/**
 * 处理客户端断开连接
 */
function handleDisconnect(socket: WebSocket): void {
  const userId = socketToUserId.get(socket);
  if (!userId) {
    return;
  }

  const roomId = roomManager.getRoomIdByUserId(userId);
  if (roomId) {
    // 通知房间内其他用户该用户已离开
    const userLeftMessage: SignalingMessage = {
      type: "user-left",
      userId,
    };
    roomManager.broadcastToRoom(roomId, userLeftMessage, userId);

    // 从房间中移除用户
    roomManager.leaveRoom(roomId, userId);
    console.log(`[Room] User ${userId} left room ${roomId}`);
  }

  socketToUserId.delete(socket);
}

/**
 * 发送错误消息
 */
function sendError(socket: WebSocket, message: string): void {
  const errorMessage: SignalingMessage = {
    type: "error",
    message,
  };
  socket.send(JSON.stringify(errorMessage));
}
