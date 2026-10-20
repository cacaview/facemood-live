export type ModelRecord = { sha256: string; bytes: ArrayBuffer };
export interface ModelStore {
  get(key: string): Promise<ModelRecord | undefined>;
  put(key: string, value: ModelRecord): Promise<void>;
}
export type ModelSpec = { key: string; path: string; sha256: string };
async function digest(bytes: ArrayBuffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function loadModel(
  spec: ModelSpec,
  store: ModelStore,
  fetcher: typeof fetch = fetch,
  status: (message: string) => void = () => {},
): Promise<ArrayBuffer> {
  let cached: ModelRecord | undefined;
  try {
    cached = await store.get(spec.key);
  } catch {
    status("本地存储不可用，本次从网站获取模型");
  }
  if (
    cached?.sha256 === spec.sha256 &&
    (await digest(cached.bytes)) === spec.sha256
  ) {
    status("模型版本未变，使用本地模型");
    return cached.bytes;
  }
  status(cached ? "发现模型更新，正在下载并校验…" : "首次使用，正在下载模型…");
  const response = await fetcher(spec.path, { cache: "no-store" });
  if (!response.ok)
    throw Error(`模型文件加载失败（${response.status}），请检查网络后重试`);
  const bytes = await response.arrayBuffer();
  if ((await digest(bytes)) !== spec.sha256)
    throw Error("模型校验失败，未替换原有本地模型，请重试");
  try {
    await store.put(spec.key, { sha256: spec.sha256, bytes });
    status("模型已校验并保存到本地");
  } catch {
    status("模型已校验，但本地保存失败；下次打开将重新下载");
  }
  return bytes;
}
export function browserModelStore(): ModelStore {
  const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("facemood-models", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("models");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error("模型存储被占用"));
  });
  return {
    async get(key) {
      const db = await dbPromise;
      return new Promise((resolve, reject) => {
        const request = db.transaction("models").objectStore("models").get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async put(key, value) {
      const db = await dbPromise;
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction("models", "readwrite");
        tx.objectStore("models").put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
  };
}
