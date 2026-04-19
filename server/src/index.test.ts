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
});
