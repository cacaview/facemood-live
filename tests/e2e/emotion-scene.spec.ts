import { expect, test } from "@playwright/test";

test("emotion preview changes visual entities without changing inference controls", async ({ page }) => {
  await page.goto("/");
  const stage = page.locator(".emotion-stage-shell");
  await expect(stage).toHaveAttribute("data-emotion", "neutral");

  await page.getByRole("button", { name: "开心 · 绽放花体", exact: true }).click();
  await expect(stage).toHaveAttribute("data-emotion", "happiness");
  await expect(page.getByRole("button", { name: "启动摄像头", exact: true })).toBeEnabled();
  await expect(page.locator(".probabilities")).toBeVisible();

  await page.getByRole("button", { name: "愤怒 · 熔岩晶体", exact: true }).click();
  await expect(stage).toHaveAttribute("data-emotion", "anger");
  await page.getByRole("button", { name: "跟随识别", exact: true }).click();
  await expect(stage).toHaveAttribute("data-emotion", "neutral");

  await page.getByRole("button", { name: "三形态轮播", exact: true }).click();
  await expect(page.getByRole("button", { name: "三形态轮播" })).toHaveAttribute("aria-pressed", "true");
  const cycleStart = await stage.getAttribute("data-emotion");
  await page.waitForTimeout(3600);
  await expect(stage).not.toHaveAttribute("data-emotion", cycleStart!);
});

test("scene pause and reduced motion leave camera and export usable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "暂停 3D", exact: true }).click();
  await expect(page.getByText("3D 画面已暂停", { exact: false })).toBeVisible();
  await page.getByLabel("减少动态效果").check();
  await expect(page.getByRole("button", { name: "启动摄像头", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "导出统计 JSON ↗" })).toBeVisible();
});
