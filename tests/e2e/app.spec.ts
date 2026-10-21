import { test, expect } from "@playwright/test";
import fs from "node:fs";
test("permission failure is actionable; upload remains available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "启动摄像头", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("权限被拒绝");
  await expect(
    page.getByText("本地图片 / 视频", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "启动摄像头", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext("2d")!.fillRect(0, 0, 320, 240);
      return canvas.captureStream(10);
    };
  });
  await page.getByRole("button", { name: "启动摄像头", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("未检测到人脸", {
    timeout: 100000,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "停止", exact: true }).click();
});
test("real worker loads local models and matches Python ORT fixture", async ({
  page,
}) => {
  await page.goto("/?test");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByRole("status")).toContainText("模型已就绪", {
    timeout: 100000,
  });
  const fixture = JSON.parse(
    fs.readFileSync("models/baseline/fixtures.json", "utf8"),
  )[0];
  const actual = await page.evaluate(async (input) => {
    const w = new Worker("/inference-worker.js");
    const request = (data: any) =>
      new Promise<any>((resolve, reject) => {
        w.onmessage = ({ data }) => {
          if (data.type === "status") return;
          data.type === "error" ? reject(Error(data.message)) : resolve(data);
        };
        w.postMessage(data);
      });
    try {
      await request({ type: "init" });
      return await request({ type: "fixture", id: 1, input });
    } finally {
      w.terminate();
    }
  }, fixture.input);
  const max = Math.max(
    ...actual.probabilities.map((p: number, i: number) =>
      Math.abs(p - fixture.probabilities[i]),
    ),
  );
  expect(max).toBeLessThan(1e-4);
  expect(errors).toEqual([]);
  fs.writeFileSync(
    "reports/browser_parity.json",
    JSON.stringify(
      {
        max_absolute_probability_error: max,
        backend: "WASM",
        fixture: fixture.source,
        userAgent: await page.evaluate(() => navigator.userAgent),
      },
      null,
      2,
    ),
  );
  await page.getByRole("button", { name: "内置样例" }).click();
  await expect(page.locator(".prediction h2")).not.toHaveText("未检测到人脸", {
    timeout: 30000,
  });
  await expect(page.locator(".emotion-stage-shell")).toHaveAttribute("data-emotion", "happiness", { timeout: 10000 });
  await expect(page.locator(".emotion-stage-copy h2")).toContainText("开心");
  await expect(page.locator(".source-label")).toContainText("演示素材");
  await page.screenshot({ path: "reports/app-desktop.png", fullPage: true });
});
test("blank image never receives a fake expression; mobile layout fits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const blank = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="white"/></svg>',
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "blank.svg",
    mimeType: "image/svg+xml",
    buffer: blank,
  });
  await expect(page.getByRole("status")).toContainText("未检测到人脸", {
    timeout: 100000,
  });
  await expect(page.locator(".prediction h2")).toHaveText("未检测到人脸");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "reports/app-mobile.png", fullPage: true });
});
test("opening page checks manifest but reuses local models and removes old offline caches", async ({
  page,
  context,
}) => {
  let manifests = 0,
    downloads = 0;
  await context.route("**/models/active.json", (route) => {
    manifests++;
    return route.continue();
  });
  await context.route("**/models/baseline/*.onnx", (route) => {
    downloads++;
    return route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("模型已就绪", {
    timeout: 100000,
  });
  expect(downloads).toBe(1);
  await page.evaluate(async () => {
    const c = await caches.open("facemood-old-offline");
    await c.put("/old", new Response("old"));
  });
  await page.reload();
  await expect(page.getByRole("status")).toContainText("模型已就绪", {
    timeout: 100000,
  });
  expect(manifests).toBe(2);
  expect(downloads).toBe(1);
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).filter((k) => k.startsWith("facemood-")),
    ),
  ).toEqual([]);
  await expect(page.getByRole("button", { name: "准备离线使用" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "内置样例" }).click();
  await expect(page.locator(".prediction h2")).not.toHaveText("未检测到人脸", {
    timeout: 30000,
  });
});
test("simulated camera stream classifies and stop releases tracks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__stops = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image();
      img.src = "/samples/astronaut.png";
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 512;
      c.getContext("2d")!.drawImage(img, 0, 0);
      const stream = c.captureStream(12);
      for (const t of stream.getTracks()) {
        const stop = t.stop.bind(t);
        t.stop = () => {
          (window as any).__stops++;
          stop();
        };
      }
      return stream;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "内置样例" }).click();
  await expect(page.getByRole("status")).toContainText("本地处理", {
    timeout: 100000,
  });
  await page.getByRole("button", { name: "启动摄像头", exact: true }).click();
  await expect(page.locator(".source-label")).toHaveCount(0);
  await expect(page.locator(".prediction h2")).not.toHaveText("未检测到人脸", {
    timeout: 100000,
  });
  await page.getByRole("button", { name: "停止", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__stops)).toBeGreaterThan(0);
  await expect(page.locator(".prediction h2")).toHaveText("未检测到人脸");
});
test("local video pause clears prediction and native play resumes classification", async ({
  page,
}) => {
  await page.goto("/");
  const bytes = await page.evaluate(async () => {
    const img = new Image();
    img.src = "/samples/astronaut.png";
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const stream = c.captureStream(10),
      recorder = new MediaRecorder(stream, { mimeType: "video/webm" }),
      chunks: BlobPart[] = [];
    const blob = await new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      recorder.start();
      const interval = setInterval(() => ctx.drawImage(img, 0, 0), 50);
      setTimeout(() => {
        clearInterval(interval);
        recorder.stop();
        stream.getTracks().forEach((t) => t.stop());
      }, 3000);
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "sample.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator(".prediction h2")).not.toHaveText("未检测到人脸", {
    timeout: 100000,
  });
  await page.locator("video").evaluate((v: HTMLVideoElement) => v.pause());
  await expect(page.locator(".prediction h2")).toHaveText("未检测到人脸");
  await page.locator("video").evaluate((v: HTMLVideoElement) => v.play());
  await expect(page.locator(".prediction h2")).not.toHaveText("未检测到人脸", {
    timeout: 10000,
  });
});
test("worker model-load failure can recover and reanalyze the same image", async ({
  browser,
}) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  try {
    await context.route("**/models/baseline/**", (route) =>
      route.fulfill({ status: 503, body: "unavailable" }),
    );
    await page.goto("http://127.0.0.1:4173/");
    await page.getByRole("button", { name: "内置样例" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15000 });
    await context.unroute("**/models/baseline/**");
    await page.getByRole("button", { name: "重新分析素材" }).click();
    await expect(page.locator(".prediction h2")).not.toHaveText(
      "未检测到人脸",
      { timeout: 100000 },
    );
  } finally {
    await context.close();
  }
});

