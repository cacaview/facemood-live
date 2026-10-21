import { describe, expect, it } from "vitest";
import { Mesh, Vector2, Vector3 } from "three";
import { createEmotionEntity } from "./entities";

function geometryTypes(label: "neutral" | "happiness" | "anger") {
  const entity = createEmotionEntity(label, "low");
  const types: string[] = [];
  entity.object.traverse((child) => {
    if (child instanceof Mesh) types.push(child.geometry.type);
  });
  entity.dispose();
  return types.sort();
}

describe("procedural emotion entities", () => {
  it("uses visibly different mesh structures for the three emotions", () => {
    const neutral = geometryTypes("neutral");
    const happiness = geometryTypes("happiness");
    const anger = geometryTypes("anger");
    expect(neutral.length).toBeGreaterThanOrEqual(3);
    expect(happiness.length).toBeGreaterThanOrEqual(7);
    expect(anger.length).toBeGreaterThanOrEqual(5);
    expect(new Set([neutral.join("/"), happiness.join("/"), anger.join("/")]).size).toBe(3);
    expect(happiness).toContain("BufferGeometry");
    expect(anger).toContain("IcosahedronGeometry");
  });

  it("releases every owned geometry and material on dispose", () => {
    const entity = createEmotionEntity("anger", "low");
    const disposed = new Set<object>();
    entity.object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.geometry.addEventListener("dispose", () => disposed.add(child.geometry));
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) =>
        material.addEventListener("dispose", () => disposed.add(material)),
      );
    });
    entity.dispose();
    expect(disposed.size).toBeGreaterThan(8);
  });

  it("crossfade opacity changes do not trigger material recompilation", () => {
    const entity = createEmotionEntity("neutral", "low");
    let materialVersion = -1;
    entity.object.traverse((child) => {
      if (child instanceof Mesh) materialVersion = child.material.version;
    });
    entity.setOpacity(0.5);
    let nextVersion = -1;
    entity.object.traverse((child) => {
      if (child instanceof Mesh) nextVersion = child.material.version;
    });
    expect(nextVersion).toBe(materialVersion);
    entity.dispose();
  });

  it("freezes idle rotations in reduced motion while pointer agitation still settles", () => {
    const neutral = createEmotionEntity("neutral", "low");
    const orbit = neutral.object.children.find((child) => child.userData.orbit)!;
    const orbitRotation = orbit.rotation.z;
    neutral.update(1 / 60, 0, 0);
    expect(orbit.rotation.z).toBe(orbitRotation);
    neutral.dispose();

    const anger = createEmotionEntity("anger", "low");
    const shard = anger.object.children.find((child) => child.userData.basePosition)!;
    const base = shard.userData.basePosition as Vector3;
    const basePositionX = base.x;
    anger.onPointerForce(new Vector3(1, 0, 0), new Vector2(1, 0));
    anger.update(1 / 60, 0, 0);
    const disturbedPositionX = shard.position.x;
    const shardRotation = shard.rotation.x;
    expect(disturbedPositionX).not.toBeCloseTo(basePositionX, 3);
    for (let frame = 0; frame < 240; frame++) anger.update(1 / 60, 0, 0);
    expect(shard.rotation.x).toBe(shardRotation);
    expect(shard.position.x).toBeCloseTo(basePositionX, 2);
    anger.dispose();
  });
});
