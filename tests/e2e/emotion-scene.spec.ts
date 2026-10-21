import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("immersive desktop scene fills the first viewport and supports floating observation panels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const stage = await page.locator(".emotion-stage-shell").boundingBox();
  const camera = await page.locator(".viewer").boundingBox();
  const analysis = await page.locator(".results").boundingBox();
  expect(stage!.width).toBeGreaterThanOrEqual(1400);
  expect(stage!.height).toBeGreaterThanOrEqual(850);
  for (const panel of [camera!, analysis!]) {
    expect(panel.y).toBeGreaterThan(stage!.y);
    expect(panel.y + panel.height).toBeLessThan(stage!.y + stage!.height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "开心 · 绽放花体", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

async function waitForSceneInitialization(
  page: import("@playwright/test").Page,
) {
  const status = page.locator(".emotion-scene-status");
  await expect.poll(() => status.innerText()).not.toBe("WebGL2 场景启动中");
  if (await page.locator(".emotion-scene-fallback").isVisible())
    test.skip(true, "WebGL2 is unavailable in this browser");
  await expect(status).toHaveText(/^3D \d+ FPS$/);
}

async function waitForModelInitialization(
  page: import("@playwright/test").Page,
) {
  await expect(page.getByRole("status")).toContainText("模型已就绪", {
    timeout: 100000,
  });
}

test("quality changes keep rendering without reactive Three.js proxy errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await waitForSceneInitialization(page);
  const quality = page.getByRole("combobox", { name: "3D 画质" });
  for (const preset of ["high", "low", "medium"]) {
    await quality.selectOption(preset);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
    await expect(page.locator(".emotion-scene-fallback")).toHaveCount(0);
  }
});

test("a runtime render exception falls back locally and keeps input controls usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await waitForSceneInitialization(page);
  await page.locator(".emotion-scene-canvas").evaluate((node) => {
    const gl = (node as HTMLCanvasElement).getContext("webgl2")!;
    gl.drawArrays = () => {
      throw new Error("simulated render failure");
    };
  });
  await expect(page.locator(".emotion-scene-host")).toHaveClass(/has-fallback/);
  await expect(page.locator(".emotion-scene-fallback")).toContainText(
    "simulated render failure",
  );
  await expect(
    page.getByRole("button", { name: "内置样例", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("emotion preview changes visual entities without changing inference controls", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.locator(".emotion-stage-shell");
  // Camera enablement depends on the independent 35 MB model initialization,
  // not on scene readiness or a fixed five-second rendering window.
  await waitForModelInitialization(page);
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
  await waitForModelInitialization(page);
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

test("system reduced-motion preference pauses and resumes the visual cycle", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.locator(".emotion-stage-shell");
  await page.getByRole("button", { name: "三形态轮播", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByLabel("减少动态效果")).toBeChecked();
  const pausedEmotion = await stage.getAttribute("data-emotion");
  await page.waitForTimeout(3700);
  await expect(stage).toHaveAttribute("data-emotion", pausedEmotion!);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.getByLabel("减少动态效果")).not.toBeChecked();
  await expect(stage).not.toHaveAttribute("data-emotion", pausedEmotion!, {
    timeout: 4200,
  });
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

test("touch pointer disturbance survives pointer cancellation and scene resize", async ({
  page,
}) => {
  await page.goto("/");
  if (await page.locator(".emotion-scene-fallback").isVisible())
    test.skip(true, "WebGL2 is unavailable in this browser");
  await waitForSceneInitialization(page);
  await page.getByLabel("减少动态效果").check();
  const canvas = page.locator(".emotion-scene-canvas");
  await expect(canvas).toBeVisible();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const before = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("3D canvas has no visible bounds");
  await canvas.evaluate((node, rect) => {
    const target = node as HTMLCanvasElement;
    // Synthetic PointerEvents cannot acquire native capture; the scene still
    // receives the same touch lifecycle events used by a browser gesture.
    target.setPointerCapture = () => {};
    const fire = (
      type: string,
      pointerId: number,
      x: number,
      y: number,
      buttons: number,
    ) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId,
          pointerType: "touch",
          isPrimary: true,
          buttons,
          clientX: x,
          clientY: y,
        }),
      );
    fire(
      "pointerdown",
      17,
      rect.x + rect.width * 0.35,
      rect.y + rect.height * 0.4,
      1,
    );
    fire(
      "pointermove",
      17,
      rect.x + rect.width * 0.42,
      rect.y + rect.height * 0.46,
      1,
    );
    fire(
      "pointermove",
      17,
      rect.x + rect.width * 0.54,
      rect.y + rect.height * 0.53,
      1,
    );
    fire(
      "pointercancel",
      17,
      rect.x + rect.width * 0.54,
      rect.y + rect.height * 0.53,
      0,
    );
    fire(
      "lostpointercapture",
      17,
      rect.x + rect.width * 0.54,
      rect.y + rect.height * 0.53,
      0,
    );
    fire(
      "pointerdown",
      18,
      rect.x + rect.width * 0.42,
      rect.y + rect.height * 0.48,
      1,
    );
    fire(
      "pointermove",
      18,
      rect.x + rect.width * 0.5,
      rect.y + rect.height * 0.55,
      1,
    );
    fire(
      "pointerup",
      18,
      rect.x + rect.width * 0.5,
      rect.y + rect.height * 0.55,
      0,
    );
    fire(
      "lostpointercapture",
      18,
      rect.x + rect.width * 0.5,
      rect.y + rect.height * 0.55,
      0,
    );
  }, bounds);
  await page.waitForTimeout(120);
  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => (await canvas.boundingBox())?.width ?? 0)
    .toBeGreaterThan(0);

  await page.waitForTimeout(400);
  await canvas.evaluate((node) => {
    const gl = (node as HTMLCanvasElement).getContext("webgl2");
    if (!gl) throw new Error("WebGL2 context disappeared");
    let drawCount = 0;
    const originalDrawArrays = gl.drawArrays.bind(gl);
    const originalDrawElements = gl.drawElements.bind(gl);
    (gl as any).drawArrays = (...args: any[]) => {
      drawCount++;
      return originalDrawArrays(...args);
    };
    (gl as any).drawElements = (...args: any[]) => {
      drawCount++;
      return originalDrawElements(...args);
    };
    (window as any).__emotionDrawCount = () => drawCount;
  });
  await page.waitForTimeout(120);
  const drawsBeforeBackground = await page.evaluate(() =>
    (window as any).__emotionDrawCount(),
  );
  expect(drawsBeforeBackground).toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => document.hidden)).toBe(true);
  const resizedBounds = await canvas.boundingBox();
  if (!resizedBounds) throw new Error("3D canvas lost its bounds after resize");
  await canvas.evaluate((node, rect) => {
    const target = node as HTMLCanvasElement;
    const move = (x: number, y: number) =>
      target.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerType: "mouse",
          clientX: x,
          clientY: y,
        }),
      );
    move(rect.x + rect.width * 0.42, rect.y + rect.height * 0.48);
    move(rect.x + rect.width * 0.53, rect.y + rect.height * 0.55);
  }, resizedBounds);
  await page.waitForTimeout(120);
  const drawsSettledInBackground = await page.evaluate(() =>
    (window as any).__emotionDrawCount(),
  );
  await page.waitForTimeout(120);
  const drawsWhileBackground = await page.evaluate(() =>
    (window as any).__emotionDrawCount(),
  );
  expect(drawsWhileBackground).toBe(drawsSettledInBackground);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => document.hidden)).toBe(false);
  await page.waitForTimeout(120);
  const drawsAfterBackground = await page.evaluate(() =>
    (window as any).__emotionDrawCount(),
  );
  expect(drawsAfterBackground).toBeGreaterThan(drawsWhileBackground);
  expect(pageErrors).toEqual([]);
});

test("WebGL context loss uses a local fallback and restores the scene", async ({
  page,
}) => {
  await page.goto("/");
  await waitForModelInitialization(page);
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
