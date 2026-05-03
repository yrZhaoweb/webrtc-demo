import type {
  DemoAvesError,
  DemoFileTransfer,
  DemoServerHealth,
  DemoServerRoom,
  PeerConnectionState,
} from "../services/avesService";

export type ValidationStatus = "pass" | "warn" | "fail" | "idle";
export type ValidationCheckId =
  | "server"
  | "room"
  | "peer"
  | "data-channel"
  | "media"
  | "file"
  | "error";

export interface ValidationCheck {
  id: ValidationCheckId;
  label: string;
  status: ValidationStatus;
  detail: string;
}

export interface ValidationConsoleInput {
  serverHealth: DemoServerHealth | null;
  serverDiagnosticsError: string | null;
  currentRoomId: string | null;
  participantCount: number;
  serverRooms: DemoServerRoom[];
  peerStates: PeerConnectionState[];
  localAudioActive: boolean;
  localVideoActive: boolean;
  screenShareActive: boolean;
  remoteAudioCount: number;
  remoteVideoCount: number;
  fileTransfers: DemoFileTransfer[];
  lastAvesError: DemoAvesError | null;
}

export function getCurrentServerRoom(
  rooms: DemoServerRoom[],
  currentRoomId: string | null,
): DemoServerRoom | undefined {
  if (!currentRoomId) {
    return undefined;
  }

  return rooms.find((room) => room.id === currentRoomId);
}

export function countConnectedPeers(peerStates: PeerConnectionState[]): number {
  return peerStates.filter((peer) => peer.connectionState === "connected").length;
}

export function countOpenDataChannels(
  peerStates: PeerConnectionState[],
): number {
  return peerStates.filter((peer) => peer.dataChannelState === "open").length;
}

export function formatDuration(milliseconds: number | undefined): string {
  if (!milliseconds || milliseconds < 1000) {
    return `${milliseconds ?? 0} ms`;
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export function buildValidationChecks(
  input: ValidationConsoleInput,
): ValidationCheck[] {
  const connectedPeers = countConnectedPeers(input.peerStates);
  const openDataChannels = countOpenDataChannels(input.peerStates);
  const currentServerRoom = getCurrentServerRoom(
    input.serverRooms,
    input.currentRoomId,
  );
  const activeMediaCount = [
    input.localAudioActive,
    input.localVideoActive,
    input.screenShareActive,
    input.remoteAudioCount > 0,
    input.remoteVideoCount > 0,
  ].filter(Boolean).length;
  const failedTransfers = input.fileTransfers.filter(
    (transfer) => transfer.status === "failed",
  ).length;
  const activeTransfers = input.fileTransfers.filter(
    (transfer) => transfer.status === "in-progress",
  ).length;
  const completedTransfers = input.fileTransfers.filter(
    (transfer) => transfer.status === "completed",
  ).length;

  return [
    {
      id: "server",
      label: "服务端",
      status: input.serverHealth
        ? "pass"
        : input.serverDiagnosticsError
          ? "fail"
          : "idle",
      detail: input.serverHealth
        ? `${input.serverHealth.storage} / ${input.serverHealth.connections} connections`
        : input.serverDiagnosticsError || "等待 /health",
    },
    {
      id: "room",
      label: "房间",
      status: !input.currentRoomId
        ? "idle"
        : currentServerRoom
          ? "pass"
          : "warn",
      detail: !input.currentRoomId
        ? "未加入房间"
        : currentServerRoom
          ? `${currentServerRoom.participantCount} server participants`
          : `${input.participantCount} local participants`,
    },
    {
      id: "peer",
      label: "P2P",
      status:
        input.peerStates.length === 0
          ? "idle"
          : connectedPeers === input.peerStates.length
            ? "pass"
            : "warn",
      detail:
        input.peerStates.length === 0
          ? "等待第二个成员"
          : `${connectedPeers}/${input.peerStates.length} connected`,
    },
    {
      id: "data-channel",
      label: "DataChannel",
      status:
        input.peerStates.length === 0
          ? "idle"
          : openDataChannels === input.peerStates.length
            ? "pass"
            : "warn",
      detail:
        input.peerStates.length === 0
          ? "无 P2P 连接"
          : `${openDataChannels}/${input.peerStates.length} open`,
    },
    {
      id: "media",
      label: "媒体",
      status: activeMediaCount > 0 ? "pass" : "idle",
      detail:
        activeMediaCount > 0
          ? `${activeMediaCount} active streams`
          : "未开启音视频",
    },
    {
      id: "file",
      label: "文件",
      status:
        failedTransfers > 0
          ? "fail"
          : activeTransfers > 0
            ? "warn"
            : completedTransfers > 0
              ? "pass"
              : "idle",
      detail:
        failedTransfers > 0
          ? `${failedTransfers} failed`
          : activeTransfers > 0
            ? `${activeTransfers} in progress`
            : completedTransfers > 0
              ? `${completedTransfers} completed`
              : "未测试文件传输",
    },
    {
      id: "error",
      label: "错误",
      status: input.lastAvesError
        ? input.lastAvesError.retryable
          ? "warn"
          : "fail"
        : "pass",
      detail: input.lastAvesError
        ? input.lastAvesError.code || input.lastAvesError.message
        : "无结构化错误",
    },
  ];
}
