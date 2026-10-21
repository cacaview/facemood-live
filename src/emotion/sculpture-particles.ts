import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  Matrix4,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import type { Texture } from "three";
import type { Quality } from "./registry";
import { INTERACTION } from "./interaction";

export const SCULPTURE_PARTICLES: Record<Quality, number> = {
  low: 4000,
  medium: 12000,
  high: 20000,
};

// Both the translucent skin and its surface particles sample the same screen-space field.
const deformation = `
  uniform sampler2D uFlowMap;
  uniform float uTime;
  uniform float uAgitation;
  uniform float uMotion;
  uniform float uKind;
  varying float vEnergy;
  // All ambient deformation happens in world space; injected velocity is in view
  // space. This makes a rotated membrane and its sampled particles respond alike.
  vec3 deform(vec3 local, vec3 localNormal) {
    vec3 p = (modelMatrix * vec4(local, 1.0)).xyz;
    vec3 n = normalize(mat3(modelMatrix) * localNormal);
    vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
    vec2 fieldUv = clip.xy / clip.w * 0.5 + 0.5;
    vec4 field = texture2D(uFlowMap, clamp(fieldUv, 0.0, 1.0));
    field *= mix(0.3, 1.0, uMotion);
    float t = uTime * 0.35;
    float wave = sin(p.y * 4.0 + t * 1.7 + sin(p.x * 3.0 - t))
               * cos(p.z * 3.0 - t + p.x * 1.8);
    float fine = sin(p.x * 15.0 + p.y * 9.0 + t * 2.0) * 0.008;
    float breath = sin(uTime * 0.8) * 0.026 * uMotion;
    p += n * (wave * 0.065 * uMotion + fine * uMotion + breath);
    if (uKind > 0.5 && uKind < 1.5) {
      float edge = smoothstep(0.12, 1.4, length(p.xy));
      p.xy *= 1.0 + sin(uTime * 0.6 - length(p.xy) * 1.8) * 0.045 * uMotion * edge;
      p.z += edge * sin(uTime * 0.6 + length(p.xy) * 2.0) * 0.1 * uMotion;
    }
    vec3 view = (viewMatrix * vec4(p, 1.0)).xyz;
    vec3 force = vec3(field.rg * ${INTERACTION.surfaceGain.toFixed(3)}, 0.0);
    force += normalize(normalMatrix * localNormal) * field.b * ${INTERACTION.normalGain.toFixed(3)};
    force.z += sin(p.y * 6.0 + p.x * 4.0 + uTime) * field.b * ${INTERACTION.depthGain.toFixed(3)};
    // A final vector cap protects the silhouette even if the simulation saturates.
    float offsetLimit = ${INTERACTION.maxSurfaceOffset.toFixed(3)} * mix(0.3, 1.0, uMotion);
    force *= min(1.0, offsetLimit / max(length(force), 0.00001));
    view += force;
    vEnergy = clamp(field.b * 2.0 + uAgitation * 0.25, 0.0, 1.0);
    return view;
  }

`;

