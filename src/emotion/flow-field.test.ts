import { describe, expect, it } from "vitest";
import { Vector2 } from "three";
import { FlowField } from "./flow-field";

describe("FlowField", () => {
  it("keeps repeated fast diagonal gestures local and below a safe accumulated speed", () => {
    const field = new FlowField(64);
    for (let event = 0; event < 300; event++) {
      field.splat(new Vector2(0.5, 0.5), new Vector2(100, 100));
      field.step(1 / 120);
    }
    const center = field.sample(new Vector2(0.5, 0.5), new Vector2());
    expect(center.length()).toBeGreaterThan(0.02);
    expect(center.length()).toBeLessThanOrEqual(0.18);
    expect(
      field.sample(new Vector2(0.7, 0.5), new Vector2()).length(),
    ).toBeLessThan(0.005);
    for (let frame = 0; frame < 240; frame++) field.step(1 / 60);
    expect(
      field.sample(new Vector2(0.5, 0.5), new Vector2()).length(),
    ).toBeLessThan(0.002);
    field.dispose();
  });
  it("propagates a pointer splat into nearby cells", () => {
    const field = new FlowField(32);
    const center = new Vector2();
    const neighbor = new Vector2();
    field.splat(new Vector2(0.5, 0.5), new Vector2(1, 0));
    field.step(1 / 60);
    field.sample(new Vector2(0.5, 0.5), center);
    field.sample(new Vector2(0.56, 0.5), neighbor);
    expect(center.x).toBeGreaterThan(0);
    expect(neighbor.x).toBeGreaterThan(0);
  });

  it("damps disturbances back to rest and clamps pointer force", () => {
    const field = new FlowField(32);
    const point = new Vector2();
    field.splat(new Vector2(0.5, 0.5), new Vector2(100, -100));
    field.sample(new Vector2(0.5, 0.5), point);
    expect(Math.abs(point.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(point.y)).toBeLessThanOrEqual(2);
    for (let frame = 0; frame < 240; frame++) field.step(1 / 60);
    field.sample(new Vector2(0.5, 0.5), point);
    expect(point.length()).toBeLessThan(0.01);
    field.dispose();
  });

  it("disposes its GPU upload texture", () => {
    const field = new FlowField(16);
    let disposed = false;
    field.texture.addEventListener("dispose", () => (disposed = true));
    field.dispose();
    expect(disposed).toBe(true);
  });
});
