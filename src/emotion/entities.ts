import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  Group,
  IcosahedronGeometry,
  Mesh,
  PlaneGeometry,
  AdditiveBlending,
  Color,
  ShaderMaterial,
  RGBAFormat,
  SphereGeometry,
  TetrahedronGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Texture } from "three";
import type { EmotionLabel } from "./controller";
import { EmotionRegistry } from "./registry";
import type { Quality } from "./registry";
import {
  SCULPTURE_PARTICLES,
  sculptureMaterial,
  surfaceParticles,
} from "./sculpture-particles";

export type EmotionEntity = {
  object: Group;
  update(dt: number, time: number, motionScale?: number): void;
  onPointerForce(point: Vector3, velocity: Vector2): void;
  setFlowTexture(texture: Texture): void;
  setPixelRatio(value: number): void;
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

function meshFor(
  geometry: BufferGeometry,
  color: string,
  emissive: string,
  kind: number,
) {
  return new Mesh(
    geometry,
    sculptureMaterial(zeroFlowTexture, color, emissive, kind, false),
  );
}

function createNeutral(group: Group, quality: Quality) {
  // Layered, rippling membranes with an open, off-centre energy core.
  for (let layer = 0; layer < 4; layer++) {
    const geometry = new SphereGeometry(
      1.04 - layer * 0.14,
      quality === "low" ? 32 : quality === "medium" ? 64 : 96,
      quality === "low" ? 20 : quality === "medium" ? 40 : 64,
    );
    const positions = geometry.getAttribute("position");
    const v = new Vector3();
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i);
      const angle = Math.atan2(v.z, v.x);
      const ripple = 1 + Math.sin(angle * 5 + v.y * 4 + layer) * 0.055;
      v.x *= ripple * 1.1;
      v.z *= ripple * 0.72;
      v.y = v.y * 0.9 + Math.sin(angle * 3 + layer * 0.7) * 0.055;
      positions.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    const shell = meshFor(
      geometry,
      layer % 2 ? "#b5cbff" : "#91b4f1",
      "#a48cfa",
      0,
    );
    shell.rotation.set(0.2 + layer * 0.17, layer * 0.5, -0.35 + layer * 0.16);
    shell.userData.layer = layer;
    shell.userData.orbit = true;
    group.add(shell);
  }
}

