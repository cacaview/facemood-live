import { describe, it, expect } from "vitest";
import {
  softmax,
  cropBox,
  grayscale,
  displayPrediction,
  RollingMetrics,
  labels,
  SingleFlight,
  smoothBox,
} from "./core";
describe("inference contract", () => {
  it("stable softmax and rejects corrupt output", () => {
    expect(softmax([1000, 1000])).toEqual([0.5, 0.5]);
    expect(() => softmax([NaN])).toThrow();
  });
  it("crops to image without stretching outside bounds", () => {
    expect(
      cropBox({ originX: -5, originY: 10, width: 30, height: 50 }, 40, 40),
    ).toEqual({ x: 0, y: 10, width: 25, height: 30 });
    expect(
      cropBox({ originX: 50, originY: 0, width: 2, height: 2 }, 40, 40),
    ).toBeNull();
  });
  it("raw grayscale uses RGB without normalization", () => {
    expect(grayscale(new Uint8ClampedArray([255, 0, 0, 255]))[0]).toBeCloseTo(
      76.245,
      3,
    );
  });
  it("does not infer from an absent face or low confidence", () => {
    expect(displayPrediction(null)).toBe("未检测到人脸");
    expect(displayPrediction([0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])).toBe(
      "无法确定",
    );
    expect(displayPrediction([0, 1, 0, 0, 0, 0, 0, 0])).toBe(labels[1]);
  });
  it("evicts metrics outside 60 seconds and computes real completed fps", () => {
    let m = new RollingMetrics();
    m.add(0, 100);
    m.add(1000, 200);
    expect(m.summary(1000).p95).toBe(200);
    expect(m.summary(62000).count).toBe(0);
  });
  it("drops busy requests and releases after failure", async () => {
    let gate = new SingleFlight();
    let release!: () => void;
    let p = gate.run(() => new Promise<void>((r) => (release = r)));
    expect(await gate.run(async () => 1)).toBeUndefined();
    release();
    await p;
    await expect(
      gate.run(async () => {
        throw Error("worker");
      }),
    ).rejects.toThrow();
    expect(await gate.run(async () => 2)).toBe(2);
    expect(gate.dropped).toBe(1);
  });
});
it("smooths nearby display boxes but resets on a large face jump", () => {
  expect(
    smoothBox(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 2, y: 2, width: 10, height: 10 },
    ),
  ).toEqual({ x: 1, y: 1, width: 10, height: 10 });
  expect(
    smoothBox(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 100, y: 100, width: 10, height: 10 },
    ),
  ).toEqual({ x: 100, y: 100, width: 10, height: 10 });
});
