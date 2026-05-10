import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoServer, resolvePort } from "./index";

describe("demo server entry", () => {
  it("falls back to the default port when input is invalid", () => {
    expect(resolvePort(undefined)).toBe(8080);
    expect(resolvePort("invalid")).toBe(8080);
    expect(resolvePort("9123")).toBe(9123);
  });

  it("creates a closeable demo server", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      return undefined as never;
    }) as typeof process.exit);

    const { wss, close, disposeHandlers } = createDemoServer({ noServer: true });

    expect(wss.options.noServer).toBe(true);

    await close();
    disposeHandlers();
    exitSpy.mockRestore();
  });

  it("exposes server health over HTTP", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      return undefined as never;
    }) as typeof process.exit);

    const { httpServer, close, disposeHandlers } = createDemoServer(0);
    expect(httpServer).toBeDefined();

    await new Promise<void>((resolve) => {
      httpServer!.once("listening", resolve);
    });

    const address = httpServer!.address();
    expect(address).toBeTruthy();
    expect(typeof address).not.toBe("string");

    const response = await fetch(`http://127.0.0.1:${address && typeof address !== "string" ? address.port : 0}/health`);
    const health = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(health).toEqual(
      expect.objectContaining({
        connections: 0,
        rooms: 0,
        storage: "memory",
        roomTimeout: 300000,
      }),
    );
    expect(typeof health.uptime).toBe("number");

    await close();
    disposeHandlers();
    exitSpy.mockRestore();
  });

  it("exposes rooms over HTTP", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      return undefined as never;
    }) as typeof process.exit);

    const { httpServer, close, disposeHandlers } = createDemoServer(0);
    expect(httpServer).toBeDefined();

    await new Promise<void>((resolve) => {
      httpServer!.once("listening", resolve);
    });

    const address = httpServer!.address();
    expect(address).toBeTruthy();
    expect(typeof address).not.toBe("string");

    const response = await fetch(`http://127.0.0.1:${address && typeof address !== "string" ? address.port : 0}/rooms`);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      rooms: [],
    });

    await close();
    disposeHandlers();
    exitSpy.mockRestore();
  });

  it("exposes server metrics over HTTP", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      return undefined as never;
    }) as typeof process.exit);

    const { httpServer, close, disposeHandlers } = createDemoServer(0);
    expect(httpServer).toBeDefined();

    await new Promise<void>((resolve) => {
      httpServer!.once("listening", resolve);
    });

    const address = httpServer!.address();
    expect(address).toBeTruthy();
    expect(typeof address).not.toBe("string");

    const response = await fetch(`http://127.0.0.1:${address && typeof address !== "string" ? address.port : 0}/metrics`);
    const metrics = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(metrics).toEqual(
      expect.objectContaining({
        connections: 0,
        rooms: 0,
        participants: 0,
        pendingDisconnects: 0,
        storage: "memory",
        maxMessageSize: 262144,
      }),
    );

    await close();
    disposeHandlers();
    exitSpy.mockRestore();
  });
});
