import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  HemisphereLight,
  LinearFilter,
  NearestFilter,
  PerspectiveCamera,
  Plane,
  PointLight,
  Points,
  Raycaster,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { WebGLRendererParameters } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { EmotionLabel } from "./controller";
import { createEmotionEntity } from "./entities";
import type { EmotionEntity } from "./entities";
import { FlowField } from "./flow-field";
import { EmotionRegistry } from "./registry";
import type { Quality } from "./registry";
import { EmotionTransition, QUALITY_PRESETS } from "./scene-logic";
import type { QualityPreset } from "./scene-logic";

export type EmotionSceneCallbacks = {
  ready(fps: number): void;
  fallback(message: string): void;
  qualityChange(quality: QualityPreset): void;
};

function meshForParticles(count: number, material: ShaderMaterial) {
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const phases = new Float32Array(count);
  let seed = 0x4f1bbcdc;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < count; index++) {
    const u = random();
    const v = random();
    uvs[index * 2] = u;
    uvs[index * 2 + 1] = v;
    positions[index * 3] = (u - 0.5) * 7.2;
    positions[index * 3 + 1] = (v - 0.5) * 4.5;
    positions[index * 3 + 2] = -0.7 - random() * 1.1;
    phases[index] = random() * Math.PI * 2;
  }
  const pointsGeometry = new BufferGeometry();
  pointsGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  pointsGeometry.setAttribute("aFlowUv", new BufferAttribute(uvs, 2));
  pointsGeometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  return { points: new Points(pointsGeometry, material), geometry: pointsGeometry };
}

