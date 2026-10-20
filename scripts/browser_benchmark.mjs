import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4173");
  const fixtures = JSON.parse(
    readFileSync("models/baseline/fixtures.json", "utf8"),
  );
  const result = await page.evaluate(async (fixtures) => {
    const worker = new Worker("/inference-worker.js");
    let id = 1;
    const request = (type, payload = {}, transfer = []) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error("worker timeout")), 90000);
        worker.onmessage = ({ data }) => {
          if (data.type === "status") return;
          clearTimeout(timer);
          data.type === "error" ? reject(Error(data.message)) : resolve(data);
        };
        worker.onerror = (e) => {
          clearTimeout(timer);
          reject(Error(e.message));
        };
        worker.postMessage({ type, id: id++, ...payload }, transfer);
      });
    const t = performance.now();
    await request("init");
    const load = performance.now() - t;
    const parity = [];
    for (const f of fixtures) {
      const r = await request("fixture", { input: f.input });
      parity.push({
        source: f.source,
        maxAbsoluteError: Math.max(
          ...r.probabilities.map((v, i) => Math.abs(v - f.probabilities[i])),
        ),
      });
    }
    const img = new Image();
    img.src = "/samples/astronaut.png";
    await img.decode();
    const times = [];
    for (let i = 0; i < 205; i++) {
      const start = performance.now();
      const bitmap = await createImageBitmap(img);
      const r = await request("frame", { bitmap }, [bitmap]);
      if (!r.probabilities) throw Error("benchmark source face missing");
      if (i >= 5)
        times.push({
          e2e: performance.now() - start,
          detect: r.detect,
          preprocess: r.preprocess,
          classify: r.classify,
          worker: r.total,
        });
    }
    worker.terminate();
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      coldWorkerLoadMs: load,
      backend: "WASM CPU one thread",
      samples: times,
      parity,
    };
  }, fixtures);
  const stats = (key) => {
    const a = result.samples.map((s) => s[key]).sort((a, b) => a - b);
    return {
      count: a.length,
      mean: a.reduce((s, v) => s + v, 0) / a.length,
      p50: a[Math.ceil(a.length * 0.5) - 1],
      p95: a[Math.ceil(a.length * 0.95) - 1],
      max: a.at(-1),
    };
  };
  result.summary = Object.fromEntries(
    ["e2e", "detect", "preprocess", "classify", "worker"].map((k) => [
      k,
      stats(k),
    ]),
  );
  result.completedInferenceFps = 1000 / result.summary.e2e.mean;
  result.scope =
    "Local macOS headless Chromium, repeated NASA still image, 5 warmup + 200 serial frames, no pacing. Not Windows/iPhone camera/thermal acceptance. FPS is throughput benchmark, not app throttled classification FPS.";
  if (Math.max(...result.parity.map((f) => f.maxAbsoluteError)) > 1e-4)
    throw Error("parity tolerance exceeded");
  writeFileSync(
    "reports/browser_benchmark.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        summary: result.summary,
        fps: result.completedInferenceFps,
        parity: result.parity,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
