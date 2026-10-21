import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshPhysicalMaterial,
  RGBAFormat,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Texture } from "three";
import type { EmotionLabel } from "./controller";
import { EmotionRegistry } from "./registry";
import type { Quality } from "./registry";

export type EmotionEntity = {
  object: Group;
  update(dt: number, time: number): void;
  onPointerForce(point: Vector3, velocity: Vector2): void;
  setFlowTexture(texture: Texture): void;
  setOpacity(value: number): void;
  dispose(): void;
};

const zeroFlowTexture = new DataTexture(
  new Float32Array([0, 0, 0, 1]),
  1,
  1,
  RGBAFormat,
  FloatType,
);
zeroFlowTexture.needsUpdate = true;

type FlowUniforms = {
  flow: { value: Texture };
  time: { value: number };
  agitation: { value: number };
};

function makeMaterial(
  color: string,
  emissive: string,
  opacity: number,
  roughness = 0.28,
  metalness = 0.18,
) {
  const uniforms: FlowUniforms = {
    flow: { value: zeroFlowTexture },
    time: { value: 0 },
    agitation: { value: 1 },
  };
  const material = new MeshPhysicalMaterial({
    color,
    emissive,
    emissiveIntensity: 0.45,
    roughness,
    metalness,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
    transparent: true,
    opacity,
    depthWrite: opacity > 0.95,
  });
  material.userData.baseOpacity = opacity;
  material.userData.flowUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlowMap = uniforms.flow;
    shader.uniforms.uSceneTime = uniforms.time;
    shader.uniforms.uAgitation = uniforms.agitation;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
       attribute vec2 flowUv;
       varying vec2 vFlowUv;
       uniform sampler2D uFlowMap;
       uniform float uSceneTime;
       uniform float uAgitation;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       vFlowUv = flowUv;
       vec4 flowSample = texture2D(uFlowMap, vFlowUv);
       transformed += objectNormal * (flowSample.b * 0.07 + sin(uSceneTime + vFlowUv.y * 6.283) * 0.008) * uAgitation;
       transformed.xz += flowSample.rg * 0.035 * uAgitation;`,
    );
  };
  return material;
}

function addFlowUv(geometry: BufferGeometry) {
  const uv = geometry.getAttribute("uv");
  if (uv)
    geometry.setAttribute(
      "flowUv",
      new BufferAttribute(uv.array.slice(), uv.itemSize),
    );
}

function meshFor(
  geometry: BufferGeometry,
  color: string,
  emissive: string,
  opacity: number,
) {
  addFlowUv(geometry);
  return new Mesh(geometry, makeMaterial(color, emissive, opacity));
}

function createNeutral(group: Group) {
  const specs = [
    { radius: 0.78, color: "#b6d5ed", opacity: 0.24 },
    { radius: 0.6, color: "#87b4d8", opacity: 0.27 },
    { radius: 0.4, color: "#d8efff", opacity: 0.65 },
  ];
  for (const [index, spec] of specs.entries()) {
    const mesh = meshFor(
      new SphereGeometry(spec.radius, 48, 32),
      spec.color,
      "#5180b1",
      spec.opacity,
    );
    mesh.userData.layer = index;
    group.add(mesh);
  }
  for (const tilt of [0, Math.PI / 2]) {
    const ring = meshFor(
      new TorusGeometry(0.96, 0.012, 8, 96),
      "#a3cce8",
      "#5795d0",
      0.44,
    );
    ring.rotation.x = tilt + 0.32;
    ring.userData.orbit = true;
    group.add(ring);
  }
}

function makePetalGeometry() {
  const longitudinal = 24;
  const lateral = 10;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= longitudinal; row++) {
    const along = row / longitudinal;
    const radius = 0.2 + along * 0.68;
    const width = Math.sin(Math.PI * along) * 0.22;
    for (let column = 0; column <= lateral; column++) {
      const side = (column / lateral) * 2 - 1;
      positions.push(
        radius,
        side * width,
        0.02 + Math.sin(Math.PI * along) * (1 - Math.abs(side)) * 0.16,
      );
      uvs.push(along, column / lateral);
    }
  }
  for (let row = 0; row < longitudinal; row++) {
    for (let column = 0; column < lateral; column++) {
      const a = row * (lateral + 1) + column;
      const b = a + lateral + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createHappiness(group: Group) {
  const petalCount = 8;
  for (let index = 0; index < petalCount; index++) {
    const petal = meshFor(
      makePetalGeometry(),
      index % 2 ? "#d99bec" : "#ffc071",
      "#ef9c68",
      0.88,
    );
    const angle = (index / petalCount) * Math.PI * 2;
    petal.rotation.z = angle;
    petal.userData.petal = index;
    group.add(petal);
  }
  const core = meshFor(
    new SphereGeometry(0.24, 32, 24),
    "#ffe1a1",
    "#ffc56e",
    0.94,
  );
  core.position.z = 0.12;
  group.add(core);
}

function createAnger(group: Group) {
  const core = meshFor(
    new IcosahedronGeometry(0.61, 1),
    "#a92f3b",
    "#ff382e",
    0.92,
  );
  core.userData.core = true;
  group.add(core);
  const fragments = [
    [-0.78, 0.28, 0.08],
    [0.74, 0.43, -0.12],
    [-0.52, -0.48, -0.08],
    [0.56, -0.55, 0.14],
    [0.06, 0.83, -0.1],
    [-0.1, -0.82, 0.11],
    [0.84, -0.03, -0.17],
  ];
  fragments.forEach((position, index) => {
    const geometry =
      index % 2
        ? new TetrahedronGeometry(0.19 + (index % 3) * 0.025)
        : new IcosahedronGeometry(0.17 + (index % 3) * 0.025, 0);
    const shard = meshFor(
      geometry,
      index % 2 ? "#ff673d" : "#b73336",
      "#ff4a1f",
      0.94,
    );
    shard.position.set(position[0]!, position[1]!, position[2]!);
    shard.rotation.set(index * 0.41, index * 0.72, index * 0.29);
    shard.userData.basePosition = shard.position.clone();
    shard.userData.phase = index * 1.7;
    group.add(shard);
  });
}

export function createEmotionEntity(
  label: Extract<EmotionLabel, "neutral" | "happiness" | "anger">,
  _quality: Quality,
): EmotionEntity {
  const group = new Group();
  group.name = `emotion-${label}`;
  group.userData.palette = EmotionRegistry[label].palette;
  if (label === "neutral") createNeutral(group);
  else if (label === "happiness") createHappiness(group);
  else createAnger(group);
  group.rotation.x = -0.12;

  let agitation = 0;
  let impulseDirection = new Vector3();
  let opacity = 1;
  const materials: MeshPhysicalMaterial[] = [];
  const geometries: BufferGeometry[] = [];
  group.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    geometries.push(child.geometry);
    materials.push(child.material as MeshPhysicalMaterial);
  });

  return {
    object: group,
    update(dt, time) {
      const step = Math.min(Math.max(dt, 0), 0.05);
      agitation *= Math.exp(-3.1 * step);
      for (const material of materials) {
        const uniforms = material.userData.flowUniforms as FlowUniforms;
        uniforms.time.value = time;
        uniforms.agitation.value = 1 + agitation * 0.45;
      }
      if (label === "neutral") {
        const breath = 1 + Math.sin(time * 1.25) * 0.025;
        group.scale.setScalar(breath);
        group.rotation.y = Math.sin(time * 0.28) * 0.16 + impulseDirection.x * agitation * 0.06;
        group.rotation.z = Math.sin(time * 0.38) * 0.025;
        group.children.forEach((child) => {
          if (child.userData.orbit) child.rotation.z += step * 0.12;
          if (child.userData.layer !== undefined)
            child.rotation.y = Math.sin(time * 0.3 + child.userData.layer) * 0.12;
        });
      } else if (label === "happiness") {
        group.children.forEach((child) => {
          if (child.userData.petal !== undefined) {
            const phase = child.userData.petal as number;
            const open = 0.96 + (Math.sin(time * 1.45 + phase * 0.23) + 1) * 0.055;
            child.scale.set(open, open, 1);
            child.rotation.y = Math.sin(time * 0.72 + phase) * 0.055;
          } else {
            child.scale.setScalar(1 + Math.sin(time * 1.8) * 0.045);
          }
        });
        group.rotation.y = Math.sin(time * 0.3) * 0.1;
      } else {
        group.scale.setScalar(1 + Math.sin(time * 0.82) * 0.015);
        group.rotation.y = Math.sin(time * 0.22) * 0.035;
        group.children.forEach((child) => {
          if (child.userData.basePosition) {
            const base = child.userData.basePosition as Vector3;
            const phase = child.userData.phase as number;
            const spread = 1 + agitation * 0.2;
            child.position.set(
              base.x * spread + impulseDirection.x * agitation * 0.08,
              base.y * spread + Math.sin(time * 0.7 + phase) * 0.012 + impulseDirection.y * agitation * 0.08,
              base.z + impulseDirection.z * agitation * 0.06,
            );
            child.rotation.x += step * 0.05;
          }
        });
      }
    },
    onPointerForce(point, velocity) {
      agitation = Math.min(1.5, agitation + Math.min(velocity.length() * 0.06, 0.7));
      impulseDirection = new Vector3(point.x, point.y, point.z).normalize();
    },
    setFlowTexture(texture) {
      materials.forEach((material) => {
        const uniforms = material.userData.flowUniforms as FlowUniforms;
        uniforms.flow.value = texture;
      });
    },
    setOpacity(value) {
      opacity = Math.max(0, Math.min(1, value));
      materials.forEach((material) => {
        const base = material.userData.baseOpacity as number;
        material.opacity = base * opacity;
        material.depthWrite = opacity > 0.98 && base > 0.95;
        material.needsUpdate = true;
      });
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      group.clear();
    },
  };
}
