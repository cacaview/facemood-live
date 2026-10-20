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
afterEach(() => vi.unstubAllGlobals());
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
