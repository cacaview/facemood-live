import { describe, expect, it } from "vitest";
import { EmotionTransition, QUALITY_PRESETS, transitionProgress } from "./scene-logic";

describe("emotion scene logic", () => {
  it("uses the documented low, medium, and high budgets", () => {
    expect(QUALITY_PRESETS.low).toEqual({ particles: 1000, dpr: 1, fieldSize: 64, bloom: false });
    expect(QUALITY_PRESETS.medium).toEqual({ particles: 3000, dpr: 1.25, fieldSize: 64, bloom: false });
    expect(QUALITY_PRESETS.high).toEqual({ particles: 8000, dpr: 1.5, fieldSize: 128, bloom: true });
  });

  it("clamps transition progress to a 1000ms crossfade", () => {
    expect(transitionProgress(100, 100, 1000)).toBe(0);
    expect(transitionProgress(100, 600, 1000)).toBe(0.5);
    expect(transitionProgress(100, 1400, 1000)).toBe(1);
  });

  it("keeps crossfade progress continuous when the motion setting changes", () => {
    const transition = new EmotionTransition("neutral", 1000);
    transition.request("happiness", 0);
    expect(transition.progress(500)).toBe(0.5);
    transition.setDuration(180, 500);
    expect(transition.progress(500)).toBe(0.5);
    expect(transition.progress(590)).toBe(1);
    expect(transition.advance(590)).toBe("happiness");
  });

  it("coalesces rapid emotion requests while keeping at most two entities", () => {
    const transition = new EmotionTransition("neutral", 1000);
    expect(transition.request("happiness", 0)).toBe(true);
    expect(transition.request("anger", 200)).toBe(false);
    expect(transition.request("neutral", 400)).toBe(false);
    expect(transition.incoming).toBe("happiness");
    expect(transition.pending).toBe("neutral");
    expect(transition.advance(1000)).toBe("happiness");
    expect(transition.current).toBe("happiness");
    expect(transition.incoming).toBe("neutral");
    expect(transition.pending).toBeNull();
    expect(transition.advance(2000)).toBe("neutral");
    expect(transition.incoming).toBeNull();
  });
});
