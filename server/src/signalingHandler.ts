import { WebSocket } from "ws";
import { RoomManager } from "./roomManager.js";
import {
  SignalingMessage,
  RTCSessionDescriptionInit,
  RTCIceCandidateInit,
} from "./types.js";

/**
 * 信令处理器
 * 专门负责 WebRTC 信令消息的转发，与房间管理逻辑解耦
 */
export class SignalingHandler {
  private roomManager: RoomManager;

  constructor(roomManager: RoomManager) {
    this.roomManager = roomManager;
  }

  /**
   * 处理 SDP Offer
   * 将 Offer 从发起方转发给目标方
   */
  handleOffer(
    fromId: string,
    targetId: string,
    offer: RTCSessionDescriptionInit
  ): void {
    console.log(`[Signaling] Forwarding offer: ${fromId} -> ${targetId}`);

    const message: SignalingMessage = {
      type: "offer",
      fromId,
      targetId,
      offer,
    };

    this.roomManager.sendToUser(targetId, message);
  }

  /**
   * 处理 SDP Answer
   * 将 Answer 从接收方转发给发起方
   */
  handleAnswer(
    fromId: string,
    targetId: string,
    answer: RTCSessionDescriptionInit
  ): void {
    console.log(`[Signaling] Forwarding answer: ${fromId} -> ${targetId}`);

    const message: SignalingMessage = {
      type: "answer",
      fromId,
      targetId,
      answer,
    };

    this.roomManager.sendToUser(targetId, message);
  }

  /**
   * 处理 ICE Candidate
   * 将 ICE 候选从一方转发给另一方
   */
  handleIceCandidate(
    fromId: string,
    targetId: string,
    candidate: RTCIceCandidateInit
  ): void {
    console.log(
      `[Signaling] Forwarding ICE candidate: ${fromId} -> ${targetId}`
    );

    const message: SignalingMessage = {
      type: "ice-candidate",
      fromId,
      targetId,
      candidate,
    };

    this.roomManager.sendToUser(targetId, message);
  }

  /**
   * 验证信令消息
   * 确保消息包含必要的字段
   */
  validateSignalingMessage(message: SignalingMessage): boolean {
    switch (message.type) {
      case "offer":
        return !!(message.fromId && message.targetId && message.offer);
      case "answer":
        return !!(message.fromId && message.targetId && message.answer);
      case "ice-candidate":
        return !!(message.fromId && message.targetId && message.candidate);
      default:
        return false;
    }
  }
}
