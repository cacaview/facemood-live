import { it, expect, vi, afterEach } from "vitest";
import { InferenceEngine } from "./engine";
class WorkerFake {
  static instances: WorkerFake[] = [];
  onmessage: any;
  onerror: any;
  terminated = false;
  constructor() {
    WorkerFake.instances.push(this);
  }
  postMessage(data: any) {
    if (data.type === "init")
      queueMicrotask(() => this.onmessage({ data: { type: "ready" } }));
  }
  terminate() {
    this.terminated = true;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("worker crash rejects in-flight frame and allows model reinitialization", async () => {
  vi.stubGlobal("Worker", WorkerFake);
  const e = new InferenceEngine();
  await e.init();
  const w = WorkerFake.instances.at(-1)!;
  const frame = e.infer({ close() {} } as ImageBitmap);
  w.onerror({ message: "crash" });
  await expect(frame).rejects.toThrow("crash");
  expect(e.busy).toBe(false);
  expect(e.ready).toBe(false);
  expect(w.terminated).toBe(true);
  await e.init();
  expect(e.ready).toBe(true);
  e.close();
});
it("stop while initializing rejects pending initialization", async () => {
  class Slow extends WorkerFake {
    postMessage() {}
  }
  vi.stubGlobal("Worker", Slow);
  const e = new InferenceEngine();
  const p = e.init();
  e.close();
  await expect(p).rejects.toThrow("停止");
  expect(e.ready).toBe(false);
});
it("active downloads can exceed 90 seconds without terminating the worker", async () => {
  vi.useFakeTimers();
  class Download extends WorkerFake {
    postMessage() {}
  }
  vi.stubGlobal("Worker", Download);
  const e = new InferenceEngine();
  const result = e.init().then(
    () => "ready",
    (err) => err.message,
  );
  const w = WorkerFake.instances.at(-1)!;
  for (let i = 1; i <= 3; i++) {
    await vi.advanceTimersByTimeAsync(60000);
    w.onmessage({ data: { type: "status", message: `下载进度 ${i * 25}%` } });
  }
  expect(w.terminated).toBe(false);
  w.onmessage({ data: { type: "ready" } });
  expect(await result).toBe("ready");
  e.close();
  vi.useRealTimers();
});
it("stalled initialization releases the worker after 90 seconds without progress", async () => {
  vi.useFakeTimers();
  class Stalled extends WorkerFake {
    postMessage() {}
  }
  vi.stubGlobal("Worker", Stalled);
  const e = new InferenceEngine();
  const result = e.init().catch((err) => err.message);
  await vi.advanceTimersByTimeAsync(90001);
  expect(await result).toContain("超时");
  expect(WorkerFake.instances.at(-1)!.terminated).toBe(true);
  vi.useRealTimers();
});
it("initialization has a ten-minute cap even while status keeps arriving", async () => {
  vi.useFakeTimers();
  class Endless extends WorkerFake {
    postMessage() {}
  }
  vi.stubGlobal("Worker", Endless);
  const e = new InferenceEngine();
  const result = e.init().catch((err) => err.message);
  const w = WorkerFake.instances.at(-1)!;
  for (let i = 0; i < 10; i++) {
    await vi.advanceTimersByTimeAsync(59000);
    w.onmessage({ data: { type: "status", message: "正在下载…" } });
  }
  await vi.advanceTimersByTimeAsync(10001);
  expect(await result).toContain("10 分钟");
  expect(w.terminated).toBe(true);
  vi.useRealTimers();
});
