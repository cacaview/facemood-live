import { it, expect } from "vitest";
import { appAsset } from "./asset-url";
it("supports root and nested deployments without escaping to the existing site", () => {
  expect(appAsset("/models/active.json", "https://example.com/facemood/")).toBe(
    "https://example.com/facemood/models/active.json",
  );
  expect(appAsset("/vendor/ort/", "http://localhost:4173/")).toBe(
    "http://localhost:4173/vendor/ort/",
  );
});