function createParticleMaterial(flow: DataTexture, color: string, pixelRatio: number) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uFlowMap: { value: flow },
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uColor: { value: new Color(color) },
    },
    vertexShader: `
      uniform sampler2D uFlowMap;
      uniform float uTime;
      uniform float uPixelRatio;
      attribute vec2 aFlowUv;
      attribute float aPhase;
      varying float vAlpha;
      void main() {
        vec4 flow = texture2D(uFlowMap, aFlowUv);
        vec3 drift = vec3(flow.r, flow.g, 0.0) * 0.24;
        drift += vec3(sin(uTime * 0.31 + aPhase), cos(uTime * 0.27 + aPhase * 1.7), 0.0) * 0.045;
        vec4 viewPosition = modelViewMatrix * vec4(position + drift, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(uPixelRatio * (1.4 + flow.b * 2.3), 1.0, 4.4);
        vAlpha = 0.17 + flow.b * 0.42 + (sin(uTime * 0.4 + aPhase) + 1.0) * 0.035;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 point = gl_PointCoord - vec2(0.5);
        float distanceToCenter = length(point);
        float alpha = (1.0 - smoothstep(0.12, 0.5, distanceToCenter)) * vAlpha;
        if (alpha < 0.012) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

const rendererOptions: Omit<WebGLRendererParameters, "canvas"> = {
  alpha: true,
  powerPreference: "low-power",
  depth: true,
  stencil: false,
};

export class EmotionScene {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(36, 1, 0.1, 60);
  private renderer: WebGLRenderer | null = null;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private flow: FlowField | null = null;
  private particles: Points | null = null;
  private particleMaterial: ShaderMaterial | null = null;
  private active: EmotionEntity | null = null;
  private incoming: EmotionEntity | null = null;
  private readonly transitions = new EmotionTransition("neutral", 1000);
  private quality: QualityPreset;
  private enabled = true;
  private reducedMotion: boolean;
  private disposed = false;
  private failed = false;
  private lost = false;
  private frame = 0;
  private previousTime = 0;
  private animationTime = 0;
  private fpsFrames = 0;
  private fpsStarted = 0;
  private resizeObserver: ResizeObserver | null = null;
  private pointerId: number | null = null;
  private lastPointer: { x: number; y: number; at: number } | null = null;
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly interactionPlane = new Plane(new Vector3(0, 0, 1), 0);
  private readonly interactionPoint = new Vector3();
  private readonly palette: { value: Color };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    quality: QualityPreset,
    reducedMotion: boolean,
    private readonly callbacks: EmotionSceneCallbacks,
  ) {
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.camera.position.set(0, 0, 5.3);
    this.palette = { value: new Color(EmotionRegistry.neutral.palette.primary) };
    this.installListeners();
    try {
      this.initializeRenderer();
      this.initializeContent();
      this.resize();
      this.start();
    } catch (error) {
      this.fail(error);
    }
  }

  private initializeRenderer() {
    const preset = QUALITY_PRESETS[this.quality];
    this.renderer = new WebGLRenderer({
      ...rendererOptions,
      canvas: this.canvas,
      antialias: this.quality !== "low",
    });
    if (!this.renderer.capabilities.isWebGL2)
      throw Error("此设备不支持 WebGL2，已切换为静态视觉背景。");
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.dpr));
    this.flow = new FlowField(preset.fieldSize);
    this.flow.texture.magFilter =
      this.renderer.extensions.has("OES_texture_float_linear")
        ? LinearFilter
        : NearestFilter;
    this.flow.texture.minFilter = this.flow.texture.magFilter;
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
  }

  private initializeContent() {
    this.scene.add(new HemisphereLight("#e0eeff", "#122039", 2.1));
    this.scene.add(new AmbientLight("#7192bb", 0.35));
    const keyLight = new PointLight("#b7ddff", 75, 8);
    keyLight.position.set(-2.4, 2.6, 3.5);
    this.scene.add(keyLight);
    const fill = new PointLight("#ad70df", 32, 7);
    fill.position.set(2.2, -0.8, 2.1);
    this.scene.add(fill);

    this.active = createEmotionEntity("neutral", this.quality as Quality);
    this.active.setFlowTexture(this.flow!.texture);
    this.scene.add(this.active.object);
    this.createParticles();
    this.configureComposer();
  }

  private configureComposer() {
    this.bloomPass?.dispose();
    this.bloomPass = null;
    this.composer?.dispose();
    this.composer = null;
    if (!this.renderer || this.quality !== "high") return;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.42, 0.35, 0.82);
    composer.addPass(this.bloomPass);
    this.composer = composer;
  }

  private createParticles() {
    if (!this.flow) return;
    this.disposeParticles();
    const preset = QUALITY_PRESETS[this.quality];
    this.particleMaterial = createParticleMaterial(
      this.flow.texture,
      EmotionRegistry[this.transitions.current].palette.primary,
      this.renderer?.getPixelRatio() ?? 1,
    );
    const created = meshForParticles(preset.particles, this.particleMaterial);
    this.particles = created.points;
    this.scene.add(this.particles);
  }

  private disposeParticles() {
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles = null;
    }
    this.particleMaterial?.dispose();
    this.particleMaterial = null;
  }

  setEmotion(label: EmotionLabel, now = performance.now()) {
    if (this.failed || this.disposed || !EmotionRegistry[label].implemented) return;
    const before = this.transitions.incoming;
    const started = this.transitions.request(label, now);
    if (!started) return;
    if (before) return;
    this.incoming = createEmotionEntity(label as "neutral" | "happiness" | "anger", this.quality as Quality);
    this.incoming.setFlowTexture(this.flow!.texture);
    this.incoming.setOpacity(0);
    this.scene.add(this.incoming.object);
  }

  setQuality(quality: QualityPreset) {
    if (this.disposed || this.failed || quality === this.quality) return;
    this.quality = quality;
    const oldFlow = this.flow;
    this.flow = new FlowField(QUALITY_PRESETS[quality].fieldSize);
    if (this.renderer) {
      this.flow.texture.magFilter = this.renderer.extensions.has(
        "OES_texture_float_linear",
      )
        ? LinearFilter
        : NearestFilter;
      this.flow.texture.minFilter = this.flow.texture.magFilter;
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[quality].dpr),
      );
    }
    this.active?.setFlowTexture(this.flow.texture);
    this.incoming?.setFlowTexture(this.flow.texture);
    this.createParticles();
    oldFlow?.dispose();
    this.configureComposer();
    this.resize();
    this.callbacks.qualityChange(quality);
  }

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    if (value) this.start();
    else this.stopFrame();
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") {
      this.pointerId = event.pointerId;
      this.canvas.setPointerCapture?.(event.pointerId);
    }
    this.lastPointer = { x: event.clientX, y: event.clientY, at: event.timeStamp };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const isTouch = event.pointerType !== "mouse";
    if (isTouch && this.pointerId !== event.pointerId) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const elapsed = Math.max(8, event.timeStamp - (this.lastPointer?.at ?? event.timeStamp - 16));
    const prior = this.lastPointer ?? { x: event.clientX, y: event.clientY, at: event.timeStamp - elapsed };
    const uv = new Vector2(
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)),
    );
    const velocity = new Vector2(
      ((event.clientX - prior.x) / rect.width / (elapsed / 1000)) * 0.08,
      ((prior.y - event.clientY) / rect.height / (elapsed / 1000)) * 0.08,
    );
    if (velocity.length() > 2) velocity.setLength(2);
    this.flow?.splat(uv, velocity);
    this.pointerNdc.set(uv.x * 2 - 1, uv.y * 2 - 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const point = this.raycaster.ray.intersectPlane(this.interactionPlane, this.interactionPoint);
    if (point) {
      this.active?.onPointerForce(point, velocity);
      this.incoming?.onPointerForce(point, velocity);
    }
    this.lastPointer = { x: event.clientX, y: event.clientY, at: event.timeStamp };
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.pointerId === event.pointerId) this.pointerId = null;
    this.lastPointer = null;
  };

  private readonly onPointerCancel = (event: PointerEvent) => this.onPointerUp(event);

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.stopFrame();
    this.callbacks.fallback("3D 画面遇到图形上下文中断，摄像头和识别仍可继续。");
  };

  private readonly onContextRestored = () => {
    if (this.disposed || this.failed) return;
    try {
      this.lost = false;
      this.configureComposer();
      this.previousTime = 0;
      this.callbacks.ready(0);
      this.start();
    } catch (error) {
      this.fail(error);
    }
  };

  private readonly onVisibility = () => {
    if (document.hidden) {
      this.stopFrame();
      this.previousTime = 0;
    } else {
      this.start();
    }
  };

  private installListeners() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    this.canvas.addEventListener("pointermove", this.onPointerMove, { passive: true });
    this.canvas.addEventListener("pointerup", this.onPointerUp, { passive: true });
    this.canvas.addEventListener("pointercancel", this.onPointerCancel, { passive: true });
    this.canvas.addEventListener("lostpointercapture", this.onPointerCancel, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
  }

  private resize() {
    if (!this.renderer || this.disposed) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    if (this.particleMaterial)
      this.particleMaterial.uniforms.uPixelRatio!.value = this.renderer.getPixelRatio();
  }

  private start() {
    if (
      this.frame ||
      this.disposed ||
      this.failed ||
      this.lost ||
      !this.enabled ||
      document.hidden ||
      !this.renderer
    )
      return;
    this.frame = requestAnimationFrame(this.renderFrame);
  }

  private stopFrame() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private readonly renderFrame = (now: number) => {
    this.frame = 0;
    if (this.disposed || this.failed || this.lost || !this.renderer) return;
    const dt = this.previousTime ? Math.min(0.05, Math.max(0, (now - this.previousTime) / 1000)) : 0;
    this.previousTime = now;
    if (!this.reducedMotion) this.animationTime += dt;
    this.flow?.step(dt);
    this.active?.update(dt, this.animationTime);
    this.incoming?.update(dt, this.animationTime);
    if (this.incoming && this.active) {
      const progress = this.transitions.progress(now);
      const eased = progress * progress * (3 - 2 * progress);
      this.active.setOpacity(1 - eased);
      this.incoming.setOpacity(eased);
      if (progress >= 1) {
        this.scene.remove(this.active.object);
        this.active.dispose();
        this.active = this.incoming;
        this.incoming = null;
        this.active.setOpacity(1);
        this.transitions.advance(now);
        this.palette.value.set(EmotionRegistry[this.transitions.current].palette.primary);
        if (this.particleMaterial)
          (this.particleMaterial.uniforms.uColor!.value as Color).copy(this.palette.value);
        if (this.transitions.incoming) {
          const label = this.transitions.incoming as "neutral" | "happiness" | "anger";
          this.incoming = createEmotionEntity(label, this.quality as Quality);
          this.incoming.setFlowTexture(this.flow!.texture);
          this.incoming.setOpacity(0);
          this.scene.add(this.incoming.object);
        }
      }
    }
    if (this.particleMaterial)
      this.particleMaterial.uniforms.uTime!.value = this.animationTime;
    this.composer ? this.composer.render(dt) : this.renderer.render(this.scene, this.camera);
    this.fpsFrames++;
    if (!this.fpsStarted) this.fpsStarted = now;
    if (now - this.fpsStarted >= 1000) {
      this.callbacks.ready(Math.round((this.fpsFrames * 1000) / (now - this.fpsStarted)));
      this.fpsStarted = now;
      this.fpsFrames = 0;
    }
    this.start();
  };

  private fail(error: unknown) {
    this.failed = true;
    this.stopFrame();
    this.detachListeners();
    const message = error instanceof Error ? error.message : String(error);
    this.callbacks.fallback(`3D 视觉暂不可用：${message}`);
    this.disposeGraphics();
  }

  private disposeGraphics() {
    this.bloomPass?.dispose();
    this.bloomPass = null;
    this.composer?.dispose();
    this.composer = null;
    this.disposeParticles();
    this.active?.dispose();
    this.incoming?.dispose();
    this.active = null;
    this.incoming = null;
    this.flow?.dispose();
    this.flow = null;
    this.renderer?.dispose();
    this.renderer = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopFrame();
    this.detachListeners();
    this.disposeGraphics();
    this.scene.clear();
  }

  private detachListeners() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("lostpointercapture", this.onPointerCancel);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