function makePetalGeometry(quality: Quality) {
  const longitudinal = quality === "low" ? 24 : 48;
  const lateral = quality === "low" ? 10 : 20;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= longitudinal; row++) {
    const along = row / longitudinal;
    const radius = 0.12 + along * 1.26;
    const width = Math.pow(Math.sin(Math.PI * along), 0.8) * 0.3;
    for (let column = 0; column <= lateral; column++) {
      const side = (column / lateral) * 2 - 1;
      positions.push(
        radius,
        side * width,
        Math.sin(along * Math.PI * 1.3) * 0.38 +
          side * side * 0.2 * Math.sin(along * Math.PI) -
          along * along * 0.16,
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

function createHappiness(group: Group, quality: Quality) {
  const petalCount = 11;
  for (let index = 0; index < petalCount; index++) {
    const petal = meshFor(
      makePetalGeometry(quality),
      index % 2 ? "#e8a4f1" : "#ffc884",
      "#bb87ed",
      1,
    );
    const angle = (index / petalCount) * Math.PI * 2;
    petal.rotation.z = angle;
    petal.rotation.y = index % 2 ? 0.22 : -0.18;
    petal.position.z = (index % 3) * -0.07;
    petal.userData.petal = index;
    group.add(petal);
  }
  const core = meshFor(
    new SphereGeometry(0.25, 40, 24),
    "#ffe1a1",
    "#ffc56e",
    1,
  );
  core.position.z = 0.12;
  core.userData.core = true;
  group.add(core);
}

function createAnger(group: Group) {
  const core = meshFor(
    new IcosahedronGeometry(0.68, 1),
    "#a92f3b",
    "#ff382e",
    2,
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
      2,
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
  quality: Quality,
): EmotionEntity {
  const group = new Group();
  group.name = `emotion-${label}`;
  group.userData.palette = EmotionRegistry[label].palette;
  const materialKind = label === "neutral" ? 0 : label === "happiness" ? 1 : 2;
  if (label === "neutral") createNeutral(group, quality);
  else if (label === "happiness") createHappiness(group, quality);
  else createAnger(group);
  group.rotation.x = -0.12;

  let agitation = 0;
  let impulseDirection = new Vector3();
  let opacity = 1;
  const fragmentForces = new Map<
    Mesh,
    { energy: number; direction: Vector3 }
  >();
  group.children.forEach((child) => {
    if (child instanceof Mesh && child.userData.basePosition)
      fragmentForces.set(child, { energy: 0, direction: new Vector3() });
  });
  const materials: ShaderMaterial[] = [];
  const geometries: BufferGeometry[] = [];
  group.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    geometries.push(child.geometry);
    materials.push(child.material as ShaderMaterial);
  });

  const palette = EmotionRegistry[label].palette;
  const cloudMaterial = sculptureMaterial(
    zeroFlowTexture,
    palette.primary,
    palette.secondary,
    materialKind,
    true,
  );
  const surfaces = group.children.filter(
    (child): child is Mesh => child instanceof Mesh,
  );
  const cloud = surfaceParticles(
    surfaces,
    SCULPTURE_PARTICLES[quality],
    cloudMaterial,
  );
  const bindInverses = surfaces.map((mesh) => mesh.matrix.clone().invert());
  group.add(cloud);
  materials.push(cloudMaterial);
  geometries.push(cloud.geometry);

  // A soft single-pass aureole keeps the luminous volume on low/medium without a full-screen bloom pass.
  const auraMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uOpacity: { value: 1 },
      uColor: { value: new Color(palette.secondary) },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uOpacity; uniform vec3 uColor;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float halo = exp(-r * r * 5.0) * (1.0 - smoothstep(0.55, 1.0, r));
        gl_FragColor = vec4(uColor, halo * 0.32 * uOpacity);
      }`,
  });
  const aura = new Mesh(new PlaneGeometry(4.2, 3.6), auraMaterial);
  aura.position.z = -0.9;
  group.add(aura);
  // Aura has no time/flow uniforms; keep it outside the animated surface materials.
  geometries.push(aura.geometry);

  return {
    object: group,
    update(dt, time, motionScale = 1) {
      const step = Math.min(Math.max(dt, 0), 0.05);
      const ambientMotion = Math.max(0, Math.min(1, motionScale));
      agitation *= Math.exp(-3.1 * step);
      for (const material of materials) {
        material.uniforms.uTime!.value = time;
        material.uniforms.uAgitation!.value = agitation;
        material.uniforms.uMotion!.value = ambientMotion;
      }
      if (label === "neutral") {
        const breath = 1 + Math.sin(time * 1.25) * 0.025;
        group.scale.setScalar(breath);
        group.rotation.y =
          Math.sin(time * 0.28) * 0.16 + impulseDirection.x * agitation * 0.018;
        group.rotation.z = Math.sin(time * 0.38) * 0.025;
        group.children.forEach((child) => {
          if (child.userData.orbit)
            child.rotation.z += step * 0.12 * ambientMotion;
          if (child.userData.layer !== undefined)
            child.rotation.y =
              Math.sin(time * 0.3 + child.userData.layer) * 0.12;
        });
      } else if (label === "happiness") {
        group.children.forEach((child) => {
          if (child.userData.petal !== undefined) {
            const phase = child.userData.petal as number;
            const open =
              0.96 + (Math.sin(time * 1.45 + phase * 0.23) + 1) * 0.055;
            child.scale.set(open, open, 1);
            child.rotation.y = Math.sin(time * 0.72 + phase) * 0.055;
          } else if (child.userData.core) {
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
            const force = fragmentForces.get(child as Mesh)!;
            force.energy *= Math.exp(-4 * step);
            const spread = 1 + force.energy * 0.04;
            child.position.set(
              base.x * spread + force.direction.x * force.energy * 0.05,
              base.y * spread +
                Math.sin(time * 0.7 + phase) * 0.012 +
                force.direction.y * force.energy * 0.05,
              base.z + force.direction.z * force.energy * 0.05,
            );
            child.rotation.x += step * 0.05 * ambientMotion;
          }
        });
      }
      surfaces.forEach((mesh, index) => {
        mesh.updateMatrix();
        cloudMaterial.uniforms.uParts!.value[index].multiplyMatrices(
          mesh.matrix,
          bindInverses[index],
        );
      });
    },
    onPointerForce(point, velocity) {
      const local = group.worldToLocal(point.clone());
      const strength = Math.min(0.45, velocity.length());
      const bodyDistance = Math.max(0, local.length() - 1.35);
      const influence = Math.exp((-bodyDistance * bodyDistance) / 0.18);
      agitation = Math.max(agitation, strength * influence);
      impulseDirection.copy(local).normalize();
      const direction = new Vector3(
        velocity.x,
        velocity.y,
        0,
      ).transformDirection(group.matrixWorld.clone().invert());
      for (const [mesh, force] of fragmentForces) {
        const distance = local.distanceTo(
          mesh.userData.basePosition as Vector3,
        );
        const energy =
          strength * Math.exp((-distance * distance) / (2 * 0.35 * 0.35));
        force.energy = Math.max(force.energy, energy);
        if (energy > 0.001) force.direction.copy(direction);
      }
    },
    setFlowTexture(texture) {
      materials.forEach((material) => {
        material.uniforms.uFlowMap!.value = texture;
      });
    },
    setPixelRatio(value) {
      cloudMaterial.uniforms.uPixelRatio!.value = value;
    },
    setOpacity(value) {
      opacity = Math.max(0, Math.min(1, value));
      auraMaterial.uniforms.uOpacity!.value = opacity;
      materials.forEach((material) => {
        material.uniforms.uOpacity!.value = opacity;
      });
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      auraMaterial.dispose();
      group.clear();
    },
  };
}