test("camera picker requests the exact device and releases the previous camera", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let authorized = false;
    (window as any).__cameraRequests = [];
    (window as any).__cameraStops = 0;
    navigator.mediaDevices.enumerateDevices = async () =>
      [
        {
          kind: "videoinput",
          deviceId: "integrated",
          label: authorized ? "内置摄像头" : "",
        },
        {
          kind: "videoinput",
          deviceId: "usb-camera",
          label: authorized ? "USB 摄像头" : "",
        },
        { kind: "audioinput", deviceId: "microphone", label: "麦克风" },
      ] as MediaDeviceInfo[];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const id = (constraints?.video as MediaTrackConstraints)?.deviceId as
        | ConstrainDOMStringParameters
        | undefined;
      const chosen = id?.exact || "integrated";
      (window as any).__cameraRequests.push(chosen);
      authorized = true;
      const img = new Image();
      img.src = "/samples/astronaut.png";
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const stream = canvas.captureStream(10);
      for (const track of stream.getVideoTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          (window as any).__cameraStops++;
          stop();
        };
        track.getSettings = () => ({ deviceId: chosen as string });
      }
      return stream;
    };
  });
  await page.goto("/");
  const picker = page.getByRole("combobox", { name: "摄像头" });
  await expect(picker).toBeVisible();
  await expect(picker.locator("option")).toHaveCount(3);
  await picker.selectOption("usb-camera");
  expect(await page.evaluate(() => (window as any).__cameraRequests)).toEqual(
    [],
  );
  await page.getByRole("button", { name: "启动摄像头", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("实时识别", {
    timeout: 100000,
  });
  await expect(picker.locator('option[value="usb-camera"]')).toHaveText(
    "USB 摄像头",
  );
  await expect(picker).toHaveValue("usb-camera");
  await picker.selectOption("integrated");
  await expect(page.getByRole("status")).toContainText("实时识别", {
    timeout: 30000,
  });
  expect(await page.evaluate(() => (window as any).__cameraRequests)).toEqual([
    "usb-camera",
    "integrated",
  ]);
  expect(await page.evaluate(() => (window as any).__cameraStops)).toBe(1);
  await page
    .locator(".camera-picker")
    .screenshot({ path: "reports/camera-picker.png" });
  await page.evaluate(() => {
    navigator.mediaDevices.enumerateDevices = async () =>
      [
        { kind: "videoinput", deviceId: "usb-camera", label: "USB 摄像头" },
      ] as MediaDeviceInfo[];
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await expect(picker).toHaveValue("");
  await expect(page.getByRole("status")).toContainText("已断开");
  expect(await page.evaluate(() => (window as any).__cameraStops)).toBe(2);
  expect(await page.evaluate(() => (window as any).__cameraRequests)).toEqual([
    "usb-camera",
    "integrated",
  ]);
});

test("unavailable selected camera reports error without silently opening a different device", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.enumerateDevices = async () =>
      [
        {
          kind: "videoinput",
          deviceId: "unavailable",
          label: "暂不可用摄像头",
        },
      ] as MediaDeviceInfo[];
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("missing", "OverconstrainedError");
    };
  });
  await page.goto("/");
  const picker = page.getByRole("combobox", { name: "摄像头" });
  await picker.selectOption("unavailable");
  await page.getByRole("button", { name: "启动摄像头", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("所选摄像头不可用");
  await expect(picker).toHaveValue("unavailable");
  await expect(
    page.getByRole("button", { name: "启动摄像头", exact: true }),
  ).toBeEnabled();
});
