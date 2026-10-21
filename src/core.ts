export const labels = [
  "中性",
  "开心",
  "惊讶",
  "悲伤",
  "愤怒",
  "厌恶",
  "恐惧",
  "轻蔑",
];
export const modelEmotionLabels = [
  "neutral",
  "happiness",
  "surprise",
  "sadness",
  "anger",
  "disgust",
  "fear",
  "contempt",
] as const;
export type Box = { x: number; y: number; width: number; height: number };
export function softmax(scores: ArrayLike<number>): number[] {
  const xs = Array.from(scores);
  if (!xs.length || xs.some((x) => !Number.isFinite(x)))
    throw Error("模型输出无效");
  const max = Math.max(...xs),
    ex = xs.map((x) => Math.exp(x - max)),
    sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((x) => x / sum);
}
export function cropBox(
  b: { originX: number; originY: number; width: number; height: number },
  w: number,
  h: number,
): Box | null {
  const x = Math.max(0, Math.floor(b.originX)),
    y = Math.max(0, Math.floor(b.originY));
  const right = Math.min(w, Math.ceil(b.originX + b.width)),
    bottom = Math.min(h, Math.ceil(b.originY + b.height));
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}
export function grayscale(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++)
    out[i] =
      0.299 * rgba[i * 4]! +
      0.587 * rgba[i * 4 + 1]! +
      0.114 * rgba[i * 4 + 2]!;
  return out;
}
export function displayPrediction(
  p: number[] | null,
  threshold = 0.45,
): string {
  if (!p) return "未检测到人脸";
  const max = Math.max(...p);
  return max >= threshold ? labels[p.indexOf(max)]! : "无法确定";
}
export function smooth(
  previous: number[] | null,
  next: number[],
  alpha = 0.5,
): number[] {
  return previous
    ? next.map((v, i) => alpha * v + (1 - alpha) * previous[i]!)
    : next;
}
export class SingleFlight {
  busy = false;
  dropped = 0;
  async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (this.busy) {
      this.dropped++;
      return;
    }
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }
}
export class RollingMetrics {
  samples: {
    time: number;
    ms: number;
    detect: number;
    preprocess: number;
    classify: number;
  }[] = [];
  add(time: number, ms: number, detect = 0, preprocess = 0, classify = 0) {
    this.samples.push({ time, ms, detect, preprocess, classify });
    this.prune(time);
  }
  prune(now: number) {
    this.samples = this.samples.filter((s) => now - s.time <= 60000);
  }
  summary(now: number) {
    this.prune(now);
    const a = this.samples,
      n = a.length;
    const sorted = a.map((s) => s.ms).sort((x, y) => x - y);
    const duration = n > 1 ? Math.max(0.001, (now - a[0]!.time) / 1000) : 0;
    return {
      count: n,
      fps: n > 1 ? (n - 1) / duration : 0,
      mean: n ? a.reduce((s, v) => s + v.ms, 0) / n : 0,
      p50: sorted[Math.max(0, Math.ceil(n * 0.5) - 1)] || 0,
      p95: sorted[Math.max(0, Math.ceil(n * 0.95) - 1)] || 0,
      peak: sorted[n - 1] || 0,
      detect: n ? a.reduce((s, v) => s + v.detect, 0) / n : 0,
      preprocess: n ? a.reduce((s, v) => s + v.preprocess, 0) / n : 0,
      classify: n ? a.reduce((s, v) => s + v.classify, 0) / n : 0,
    };
  }
}
export function smoothBox(previous: Box | null, next: Box): Box {
  if (!previous) return next;
  const overlap =
    Math.max(
      0,
      Math.min(previous.x + previous.width, next.x + next.width) -
        Math.max(previous.x, next.x),
    ) *
    Math.max(
      0,
      Math.min(previous.y + previous.height, next.y + next.height) -
        Math.max(previous.y, next.y),
    );
  if (
    overlap /
      Math.max(
        1,
        Math.min(previous.width * previous.height, next.width * next.height),
      ) <
    0.3
  )
    return next;
  return {
    x: (previous.x + next.x) / 2,
    y: (previous.y + next.y) / 2,
    width: (previous.width + next.width) / 2,
    height: (previous.height + next.height) / 2,
  };
}
