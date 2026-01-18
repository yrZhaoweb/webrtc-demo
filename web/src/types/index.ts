/**
 * 聊天消息类型
 */
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type?: "user" | "system";
}

/**
 * 房间信息类型
 */
export interface RoomInfo {
  roomId: string;
  participants: Participant[];
}

/**
 * 参与者类型
 */
export interface Participant {
  id: string;
  name: string;
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
      targetId: string;
      fromId: string;
      offer: RTCSessionDescriptionInit;
    }
  | {
      type: "answer";
      targetId: string;
      fromId: string;
      answer: RTCSessionDescriptionInit;
    }
  | {
      type: "ice-candidate";
      targetId: string;
      fromId: string;
      candidate: RTCIceCandidateInit;
    }
  | { type: "error"; message: string };
