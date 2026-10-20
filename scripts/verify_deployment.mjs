import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const url = process.argv[2] || "https://106.53.199.187:8443/";
const record = {
  url,
  startedAt: new Date().toISOString(),
  status: "running",
  environment: "macOS headless Chromium, not target-device acceptance",
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  let downloads = 0,
    manifests = 0;
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith(".onnx")) downloads++;
    if (path.endsWith("/models/active.json")) manifests++;
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(url, { timeout: 60000 });
  await expect(page.getByRole("status")).toContainText("模型已就绪", {
    timeout: 150000,
  });
  record.secureContext = await page.evaluate(() => window.isSecureContext);
  if (!record.secureContext) throw Error("Not a secure camera context");
  await expect(page.getByRole("combobox", { name: "摄像头" })).toBeVisible();
  await expect(page.locator("section.privacy")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "准备离线使用" })).toHaveCount(
    0,
  );
  record.localModel = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("facemood-models", 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const q = db
            .transaction("models")
            .objectStore("models")
            .get("expression");
          q.onsuccess = () => {
            resolve({
              sha256: q.result.sha256,
              bytes: q.result.bytes.byteLength,
            });
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
  const expected = JSON.parse(
    readFileSync("public/models/active.json", "utf8"),
  );
  if (record.localModel.sha256 !== expected.sha256)
    throw Error("Deployed model SHA differs");
  await page.getByRole("button", { name: "内置样例" }).click();
  await expect(page.locator(".prediction h2")).not.toHaveText("未检测到人脸", {
    timeout: 30000,
  });
  record.samplePrediction = await page.locator(".prediction h2").innerText();
  await page.screenshot({
    path: "reports/deployment-desktop.png",
    fullPage: true,
  });
  const initialDownloads = downloads;
  await page.reload();
  await expect(page.getByRole("status")).toContainText("模型已就绪", {
    timeout: 150000,
  });
  if (downloads !== initialDownloads)
    throw Error("Unchanged model downloaded again");
  record.modelRequests = { downloads, manifests, localReuse: true };
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: "启动摄像头", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("权限被拒绝");
  record.permissionRecoveryPrompt = true;
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    throw Error("Mobile horizontal overflow");
  await page.screenshot({
    path: "reports/deployment-mobile.png",
    fullPage: true,
  });
  record.mobileLayout = true;
  if (pageErrors.length) throw Error(pageErrors.join("\n"));
  record.pageErrors = pageErrors;
  record.version = await (
    await context.request.get(new URL("version.json", url).href)
  ).json();
  record.status = "passed";
} catch (error) {
  record.status = "failed";
  record.error = String(error);
  throw error;
} finally {
  record.endedAt = new Date().toISOString();
  writeFileSync(
    "reports/deployment_verification.json",
    JSON.stringify(record, null, 2),
  );
  await browser.close();
  console.log(JSON.stringify(record, null, 2));
}
