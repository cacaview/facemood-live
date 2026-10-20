export class InferenceEngine {
  private worker: Worker | null = null;
  private sequence = 0;
  private waiting = new Map<
    number,
    {
      resolve: (r: any) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      deadline?: ReturnType<typeof setTimeout>;
    }
  >();
  ready = false;
  busy = false;
  dropped = 0;
  submitted = 0;
  async init(onStatus: (message: string) => void = () => {}): Promise<any> {
    this.close();
    this.worker = new Worker(`${import.meta.env.BASE_URL}inference-worker.js`);
    this.worker.onerror = (e) =>
      this.fail(Error(e.message || "推理 Worker 异常，请重试"));
    return new Promise((resolve, reject) => {
      const stalled = () =>
        this.fail(
          Error("模型加载超时：90 秒未收到下载或初始化进度，请检查网络后重试"),
        );
      const timer = setTimeout(stalled, 90000);
      const deadline = setTimeout(
        () => this.fail(Error("模型加载已超过 10 分钟，请检查网络后重试")),
        600000,
      );
      this.waiting.set(0, {
        resolve: (r) => {
          this.ready = true;
          resolve(r);
        },
        reject,
        timer,
        deadline,
      });
      this.worker!.onmessage = ({ data }) => {
        if (data.type === "status") {
          const init = this.waiting.get(0);
          if (init) {
            clearTimeout(init.timer);
            init.timer = setTimeout(stalled, 90000);
          }
          onStatus(data.message);
          return;
        }
        const id = data.type === "ready" ? 0 : data.id;
        const pending = this.waiting.get(id);
        if (data.type === "error") {
          this.fail(Error(data.message));
          return;
        }
        if (pending) {
          clearTimeout(pending.timer);
          clearTimeout(pending.deadline);
          this.waiting.delete(id);
          pending.resolve(data);
        }
      };
      this.worker!.postMessage({ type: "init" });
    });
  }
  private fail(error: Error) {
    this.ready = false;
    for (const p of this.waiting.values()) {
      clearTimeout(p.timer);
      clearTimeout(p.deadline);
      p.reject(error);
    }
    this.waiting.clear();
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }
  close() {
    this.fail(Error("推理已停止"));
  }
  async infer(bitmap: ImageBitmap): Promise<any> {
    this.submitted++;
    if (!this.ready || this.busy) {
      bitmap.close();
      this.dropped++;
      return null;
    }
    this.busy = true;
    try {
      return await this.request("frame", { bitmap }, [bitmap]);
    } finally {
      this.busy = false;
    }
  }
  async fixture(input: number[]): Promise<any> {
    return this.request("fixture", { input });
  }
  private request(
    type: string,
    payload: object,
    transfer: Transferable[] = [],
  ): Promise<any> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(Error("推理超时，请重新加载模型"));
      }, 20000);
      this.waiting.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ type, id, ...payload }, transfer);
    });
  }
}
