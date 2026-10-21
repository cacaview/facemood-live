import { describe, expect, it } from "vitest";
import { EmotionController, type EmotionInput } from "./controller";

const labels = [
  "neutral",
  "happiness",
  "surprise",
  "sadness",
  "anger",
  "disgust",
  "fear",
  "contempt",
] as const;
const probs = (label: string, confidence = 0.9) => {
  const rest = (1 - confidence) / (labels.length - 1);
  return labels.map((item) => (item === label ? confidence : rest));
};
function input(
  at: number,
  label: string | null,
  options: Partial<EmotionInput> = {},
): EmotionInput {
  return {
    probabilities: label ? probs(label) : null,
    labels,
    faces: label ? 1 : 0,
    at,
    live: true,
    ...options,
  };
}

describe("EmotionController", () => {
  it("maps probabilities through the supplied active model labels", () => {
    const controller = new EmotionController({ emaAlpha: 1 });
    controller.update(input(0, "neutral"));
    controller.update(input(900, "anger"));
    expect(controller.update(input(1200, "anger"))).toBe("anger");
  });

  it("waits for an emotion candidate and minimum hold before switching", () => {
    const controller = new EmotionController({ emaAlpha: 1 });
    expect(controller.update(input(0, "neutral"))).toBe("neutral");
    expect(controller.update(input(900, "happiness"))).toBe("neutral");
    expect(controller.update(input(1100, "happiness"))).toBe("neutral");
    expect(controller.update(input(1200, "happiness"))).toBe("happiness");
  });

  it("smooths noisy probabilities before choosing a candidate", () => {
    const controller = new EmotionController();
    controller.update(input(0, "neutral"));
    controller.update(input(900, "anger"));
    expect(controller.update(input(950, "neutral"))).toBe("neutral");
  });

  it("returns to neutral after sustained low confidence", () => {
    const controller = new EmotionController({ emaAlpha: 1 });
    controller.update(input(0, "neutral"));
    controller.update(input(900, "anger"));
    controller.update(input(1200, "anger"));
    expect(controller.update(input(1300, null, { faces: 1, probabilities: probs("neutral", 0.4) }))).toBe("anger");
    expect(controller.update(input(2000, null, { faces: 1, probabilities: probs("neutral", 0.4) }))).toBe("neutral");
  });

  it("returns to neutral immediately when no face is present", () => {
    const controller = new EmotionController({ emaAlpha: 1 });
    controller.update(input(0, "neutral"));
    controller.update(input(900, "anger"));
    controller.update(input(1200, "anger"));
    expect(controller.update(input(1250, null))).toBe("neutral");
  });

  it("returns to neutral when live inference becomes stale", () => {
    const controller = new EmotionController({ emaAlpha: 1 });
    controller.update(input(0, "neutral"));
    controller.update(input(900, "anger"));
    controller.update(input(1200, "anger"));
    expect(controller.update(input(3201, null, { faces: 1 }))).toBe("neutral");
  });

  it("resets malformed probability input safely", () => {
    const controller = new EmotionController({ emaAlpha: 1 });
    controller.update(input(0, "neutral"));
    expect(
      controller.update(
        input(100, "anger", { probabilities: [Number.NaN] }),
      ),
    ).toBe("neutral");
  });

  it("clears candidate and smoothing state when its source resets", () => {
    const controller = new EmotionController({ emaAlpha: 1 });
    controller.update(input(0, "neutral"));
    controller.update(input(900, "happiness"));
    controller.reset(1000);
    expect(controller.update(input(1100, "happiness"))).toBe("neutral");
    expect(controller.update(input(2000, "happiness"))).toBe("happiness");
    expect(controller.update(input(2200, "happiness"))).toBe("happiness");
  });
});
