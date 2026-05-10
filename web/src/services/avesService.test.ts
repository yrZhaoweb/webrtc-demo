import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

type Listener = (...args: any[]) => void;

let latestClient: MockAvesClient | null = null;

class MockAvesClient {
  private listeners = new Map<string, Set<Listener>>();
  readonly config: unknown;
  private localAudioState = {
    active: false,
    muted: false,
  };
  private localVideoState = {
    active: false,
    muted: false,
  };
  private screenShareState = {
    active: false,
    source: "camera",
  };
  private readonly cameraStream = { id: "camera-stream" } as MediaStream;
  private readonly screenStream = { id: "screen-stream" } as MediaStream;

  createRoom = vi.fn(async () => "room-1");
  joinRoom = vi.fn(async () => [{ id: "peer-1", name: "Alice" }]);
  leaveRoom = vi.fn(async () => undefined);
  destroy = vi.fn(() => undefined);
  sendFile = vi.fn(async () => []);

  constructor(config: unknown) {
    this.config = config;
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

  async startVideo(): Promise<MediaStream> {
    this.localVideoState = {
      active: true,
      muted: false,
    };
    this.emit("localVideoStateChange", this.localVideoState);
    return this.cameraStream;
  }

  stopVideo(): void {
    this.localVideoState = {
      active: false,
      muted: false,
    };
    this.emit("localVideoStateChange", this.localVideoState);
  }

  setVideoMuted(muted: boolean): void {
    this.localVideoState = {
      active: this.localVideoState.active,
      muted,
    };
    this.emit("localVideoStateChange", this.localVideoState);
  }

  getLocalVideoState() {
    return this.localVideoState;
  }

  async startScreenShare(): Promise<MediaStream> {
    this.screenShareState = {
      active: true,
      source: "screen",
    };
    this.emit("screenShareStateChange", this.screenShareState);
    return this.screenStream;
  }

  stopScreenShare(): void {
    this.screenShareState = {
      active: false,
      source: "camera",
    };
    this.emit("screenShareStateChange", this.screenShareState);
    this.emit("localVideoStateChange", this.localVideoState);
  }

  getScreenShareState() {
    return this.screenShareState;
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
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("configures the 1.1.0 client for media, file transfer, and reconnect validation", async () => {
    const { avesService } = await import("./avesService");

    avesService.getClient();

    expect(latestClient!.config).toEqual(
      expect.objectContaining({
        signalingUrl: "ws://localhost:8080",
        fileChunkSize: 32 * 1024,
        video: {
          width: 1280,
          height: 720,
          frameRate: 30,
        },
        reconnect: {
          maxAttempts: 5,
          delay: 3000,
          requestTimeoutMs: 30000,
        },
      }),
    );
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

  it("sends files with explicit 1.1.0 metadata options", async () => {
    const { avesService } = await import("./avesService");
    const file = new File(["hello"], "hello.txt", {
      type: "text/plain",
      lastModified: 123,
    });

    await avesService.joinRoom("room-1", "me", "Tester");
    await avesService.sendFile(file, "peer-1");

    expect(latestClient!.sendFile).toHaveBeenCalledWith(file, {
      peerId: "peer-1",
      fileName: "hello.txt",
      mimeType: "text/plain",
      lastModified: 123,
      chunkSize: 32 * 1024,
    });
  });

  it("tracks local camera and screen-share preview streams", async () => {
    const { avesService } = await import("./avesService");

    await avesService.joinRoom("room-1", "me", "Tester");
    const cameraStream = await avesService.startVideo();

    expect(get(avesService.localVideoState)).toEqual({
      active: true,
      muted: false,
    });
    expect(get(avesService.localPreviewStream)).toBe(cameraStream);

    const screenStream = await avesService.startScreenShare();
    expect(get(avesService.screenShareState)).toEqual({
      active: true,
      source: "screen",
    });
    expect(get(avesService.localPreviewStream)).toBe(screenStream);

    avesService.stopScreenShare();
    expect(get(avesService.localPreviewStream)).toBe(cameraStream);

    avesService.stopVideo();
    expect(get(avesService.localPreviewStream)).toBeNull();
  });

  it("stores structured aves errors and diagnostic events", async () => {
    const { avesService } = await import("./avesService");

    await avesService.joinRoom("room-1", "me", "Tester");
    latestClient!.emit("error", {
      name: "AvesError",
      message: "DataChannel not ready",
      code: "MESSAGE_CHANNEL_NOT_READY",
      stage: "transport",
      retryable: true,
      peerId: "peer-1",
      requestId: "request-1",
    });

    expect(get(avesService.lastAvesError)).toEqual(
      expect.objectContaining({
        message: "DataChannel not ready",
        code: "MESSAGE_CHANNEL_NOT_READY",
        stage: "transport",
        retryable: true,
        peerId: "peer-1",
        requestId: "request-1",
      }),
    );
    expect(get(avesService.diagnosticEvents)[0]).toEqual(
      expect.objectContaining({
        level: "error",
        source: "aves-core",
        message: "DataChannel not ready",
      }),
    );
  });

  it("fetches server health and room diagnostics from the signaling origin", async () => {
    const { avesService } = await import("./avesService");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/health")) {
        return new Response(
          JSON.stringify({
            connections: 1,
            rooms: 1,
            storage: "memory",
            roomTimeout: 300000,
            uptime: 42,
          }),
        );
      }

      return new Response(
        JSON.stringify({
          rooms: [
            {
              id: "room-1",
              hasPassword: false,
              participantCount: 2,
              createdAt: 100,
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await avesService.fetchServerDiagnostics();

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8080/health");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8080/rooms");
    expect(get(avesService.serverHealth)).toEqual({
      connections: 1,
      rooms: 1,
      storage: "memory",
      roomTimeout: 300000,
      uptime: 42,
    });
    expect(get(avesService.serverRooms)).toEqual([
      {
        id: "room-1",
        hasPassword: false,
        participantCount: 2,
        createdAt: 100,
      },
    ]);
  });
});
