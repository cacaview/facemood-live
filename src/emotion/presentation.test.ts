import { describe, expect, it } from "vitest";
import { resolveVisualEmotion } from "./presentation";
import { createThemeTokens } from "./ThemeTokens";

describe("visual emotion selection", () => {
  it("uses detected implemented entities when following the camera", () => {
    expect(resolveVisualEmotion("live", "happiness", "anger")).toBe("happiness");
    expect(resolveVisualEmotion("live", "anger", "happiness")).toBe("anger");
  });

  it("maps unimplemented detected labels to neutral idle", () => {
    for (const label of ["surprise", "sadness", "disgust", "fear", "contempt"] as const)
      expect(resolveVisualEmotion("live", label, "anger")).toBe("neutral");
  });

  it("keeps manual and cycle previews independent from detected probabilities", () => {
    expect(resolveVisualEmotion("manual", "anger", "happiness")).toBe("happiness");
    expect(resolveVisualEmotion("cycle", "anger", "neutral")).toBe("neutral");
  });

  it("builds dashboard theme tokens from the active entity palette", () => {
    const tokens = createThemeTokens("anger");
    expect(tokens["--mood-primary"]).toBe("#ff5949");
    expect(tokens["--mood-secondary"]).toBe("#ff9e37");
    expect(tokens["--mood-background"]).toBe("#26121a");
  });
});
