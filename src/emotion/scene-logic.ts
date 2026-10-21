import type { EmotionLabel } from "./controller";

export type QualityPreset = "low" | "medium" | "high";
export const QUALITY_PRESETS: Record<QualityPreset, {
  particles: number;
  dpr: number;
  fieldSize: number;
  bloom: boolean;
}> = {
  low: { particles: 1000, dpr: 1, fieldSize: 64, bloom: false },
  medium: { particles: 3000, dpr: 1.25, fieldSize: 64, bloom: false },
  high: { particles: 8000, dpr: 1.5, fieldSize: 128, bloom: true },
};

export function transitionProgress(startedAt: number, now: number, duration: number) {
  return Math.max(0, Math.min(1, (now - startedAt) / Math.max(1, duration)));
}

export class EmotionTransition {
  incoming: EmotionLabel | null = null;
  pending: EmotionLabel | null = null;
  private startedAt = 0;

  constructor(
    public current: EmotionLabel,
    private duration = 1000,
  ) {}

  setDuration(duration: number, now: number) {
    const nextDuration = Math.max(1, duration);
    if (this.incoming) {
      const currentProgress = this.progress(now);
      this.startedAt = now - currentProgress * nextDuration;
    }
    this.duration = nextDuration;
  }

  request(label: EmotionLabel, now: number): boolean {
    if (this.incoming) {
      if (label === this.incoming) this.pending = null;
      else this.pending = label;
      return false;
    }
    if (label === this.current) return false;
    this.incoming = label;
    this.startedAt = now;
    return true;
  }

  progress(now: number) {
    return this.incoming
      ? transitionProgress(this.startedAt, now, this.duration)
      : 0;
  }

  advance(now: number): EmotionLabel | null {
    if (!this.incoming || this.progress(now) < 1) return null;
    this.current = this.incoming;
    this.incoming = null;
    const completed = this.current;
    const next = this.pending;
    this.pending = null;
    if (next && next !== this.current) {
      this.incoming = next;
      this.startedAt = now;
    }
    return completed;
  }
}
