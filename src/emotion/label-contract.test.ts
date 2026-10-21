import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { modelEmotionLabels } from "../core";

describe("visual labels follow the active model label order", () => {
  it("keeps each probability index aligned with active.json", () => {
    const active = JSON.parse(
      readFileSync(new URL("../../public/models/active.json", import.meta.url), "utf8"),
    );
    expect(modelEmotionLabels).toEqual(active.output.labels);
  });
});
