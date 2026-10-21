import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

async function waitForSceneInitialization(
  page: import("@playwright/test").Page,
) {
  const status = page.locator(".emotion-scene-status");
  await expect.poll(() => status.innerText()).not.toBe("WebGL2 场景启动中");
  if (await page.locator(".emotion-scene-fallback").isVisible())
    test.skip(true, "WebGL2 is unavailable in this browser");
  await expect(status).toHaveText(/^3D \d+ FPS$/);
}

test("emotion preview changes visual entities without changing inference controls", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.locator(".emotion-stage-shell");
  await expect(stage).toHaveAttribute("data-emotion", "neutral");

  await page
    .getByRole("button", { name: "开心 · 绽放花体", exact: true })
    .click();
  await expect(stage).toHaveAttribute("data-emotion", "happiness");
  await expect(
    page.getByRole("button", { name: "启动摄像头", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".probabilities")).toBeVisible();

  await page
    .getByRole("button", { name: "愤怒 · 熔岩晶体", exact: true })
    .click();
  await expect(stage).toHaveAttribute("data-emotion", "anger");
  await page.getByRole("button", { name: "跟随识别", exact: true }).click();
  await expect(stage).toHaveAttribute("data-emotion", "neutral");

  await page.getByRole("button", { name: "三形态轮播", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "三形态轮播" }),
  ).toHaveAttribute("aria-pressed", "true");
  const cycleStart = await stage.getAttribute("data-emotion");
  await page.waitForTimeout(3600);
  await expect(stage).not.toHaveAttribute("data-emotion", cycleStart!);
});

test("scene pause and reduced motion leave camera and export usable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "暂停 3D", exact: true }).click();
  await expect(page.getByText("3D 画面已暂停", { exact: false })).toBeVisible();
  await page.getByLabel("减少动态效果").check();
  await expect(
    page.getByRole("button", { name: "启动摄像头", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "导出统计 JSON ↗" }),
  ).toBeVisible();
});

test("pointer drag changes the flow-driven scene while reduced motion is enabled", async ({
  page,
}) => {
  await page.goto("/");
  const fallback = page.locator(".emotion-scene-fallback");
  if (await fallback.isVisible())
    test.skip(true, "WebGL2 is unavailable in this browser");
  await waitForSceneInitialization(page);
  await page.getByLabel("减少动态效果").check();
  const canvas = page.locator(".emotion-scene-canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(250);
  const before = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("3D canvas has no visible bounds");
  await page.mouse.move(
    bounds.x + bounds.width * 0.36,
    bounds.y + bounds.height * 0.42,
  );
  await page.mouse.move(
    bounds.x + bounds.width * 0.43,
    bounds.y + bounds.height * 0.48,
    { steps: 4 },
  );
  await page.mouse.move(
    bounds.x + bounds.width * 0.57,
    bounds.y + bounds.height * 0.54,
    { steps: 6 },
  );
  await page.waitForTimeout(120);
  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(false);
});

test("WebGL context loss uses a local fallback and restores the scene", async ({
  page,
}) => {
  await page.goto("/");
  const host = page.locator(".emotion-scene-host");
  if (await page.locator(".emotion-scene-fallback").isVisible())
    test.skip(true, "WebGL2 is unavailable in this browser");
  await waitForSceneInitialization(page);
  const canvas = page.locator(".emotion-scene-canvas");
  await expect(canvas).toBeVisible();
  await canvas.evaluate((node) =>
    node.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await expect(host).toHaveClass(/has-fallback/);
  await expect(
    page.getByRole("button", { name: "启动摄像头", exact: true }),
  ).toBeEnabled();
  await canvas.evaluate((node) =>
    node.dispatchEvent(new Event("webglcontextrestored")),
  );
  await expect(host).not.toHaveClass(/has-fallback/);
  await expect(canvas).toBeVisible();
});

test("manual visual previews never enter the statistics export", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "开心 · 绽放花体", exact: true })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出统计 JSON ↗" }).click(),
  ]);
  const stats = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(stats.source).toBe("camera");
  expect(stats.rawProbabilities).toBeNull();
});
