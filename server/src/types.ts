import { WebSocket } from "ws";

/**
 * WebRTC 类型定义（服务端不需要完整实现，仅用于类型检查）
 */
export interface RTCSessionDescriptionInit {
  type: "offer" | "answer";
  sdp: string;
}

export interface RTCIceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

/**
 * 参与者信息
 */
export interface Participant {
  id: string;
  name: string;
}

/**
 * 房间信息
 */
export interface Room {
  id: string;
  participants: Map<
    string,
    {
      userId: string;
      userName: string;
      socket: WebSocket;
    }
  >;
  createdAt: number;
}

/**
 * 信令消息类型
 */
export type SignalingMessage =
  | { type: "create-room" }
  | { type: "room-created"; roomId: string }
  | { type: "join-room"; roomId: string; userId: string; userName: string }
  | { type: "room-joined"; participants: Participant[] }
  | { type: "user-joined"; user: Participant }
  | { type: "user-left"; userId: string }
  | {
      type: "offer";
      fromId: string;
      targetId: string;
      offer: RTCSessionDescriptionInit;
    }
  | {
      type: "answer";
      fromId: string;
      targetId: string;
      answer: RTCSessionDescriptionInit;
    }
  | {
      type: "ice-candidate";
      fromId: string;
      targetId: string;
      candidate: RTCIceCandidateInit;
    }
  | { type: "error"; message: string };
