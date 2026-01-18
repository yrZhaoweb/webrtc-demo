import type { ChatMessage } from "../types";

/**
 * WebRTCManager - 管理 WebRTC 连接和 DataChannel
 */
export class WebRTCManager {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private messageCallbacks: Set<
    (peerId: string, message: ChatMessage) => void
  > = new Set();
  private iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  /**
   * 创建 PeerConnection
   */
  createPeerConnection(peerId: string): RTCPeerConnection {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId)!;
    }

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    this.peerConnections.set(peerId, pc);

    // 监听连接状态变化
    pc.onconnectionstatechange = () => {
      console.log(`Peer ${peerId} connection state: ${pc.connectionState}`);
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected"
      ) {
        this.closePeerConnection(peerId);
      }
    };

    return pc;
  }

  /**
   * 创建 offer
   */
  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      throw new Error(`No peer connection found for ${peerId}`);
    }

    // 创建 DataChannel (offer 方创建)
    const dataChannel = pc.createDataChannel("chat");
    this.setupDataChannel(peerId, dataChannel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return offer;
  }

  /**
   * 创建 answer
   */
  async createAnswer(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      throw new Error(`No peer connection found for ${peerId}`);
    }

    // 监听 DataChannel (answer 方接收)
    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    return answer;
  }

  /**
   * 设置远端 answer
   */
  async setRemoteAnswer(
    peerId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      throw new Error(`No peer connection found for ${peerId}`);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /**
   * 添加 ICE candidate
   */
  async addIceCandidate(
    peerId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      throw new Error(`No peer connection found for ${peerId}`);
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error(`Error adding ICE candidate for ${peerId}:`, error);
    }
  }

  /**
   * 设置 ICE candidate 处理器
   */
  onIceCandidate(
    peerId: string,
    callback: (candidate: RTCIceCandidateInit) => void
  ): void {
    const pc = this.peerConnections.get(peerId);
    if (!pc) {
      throw new Error(`No peer connection found for ${peerId}`);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        callback(event.candidate.toJSON());
      }
    };
  }

  /**
   * 设置 DataChannel
   */
  private setupDataChannel(peerId: string, dataChannel: RTCDataChannel): void {
    this.dataChannels.set(peerId, dataChannel);

    dataChannel.onopen = () => {
      console.log(`DataChannel opened with ${peerId}`);
    };

    dataChannel.onclose = () => {
      console.log(`DataChannel closed with ${peerId}`);
      this.dataChannels.delete(peerId);
    };

    dataChannel.onerror = (error) => {
      console.error(`DataChannel error with ${peerId}:`, error);
    };

    dataChannel.onmessage = (event) => {
      try {
        const message: ChatMessage = JSON.parse(event.data);
        this.messageCallbacks.forEach((callback) => callback(peerId, message));
      } catch (error) {
        console.error("Failed to parse message:", error);
      }
    };
  }

  /**
   * 发送消息到指定 peer
   */
  sendMessageToPeer(peerId: string, message: ChatMessage): void {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel && dataChannel.readyState === "open") {
      dataChannel.send(JSON.stringify(message));
    } else {
      console.error(`DataChannel not ready for ${peerId}`);
      throw new Error(`DataChannel not ready for ${peerId}`);
    }
  }

  /**
   * 发送消息到所有已连接的 peer
   */
  sendMessage(message: ChatMessage): void {
    const errors: string[] = [];
    this.dataChannels.forEach((dataChannel, peerId) => {
      if (dataChannel.readyState === "open") {
        try {
          dataChannel.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Failed to send message to ${peerId}:`, error);
          errors.push(peerId);
        }
      }
    });

    if (errors.length > 0) {
      throw new Error(`Failed to send message to peers: ${errors.join(", ")}`);
    }
  }

  /**
   * 监听消息
   */
  onMessage(callback: (peerId: string, message: ChatMessage) => void): void {
    this.messageCallbacks.add(callback);
  }

  /**
   * 移除消息监听器
   */
  offMessage(callback: (peerId: string, message: ChatMessage) => void): void {
    this.messageCallbacks.delete(callback);
  }

  /**
   * 关闭与指定 peer 的连接
   */
  closePeerConnection(peerId: string): void {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel) {
      dataChannel.close();
      this.dataChannels.delete(peerId);
    }

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    console.log(`Closed connection with ${peerId}`);
  }

  /**
   * 关闭所有连接
   */
  closeAll(): void {
    this.dataChannels.forEach((dataChannel) => {
      dataChannel.close();
    });
    this.dataChannels.clear();

    this.peerConnections.forEach((pc) => {
      pc.close();
    });
    this.peerConnections.clear();

    this.messageCallbacks.clear();

    console.log("Closed all connections");
  }

  /**
   * 获取所有活跃的 peer ID
   */
  getActivePeers(): string[] {
    return Array.from(this.peerConnections.keys());
  }

  /**
   * 检查与指定 peer 的连接状态
   */
  isConnected(peerId: string): boolean {
    const pc = this.peerConnections.get(peerId);
    return pc?.connectionState === "connected";
  }

  /**
   * 检查与指定 peer 的 DataChannel 是否就绪
   */
  isDataChannelReady(peerId: string): boolean {
    const dataChannel = this.dataChannels.get(peerId);
    return dataChannel?.readyState === "open";
  }
}
