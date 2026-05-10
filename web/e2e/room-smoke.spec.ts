import { expect, test } from "@playwright/test";

test.describe("Aves demo smoke", () => {
  test("shows SDK versions on the home screen", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "WebRTC 实时协作室" })).toBeVisible();
    await expect(page.getByTestId("sdk-version-badges")).toContainText("aves-core 1.1.0");
    await expect(page.getByTestId("sdk-version-badges")).toContainText("aves-node 1.1.0");
  });

  test("can create a room and show diagnostics", async ({ page }) => {
    const metricsResponse = await page.request.get("http://127.0.0.1:8080/metrics");
    expect(metricsResponse.ok()).toBe(true);
    await expect(metricsResponse.json()).resolves.toEqual(
      expect.objectContaining({
        storage: "memory",
        participants: expect.any(Number),
      }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "创建房间" }).click();
    await page.getByPlaceholder("请输入您的名字").fill("Playwright");
    await page.getByRole("button", { name: "确认创建" }).click();

    await expect(page.getByTestId("validation-console")).toBeVisible();
    await expect(page.getByTestId("room-tools")).toBeVisible();
    await expect(page.getByText("aves-core 1.1.0")).toBeVisible();
    await expect(page.getByText("aves-node 1.1.0")).toBeVisible();
  });
});
