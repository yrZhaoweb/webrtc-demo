import { SignalingService } from "./signalingService";
import { WebRTCManager } from "./webrtcManager";

export class WebRTCConnectionManager {
  private signalingService: SignalingService;
  private webrtcManager: WebRTCManager;
  private currentUserId: string = "";

  constructor(
    signalingService: SignalingService,
    webrtcManager: WebRTCManager
  ) {
    this.signalingService = signalingService;
    this.webrtcManager = webrtcManager;
  }

  initialize(userId: string): void {
    this.currentUserId = userId;
    this.setupSignalingHandlers();
  }

  private setupSignalingHandlers(): void {
    this.signalingService.onOffer(async (fromId, offer) => {
      await this.handleOffer(fromId, offer);
    });

    this.signalingService.onAnswer(async (fromId, answer) => {
      await this.handleAnswer(fromId, answer);
    });

    this.signalingService.onIceCandidate(async (fromId, candidate) => {
      await this.handleIceCandidate(fromId, candidate);
    });
  }

  private async handleOffer(
    fromId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<void> {
    try {
      console.log(`[WebRTC] Received offer from ${fromId}`);
      this.webrtcManager.createPeerConnection(fromId);
      this.setupIceCandidateHandler(fromId);
      const answer = await this.webrtcManager.createAnswer(fromId, offer);
      this.signalingService.sendAnswer(fromId, this.currentUserId, answer);
      console.log(`[WebRTC] Sent answer to ${fromId}`);
    } catch (error) {
      console.error(`[WebRTC] Error handling offer from ${fromId}:`, error);
      throw error;
    }
  }

  private async handleAnswer(
    fromId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    try {
      console.log(`[WebRTC] Received answer from ${fromId}`);
      await this.webrtcManager.setRemoteAnswer(fromId, answer);
      console.log(`[WebRTC] Connection with ${fromId} established`);
    } catch (error) {
      console.error(`[WebRTC] Error handling answer from ${fromId}:`, error);
      throw error;
    }
  }

  private async handleIceCandidate(
    fromId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    try {
      console.log(`[WebRTC] Received ICE candidate from ${fromId}`);
      await this.webrtcManager.addIceCandidate(fromId, candidate);
    } catch (error) {
      console.error(
        `[WebRTC] Error handling ICE candidate from ${fromId}:`,
        error
      );
    }
  }

  private setupIceCandidateHandler(peerId: string): void {
    this.webrtcManager.onIceCandidate(peerId, (candidate) => {
      this.signalingService.sendIceCandidate(
        peerId,
        this.currentUserId,
        candidate
      );
    });
  }

  async connectToPeer(peerId: string): Promise<void> {
    try {
      console.log(`[WebRTC] Initiating connection to ${peerId}`);
      this.webrtcManager.createPeerConnection(peerId);
      this.setupIceCandidateHandler(peerId);
      const offer = await this.webrtcManager.createOffer(peerId);
      this.signalingService.sendOffer(peerId, this.currentUserId, offer);
      console.log(`[WebRTC] Sent offer to ${peerId}`);
    } catch (error) {
      console.error(`[WebRTC] Error connecting to ${peerId}:`, error);
      throw error;
    }
  }

  disconnectFromPeer(peerId: string): void {
    console.log(`[WebRTC] Disconnecting from ${peerId}`);
    this.webrtcManager.closePeerConnection(peerId);
  }

  disconnectAll(): void {
    console.log("[WebRTC] Disconnecting all peers");
    this.webrtcManager.closeAll();
  }

  getWebRTCManager(): WebRTCManager {
    return this.webrtcManager;
  }
}
