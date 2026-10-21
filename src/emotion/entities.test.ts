import { describe, expect, it } from "vitest";
import { Matrix4, Mesh, Points, ShaderMaterial, Vector2, Vector3 } from "three";
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
  it("does not apply the flower core's breathing scale a second time to surface particles", () => {
    const entity = createEmotionEntity("happiness", "low");
    const cloud = entity.object.children.find(
      (child) => child instanceof Points,
    ) as Points;
    entity.update(1 / 60, 1);
    expect(cloud.scale.toArray()).toEqual([1, 1, 1]);
    entity.dispose();
  });
  it("keeps surface particles attached to dispersing fragments as they settle", () => {
    const entity = createEmotionEntity("anger", "low");
    const cloud = entity.object.children.find(
      (child) => child instanceof Points,
    ) as Points;
    const parts = cloud.geometry.getAttribute("aPart");
    expect(parts).toBeDefined();
    const index = Array.from(parts.array).findIndex((part) => part === 1);
    expect(index).toBeGreaterThanOrEqual(0);
    const original = new Vector3().fromBufferAttribute(
      cloud.geometry.getAttribute("position"),
      index,
    );
    const material = cloud.material as ShaderMaterial;
    const position = () =>
      original
        .clone()
        .applyMatrix4((material.uniforms.uParts!.value as Matrix4[])[1]!);
    entity.onPointerForce(new Vector3(1, 0, 0), new Vector2(3, 0));
    entity.update(1 / 60, 0, 0);
    expect(position().distanceTo(original)).toBeGreaterThan(0.01);
    for (let frame = 0; frame < 240; frame++) entity.update(1 / 60, 0, 0);
    expect(position().distanceTo(original)).toBeLessThan(0.002);
    entity.dispose();
  });
  it("builds the sculpture itself from a bounded, quality-scaled surface particle cloud", () => {
    for (const label of ["neutral", "happiness", "anger"] as const) {
      const counts: number[] = [];
      for (const quality of ["low", "medium", "high"] as const) {
        const entity = createEmotionEntity(label, quality);
        const cloud = entity.object.children.find(
          (child) => child instanceof Points,
        ) as Points;
        expect(
          cloud,
          `${label}/${quality} needs particles on its own surface`,
        ).toBeDefined();
        const positions = cloud.geometry.getAttribute("position");
        counts.push(positions.count);
        cloud.geometry.computeBoundingBox();
        const size = cloud.geometry.boundingBox!.getSize(new Vector3());
        expect(size.x).toBeGreaterThan(1);
        expect(size.y).toBeGreaterThan(1);
        expect(size.length()).toBeLessThan(8);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        entity.dispose();
      }
      expect(counts[0]).toBeGreaterThanOrEqual(4000);
      expect(counts[1]).toBeGreaterThan(counts[0]!);
      expect(counts[2]).toBeGreaterThan(counts[1]!);
      expect(counts[2]).toBeLessThanOrEqual(22000);
    }
  });
  it("uses visibly different mesh structures for the three emotions", () => {
    const neutral = geometryTypes("neutral");
    const happiness = geometryTypes("happiness");
    const anger = geometryTypes("anger");
    expect(neutral.length).toBeGreaterThanOrEqual(3);
    expect(happiness.length).toBeGreaterThanOrEqual(7);
    expect(anger.length).toBeGreaterThanOrEqual(5);
    expect(
      new Set([neutral.join("/"), happiness.join("/"), anger.join("/")]).size,
    ).toBe(3);
    expect(happiness).toContain("BufferGeometry");
    expect(anger).toContain("IcosahedronGeometry");
  });

  it("releases every owned geometry and material on dispose", () => {
    const entity = createEmotionEntity("anger", "low");
    const disposed = new Set<object>();
    entity.object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.geometry.addEventListener("dispose", () =>
        disposed.add(child.geometry),
      );
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
    const orbit = neutral.object.children.find(
      (child) => child.userData.orbit,
    )!;
    const orbitRotation = orbit.rotation.z;
    neutral.update(1 / 60, 0, 0);
    expect(orbit.rotation.z).toBe(orbitRotation);
    neutral.dispose();

    const anger = createEmotionEntity("anger", "low");
    const shard = anger.object.children.find(
      (child) => child.userData.basePosition,
    )!;
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
