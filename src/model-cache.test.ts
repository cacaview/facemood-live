import { it, expect, vi } from "vitest";
import { loadModel, type ModelStore } from "./model-cache";
const bytes = new Uint8Array([1, 2, 3]).buffer;
const sha = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
const spec = { key: "expression", path: "/model.onnx", sha256: sha };
function store(initial?: any) {
  let value = initial;
  return {
    get: async (_key: string) => value,
    put: async (_key: string, next: any) => {
      value = next;
    },
  } satisfies ModelStore;
}
it("downloads and verifies once, then reuses saved model", async () => {
  const s = store();
  const fetcher = vi.fn(async () => new Response(bytes));
  await loadModel(spec, s, fetcher);
  await loadModel(spec, s, fetcher);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("checks new SHA and retains previous model if update is invalid", async () => {
  const prior = { sha256: "old", bytes };
  const s = store(prior);
  await expect(
    loadModel(spec, s, async () => new Response(new Uint8Array([9]))),
  ).rejects.toThrow("校验失败");
  expect(await s.get("expression")).toBe(prior);
});
it("refreshes corrupted cached bytes", async () => {
  const s = store({ sha256: sha, bytes: new Uint8Array([0]).buffer });
  const f = vi.fn(async () => new Response(bytes));
  await loadModel(spec, s, f);
  expect(f).toHaveBeenCalledTimes(1);
});
it("still runs validated download when storage is unavailable", async () => {
  const s = {
    get: async () => {
      throw Error("blocked");
    },
    put: async () => {
      throw Error("quota");
    },
  };
  expect(await loadModel(spec, s, async () => new Response(bytes))).toEqual(
    bytes,
  );
});
it("replaces local version only after a valid update completes", async () => {
  const s = store({ sha256: "old-version", bytes: new Uint8Array([0]).buffer });
  await loadModel(spec, s, async () => new Response(bytes));
  expect((await s.get("expression"))?.sha256).toBe(sha);
});
