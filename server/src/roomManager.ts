import { v4 as uuidv4 } from "uuid";
import { WebSocket } from "ws";
import { Room, Participant, SignalingMessage } from "./types.js";

/**
 * 房间管理器
 * 负责房间的创建、加入、离开和消息广播
 */
export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private userToRoom: Map<string, string> = new Map();

  /**
   * 创建新房间
   * @returns 房间 ID
   */
  createRoom(): string {
    const roomId = uuidv4();
    const room: Room = {
      id: roomId,
      participants: new Map(),
      createdAt: Date.now(),
    };
    this.rooms.set(roomId, room);
    return roomId;
  }

  /**
   * 用户加入房间
   * @param roomId 房间 ID
   * @param userId 用户 ID
   * @param userName 用户名
   * @param socket WebSocket 连接
   * @returns 是否成功加入
   */
  joinRoom(
    roomId: string,
    userId: string,
    userName: string,
    socket: WebSocket
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    room.participants.set(userId, {
      userId,
      userName,
      socket,
    });
    this.userToRoom.set(userId, roomId);
    return true;
  }

  /**
   * 用户离开房间
   * @param roomId 房间 ID
   * @param userId 用户 ID
   */
  leaveRoom(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.participants.delete(userId);
    this.userToRoom.delete(userId);

    // 如果房间为空，删除房间
    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  /**
   * 获取房间参与者列表
   * @param roomId 房间 ID
   * @returns 参与者列表
   */
  getRoomParticipants(roomId: string): Participant[] {
    const room = this.rooms.get(roomId);
    if (!room) {
      return [];
    }

    return Array.from(room.participants.values()).map((p) => ({
      id: p.userId,
      name: p.userName,
    }));
  }

  /**
   * 检查房间是否存在
   * @param roomId 房间 ID
   * @returns 房间是否存在
   */
  roomExists(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * 向房间内所有用户广播消息
   * @param roomId 房间 ID
   * @param message 信令消息
   * @param excludeUserId 排除的用户 ID（可选）
   */
  broadcastToRoom(
    roomId: string,
    message: SignalingMessage,
    excludeUserId?: string
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const messageStr = JSON.stringify(message);
    for (const [userId, participant] of room.participants) {
      if (
        userId !== excludeUserId &&
        participant.socket.readyState === WebSocket.OPEN
      ) {
        participant.socket.send(messageStr);
      }
    }
  }

  /**
   * 向指定用户发送消息
   * @param userId 用户 ID
   * @param message 信令消息
   */
  sendToUser(userId: string, message: SignalingMessage): void {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) {
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const participant = room.participants.get(userId);
    if (participant && participant.socket.readyState === WebSocket.OPEN) {
      participant.socket.send(JSON.stringify(message));
    }
  }

  /**
   * 根据用户 ID 获取房间 ID
   * @param userId 用户 ID
   * @returns 房间 ID 或 undefined
   */
  getRoomIdByUserId(userId: string): string | undefined {
    return this.userToRoom.get(userId);
  }
}
