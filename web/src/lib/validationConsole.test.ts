import { describe, expect, it } from "vitest";
import {
  buildValidationChecks,
  countConnectedPeers,
  countOpenDataChannels,
  formatDuration,
  getCurrentServerRoom,
} from "./validationConsole";
import type {
  DemoFileTransfer,
  DemoServerHealth,
  DemoServerRoom,
  PeerConnectionState,
} from "../services/avesService";

const serverHealth: DemoServerHealth = {
  connections: 2,
  rooms: 1,
  storage: "memory",
  roomTimeout: 300000,
  uptime: 65000,
};

const serverRoom: DemoServerRoom = {
  id: "room-1",
  hasPassword: false,
  participantCount: 2,
  createdAt: 1,
};

const connectedPeer: PeerConnectionState = {
  peerId: "peer-1",
  peerName: "Alice",
  connectionState: "connected",
  dataChannelState: "open",
};

const completedTransfer: DemoFileTransfer = {
  transferId: "transfer-1",
  peerId: "peer-1",
  direction: "send",
  name: "hello.txt",
  size: 5,
  mimeType: "text/plain",
  lastModified: 1,
  peerName: "Alice",
  bytesTransferred: 5,
  progress: 100,
  status: "completed",
};

function baseInput() {
  return {
    serverHealth,
    serverDiagnosticsError: null,
    currentRoomId: "room-1",
    participantCount: 2,
    serverRooms: [serverRoom],
    peerStates: [connectedPeer],
    localAudioActive: true,
    localVideoActive: false,
    screenShareActive: false,
    remoteAudioCount: 0,
    remoteVideoCount: 1,
    fileTransfers: [completedTransfer],
    lastAvesError: null,
  };
}

describe("validationConsole", () => {
  it("builds an ordered healthy validation checklist", () => {
    const checks = buildValidationChecks(baseInput());

    expect(checks.map((check) => check.id)).toEqual([
      "server",
      "room",
      "peer",
      "data-channel",
      "media",
      "file",
      "error",
    ]);
    expect(checks.map((check) => check.status)).toEqual([
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
    ]);
  });

  it("marks server diagnostics failures and retryable errors clearly", () => {
    const checks = buildValidationChecks({
      ...baseInput(),
      serverHealth: null,
      serverDiagnosticsError: "fetch failed",
      lastAvesError: {
        name: "AvesError",
        message: "DataChannel not ready",
        code: "MESSAGE_CHANNEL_NOT_READY",
        stage: "transport",
        retryable: true,
      },
    });

    expect(checks.find((check) => check.id === "server")).toEqual(
      expect.objectContaining({
        status: "fail",
        detail: "fetch failed",
      }),
    );
    expect(checks.find((check) => check.id === "error")).toEqual(
      expect.objectContaining({
        status: "warn",
        detail: "MESSAGE_CHANNEL_NOT_READY",
      }),
    );
  });

  it("keeps P2P and file checks idle before they are exercised", () => {
    const checks = buildValidationChecks({
      ...baseInput(),
      peerStates: [],
      localAudioActive: false,
      remoteVideoCount: 0,
      fileTransfers: [],
    });

    expect(checks.find((check) => check.id === "peer")?.status).toBe("idle");
    expect(checks.find((check) => check.id === "data-channel")?.status).toBe(
      "idle",
    );
    expect(checks.find((check) => check.id === "media")?.status).toBe("idle");
    expect(checks.find((check) => check.id === "file")?.status).toBe("idle");
  });

  it("prioritizes failed file transfers over completed transfers", () => {
    const checks = buildValidationChecks({
      ...baseInput(),
      fileTransfers: [
        completedTransfer,
        {
          ...completedTransfer,
          transferId: "transfer-2",
          status: "failed",
          error: "channel closed",
        },
      ],
    });

    expect(checks.find((check) => check.id === "file")).toEqual(
      expect.objectContaining({
        status: "fail",
        detail: "1 failed",
      }),
    );
  });

  it("formats validation helper values", () => {
    expect(getCurrentServerRoom([serverRoom], "room-1")).toBe(serverRoom);
    expect(getCurrentServerRoom([serverRoom], "missing")).toBeUndefined();
    expect(countConnectedPeers([connectedPeer])).toBe(1);
    expect(countOpenDataChannels([connectedPeer])).toBe(1);
    expect(formatDuration(500)).toBe("500 ms");
    expect(formatDuration(65000)).toBe("1m 5s");
  });
});