export function sculptureMaterial(
  flow: Texture,
  primary: string,
  secondary: string,
  kind: number,
  particles: boolean,
) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: {
      uFlowMap: { value: flow },
      uTime: { value: 0 },
      uAgitation: { value: 0 },
      uMotion: { value: 1 },
      uKind: { value: kind },
      uOpacity: { value: 1 },
      uPrimary: { value: new Color(primary) },
      uSecondary: { value: new Color(secondary) },
      uPixelRatio: { value: 1 },
      uParts: { value: Array.from({ length: 16 }, () => new Matrix4()) },
    },
    vertexShader: particles
      ? `
      ${deformation}
      uniform float uPixelRatio;
      attribute float aSeed;
      attribute float aPart;
      uniform mat4 uParts[16];
      varying float vSeed;
      varying float vDepth;
      void main() {
        mat4 part = uParts[int(aPart)];
        vec3 surfaceNormal = normalize(mat3(part) * normal);
        vec3 p = deform((part * vec4(position, 1.0)).xyz, surfaceNormal);
        // Advection is strongest in the wisps, with an anchored surface underneath.
        p += normalize(normalMatrix * surfaceNormal) * sin(uTime * 0.4 + aSeed * 40.0) * 0.025 * uMotion;
        vec4 view = vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp((2.0 + aSeed * 1.8 + vEnergy * 0.8) * uPixelRatio * 5.0 / -view.z, 0.8, 4.0);
        vSeed = aSeed;
        vDepth = clamp(1.6 + view.z * 0.14, 0.35, 1.0);
      }
    `
      : `
      ${deformation}
      varying vec2 vUv;
      varying float vRim;
      void main() {
        vec3 p = deform(position, normal);
        vec4 view = vec4(p, 1.0);
        vRim = pow(1.0 - abs(dot(normalize(normalMatrix * normal), normalize(-view.xyz))), 2.6);
        vUv = uv;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: particles
      ? `
      uniform vec3 uPrimary;
      uniform vec3 uSecondary;
      uniform float uOpacity;
      varying float vSeed;
      varying float vDepth;
      varying float vEnergy;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = dot(p, p);
        if (r > 0.25) discard;
        float glow = exp(-r * 17.0) * 0.36 + exp(-r * 95.0) * 0.6;
        vec3 color = mix(uPrimary, uSecondary, smoothstep(0.15, 0.95, vSeed));
        color = mix(color, vec3(0.85, 0.92, 1.0), vSeed * 0.22);
        gl_FragColor = vec4(color * (1.55 + vEnergy * 0.4), glow * vDepth * uOpacity * 0.85);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
      : `
      uniform vec3 uPrimary;
      uniform vec3 uSecondary;
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vRim;
      varying float vEnergy;
      void main() {
        float ripple = sin(vUv.y * 37.0 + sin(vUv.x * 16.0) * 2.0);
        float filaments = pow(0.5 + 0.5 * sin(vUv.x * 560.0 + ripple * 7.0 + sin(vUv.y * 53.0) * 3.0), 20.0);
        float veins = pow(0.5 + 0.5 * sin(vUv.y * 210.0 + sin(vUv.x * 24.0) * 3.0), 28.0);
        vec3 color = mix(uPrimary, uSecondary, vUv.y * 0.65 + vRim * 0.35);
        float skin = 0.009 + vRim * 0.12 + filaments * 0.055 + veins * 0.025;
        gl_FragColor = vec4(color * (1.0 + vEnergy * 0.4), skin * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// Area-weighted triangle sampling, rather than a starfield around an opaque mesh.
// Each emotion retains its own topology, including separate shells/petals/fragments.
export function surfaceParticles(
  meshes: Mesh[],
  count: number,
  material: ShaderMaterial,
) {
  const triangles: {
    a: Vector3;
    b: Vector3;
    c: Vector3;
    n: Vector3;
    area: number;
    part: number;
  }[] = [];
  let totalArea = 0;
  for (const [part, mesh] of meshes.entries()) {
    mesh.updateMatrix();
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.index;
    const length = index?.count ?? position.count;
    for (let offset = 0; offset < length; offset += 3) {
      const vertex = (i: number) =>
        new Vector3()
          .fromBufferAttribute(position, index ? index.getX(i) : i)
          .applyMatrix4(mesh.matrix);
      const a = vertex(offset),
        b = vertex(offset + 1),
        c = vertex(offset + 2);
      const n = new Vector3()
        .subVectors(b, a)
        .cross(new Vector3().subVectors(c, a));
      const area = n.length() / 2;
      if (area < 1e-10) continue;
      totalArea += area;
      triangles.push({ a, b, c, n: n.normalize(), area: totalArea, part });
    }
  }
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const parts = new Float32Array(count);
  let seed = 0x87a16b;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const p = new Vector3();
  for (let i = 0; i < count; i++) {
    const target = random() * totalArea;
    let lo = 0,
      hi = triangles.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (triangles[mid]!.area < target) lo = mid + 1;
      else hi = mid;
    }
    const triangle = triangles[lo]!;
    const root = Math.sqrt(random()),
      v = random();
    p.copy(triangle.a)
      .multiplyScalar(1 - root)
      .addScaledVector(triangle.b, root * (1 - v))
      .addScaledVector(triangle.c, root * v);
    // A minority of particles hover off the membrane, softening the silhouette.
    p.addScaledVector(
      triangle.n,
      (random() - 0.35) * (i % 5 === 0 ? 0.22 : 0.025),
    );
    p.toArray(positions, i * 3);
    triangle.n.toArray(normals, i * 3);
    seeds[i] = random();
    parts[i] = triangle.part;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  geometry.setAttribute("aPart", new BufferAttribute(parts, 1));
  const points = new Points(geometry, material);
  points.name = "sculpture-surface-particles";
  return points;
}
