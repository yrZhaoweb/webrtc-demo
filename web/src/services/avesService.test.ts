import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

type Listener = (...args: any[]) => void;

let latestClient: MockAvesClient | null = null;

class MockAvesClient {
  private listeners = new Map<string, Set<Listener>>();
  private localAudioState = {
    active: false,
    muted: false,
  };

  createRoom = vi.fn(async () => "room-1");
  joinRoom = vi.fn(async () => [{ id: "peer-1", name: "Alice" }]);
  leaveRoom = vi.fn(async () => undefined);
  destroy = vi.fn(() => undefined);
  sendFile = vi.fn(async () => []);

  constructor() {
    latestClient = this;
  }

  on(event: string, callback: Listener): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return this;
  }

  emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }

  async startVoice(): Promise<MediaStream> {
    this.localAudioState = {
      active: true,
      muted: false,
    };
    this.emit("localAudioStateChange", this.localAudioState);
    return {} as MediaStream;
  }

  stopVoice(): void {
    this.localAudioState = {
      active: false,
      muted: false,
    };
    this.emit("localAudioStateChange", this.localAudioState);
  }

  setMuted(muted: boolean): void {
    this.localAudioState = {
      active: this.localAudioState.active,
      muted,
    };
    this.emit("localAudioStateChange", this.localAudioState);
  }

  getLocalAudioState() {
    return this.localAudioState;
  }
}

vi.mock("@yrzhao/aves-core", () => ({
  AvesClient: MockAvesClient,
}));

describe("avesService", () => {
  beforeEach(() => {
    latestClient = null;
    vi.resetModules();
  });

  afterEach(async () => {
    const { avesService } = await import("./avesService");
    await avesService.leaveRoom();
    vi.clearAllMocks();
  });

  it("tracks voice state and remote audio streams", async () => {
    const { avesService } = await import("./avesService");

    await avesService.joinRoom("room-1", "me", "Tester");
    await avesService.startVoice();

    expect(get(avesService.localAudioState)).toEqual({
      active: true,
      muted: false,
    });

    latestClient!.emit("remoteAudioTrack", "peer-1", { id: "stream-1" } as MediaStream, {} as MediaStreamTrack);

    expect(get(avesService.remoteAudioStreams).get("peer-1")).toEqual({
      id: "stream-1",
    });

    avesService.toggleMute();
    expect(get(avesService.localAudioState)).toEqual({
      active: true,
      muted: true,
    });
  });

  it("records file transfer lifecycle events", async () => {
    const { avesService } = await import("./avesService");
    const blob = new Blob(["hello"], { type: "text/plain" });

    await avesService.joinRoom("room-1", "me", "Tester");

    latestClient!.emit("fileTransferStarted", "peer-1", {
      transferId: "transfer-1",
      peerId: "peer-1",
      direction: "receive",
      name: "hello.txt",
      size: 5,
      mimeType: "text/plain",
      lastModified: 1,
    });
    latestClient!.emit("fileTransferProgress", "peer-1", {
      transferId: "transfer-1",
      peerId: "peer-1",
      direction: "receive",
      name: "hello.txt",
      size: 5,
      mimeType: "text/plain",
      lastModified: 1,
      bytesTransferred: 5,
      progress: 100,
    });
    latestClient!.emit("fileTransferCompleted", "peer-1", {
      transferId: "transfer-1",
      peerId: "peer-1",
      direction: "receive",
      name: "hello.txt",
      size: 5,
      mimeType: "text/plain",
      lastModified: 1,
      blob,
    });

    expect(get(avesService.fileTransfers)).toContainEqual(
      expect.objectContaining({
        transferId: "transfer-1",
        peerName: "Alice",
        status: "completed",
        blob,
      }),
    );
  });
});
