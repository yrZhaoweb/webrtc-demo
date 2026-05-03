import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const roomSource = readFileSync(resolve("src/routes/Room.svelte"), "utf8");
const connectionStatusSource = readFileSync(
  resolve("src/components/ConnectionStatus.svelte"),
  "utf8",
);

function cssBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\n\\s*\\}`),
  );
  return match?.groups?.body ?? "";
}

function roomCssBlock(selector: string): string {
  return cssBlock(roomSource, selector);
}

function connectionStatusCssBlock(selector: string): string {
  return cssBlock(connectionStatusSource, selector);
}

describe("Room layout", () => {
  it("keeps the message composer visible while the top tool area scrolls as one layer", () => {
    expect(roomCssBlock(".room")).toContain("height: 100vh");
    expect(roomCssBlock(".room")).toContain("overflow: hidden");
    expect(roomCssBlock(".room-content")).toContain("overflow: hidden");
    expect(roomCssBlock(".room-tools")).toContain("max-height:");
    expect(roomCssBlock(".room-tools")).toContain("overflow-y: auto");
    expect(roomCssBlock(".room-tools")).toContain("flex: 0 0 auto");
    expect(roomCssBlock(".toolbelt")).not.toContain("max-height:");
    expect(roomCssBlock(".toolbelt")).not.toContain("overflow-y: auto");
    expect(roomCssBlock(".message-list")).toContain("min-height:");
    expect(roomCssBlock(".message-input-container")).toContain("flex: 0 0 auto");
    expect(roomCssBlock(".message-input-container")).toContain("position: sticky");
    expect(roomCssBlock(".message-input-container")).toContain("bottom: 0");
  });

  it("keeps the validation console outside of the tool card grid", () => {
    const roomToolsIndex = roomSource.indexOf('class="room-tools"');
    const validationConsoleIndex = roomSource.indexOf("<ValidationConsole");
    const toolbeltIndex = roomSource.indexOf('class="toolbelt"');

    expect(roomToolsIndex).toBeGreaterThan(-1);
    expect(validationConsoleIndex).toBeGreaterThan(roomToolsIndex);
    expect(validationConsoleIndex).toBeLessThan(toolbeltIndex);
  });

  it("keeps connection status inside the header instead of a fixed overlay", () => {
    const headerActionsIndex = roomSource.indexOf('class="header-actions"');
    const connectionStatusIndex = roomSource.indexOf("<ConnectionStatus");

    expect(headerActionsIndex).toBeGreaterThan(-1);
    expect(connectionStatusIndex).toBeGreaterThan(headerActionsIndex);
    expect(roomCssBlock(".header-actions")).toContain("display: flex");
    expect(connectionStatusCssBlock(".connection-status")).toContain("position: relative");
    expect(connectionStatusCssBlock(".connection-status")).not.toContain("position: fixed");
  });
});
