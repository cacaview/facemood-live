# Emotion Ecosystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add three distinct interactive 3D emotion entities to the existing FaceMood page while preserving its camera, inference, metrics and export flows.

**Architecture:** Add an isolated Three.js scene mounted in the current page, fed by read-only inference state and a testable controller. One WebGL2 renderer draws independently modeled entities and particles driven by a shared decaying pointer flow field; renderer failures degrade locally.

**Tech Stack:** Vue 3, TypeScript, Three.js, Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-emotion-ecosystem-design.md`

## Global Constraints

- Keep work on `codex/emotion-ecosystem-v2`; no production deployment, server/key edits, or V100 use.
- Keep existing camera, worker, ONNX/WASM, face detection, metrics, export, and model update behavior.
- Use active.json label names; phase one builds only neutral, happiness, and anger.
- Use one WebGL2 canvas for 3D body, flow field, and particles.
- Controller initial values: EMA 0.25, entry confidence 0.55, lead 0.12, candidate 250 ms, hold 900 ms, low-confidence idle 700 ms, stale live inference 2000 ms.
- Quality presets: low 1000 particles / DPR 1 / 64 field / no bloom; medium 3000 / DPR 1.25 / 64 / no bloom; high 8000 / DPR 1.5 / 128 / optional bloom.
- No third party GLB assets in phase one. Record Three.js and procedural art in `assets/ATTRIBUTION.md`.
- Desktop 50–60 FPS and mobile 24–30 FPS are targets, never report as measured without device evidence.

## Review Focus

- Missing face or stale live input must return to neutral without disturbing inference; test controller no-face and stale reset.
- Fast alternating classes must not churn entities; test hysteresis, candidate duration, and minimum hold.
- Touch cancellation and pointer release must not leave a permanent force; verify pointer up/cancel/lost-capture in browser interaction checks.
- WebGL absence/context loss must not break app controls; verify local fallback and simulated context loss.
- Rapid page visibility and resizing must not duplicate frame loops or leak resources; verify lifecycle cleanup and resume.

---

### Task 1: Emotion controller and label mapping

**Files:**

- Create: `src/emotion/controller.ts`
- Test: `src/emotion/controller.test.ts`
- Modify: `public/models/active.json` only if a fixture is needed (prefer inline test fixtures)

**Interfaces:**

- `EmotionInput = { probabilities: readonly number[] | null; labels: readonly string[]; faces: number; at: number; live: boolean }`
- `EmotionController.update(input: EmotionInput): string` returns active label or `neutral`.
- `EmotionController.reset(at?: number): void` clears candidate and smoothing state.
- `EmotionController` accepts an optional partial timing/config object for deterministic tests; defaults use global constraint values.

- [x] Write tests for label-index mapping, EMA threshold, candidate duration, minimum hold, low-confidence idle, no-face, stale live input, malformed probabilities, and reset after source change.
- [x] Run `npx vitest run src/emotion/controller.test.ts`; confirm the new tests fail before implementation.
- [x] Implement the pure TypeScript controller without Vue or Three.js dependencies.
- [x] Run `npx vitest run src/emotion/controller.test.ts`; confirm all controller cases pass.
- [x] Commit as `feat: add stable emotion scene controller`.

### Task 2: Three procedural entities and shared flow field

**Files:**

- Modify: `package.json`, `package-lock.json`
- Create: `src/emotion/registry.ts`
- Create: `src/emotion/entities.ts`
- Create: `src/emotion/flow-field.ts`
- Create: `src/emotion/entities.test.ts`
- Create: `src/emotion/flow-field.test.ts`
- Create: `assets/ATTRIBUTION.md`

**Interfaces:**

- `EmotionLabel` is the eight-label string union from active.json.
- `EmotionEntity` exposes `object: THREE.Group`, `update(dt: number, time: number): void`, `onPointerForce(point: THREE.Vector3, velocity: THREE.Vector2): void`, `setOpacity(value: number): void`, and `dispose(): void`.
- `EmotionEntity.setFlowTexture(texture: THREE.Texture): void` binds the shared flow field texture for surface displacement and particle sampling.
- `createEmotionEntity(label: 'neutral' | 'happiness' | 'anger', quality: Quality): EmotionEntity` returns separate topology per label.
- `FlowField` exposes `splat(uv: THREE.Vector2, velocity: THREE.Vector2): void`, `step(dt: number): void`, `sample(uv: THREE.Vector2, out: THREE.Vector2): THREE.Vector2`, and `dispose(): void`.
- `EmotionRegistry` contains all eight labels with implemented flag, palette, quality hints, and an optional future asset URL/license field.

- [x] Write geometry tests asserting each implemented label creates a distinct mesh structure and disposable entity; write flow tests for splat propagation, decay, bounded output, and return to rest.
- [x] Run the two new Vitest files and confirm the tests fail before implementation.
- [x] Add pinned Three.js runtime and compatible types dependencies; implement the registry and procedural neutral layered core, happiness petals, and anger crystal/fragments.
- [x] Implement a bounded CPU flow grid as the portable baseline, injecting Gaussian pointer splats, propagating to neighbors, damping, and returning to rest; provide its data as a texture for the common body/particle shader. Do not claim overall-object movement is a fluid field.
- [x] Document procedural assets and Three.js license/source in `assets/ATTRIBUTION.md`.
- [x] Run the focused entity and flow tests; confirm distinct geometry, bounded decaying perturbation, and resource disposal.
- [x] Commit as `feat: add procedural emotion entities and flow field`.

### Task 3: Single renderer scene, pointer input, transitions, and quality

**Files:**

- Create: `src/emotion/EmotionScene.vue`
- Create: `src/emotion/scene.ts`
- Create: `src/emotion/scene-logic.ts`
- Create: `src/emotion/scene-logic.test.ts` for testable transition/preset helpers

**Interfaces:**

- Component props: `{ label: EmotionLabel; enabled: boolean; reducedMotion: boolean; quality: QualityPreset }`.
- Emits: `ready(fps: number)`, `fallback(message: string)`, `quality-change(quality: QualityPreset)`.
- Scene has `mount(canvas, host)`, `setEmotion(label)`, `setQuality(preset)`, `setReducedMotion(value)`, and idempotent `dispose()`.
- Transition runs 1000 ms cross dissolve; at most two entities are alive, obsolete incoming choices are coalesced.

- [x] Add tests for cross-fade timing, rapid-switch coalescing, at-most-two-entities invariant, and quality preset particle/DPR/field values.
- [x] Implement one WebGL2 renderer and one canvas for entities, particles, field texture and optional high-preset bloom; cap DPR to preset limits.
- [x] Implement Pointer Events, pointer capture, raycast-to-plane, normalized pointer velocity and release/cancel handling; all forces enter FlowField as splats.
- [x] Add resize, visibility pause/resume, reduced-motion behavior, context-lost fallback and context-restore attempt. Ensure idempotent listener/RAF/resource cleanup.
- [x] Verify focused scene helper tests and inspect that scene errors are surfaced only through `fallback`.
- [x] Commit as `feat: render interactive emotion ecosystem scene`.

### Task 4: Integrate with existing page and theme

**Files:**

- Modify: `src/App.vue`
- Modify: `src/style.css`
- Create: `src/emotion/ThemeTokens.ts`
- Create: `src/emotion/presentation.ts`
- Test: `src/emotion/presentation.test.ts`
- Test: `src/emotion/label-contract.test.ts`
- Modify: `tests/e2e/app.spec.ts`
- Create: `tests/e2e/emotion-scene.spec.ts`

**Interfaces:**

- Lazy-load the scene component; props read from the existing probabilities/raw result, face count, and selected preview emotion.
- Manual visual preview selection and auto-cycle change only visual input. They must never write synthetic probabilities to metrics or export records.
- Enable/disable preview and scene availability independently from camera controls.

- [x] Add theme tokens for three phase-one palettes, glass cards, accessible contrast, and gradual theme changes.
- [x] Add the visual section in the current page and responsive styling while retaining camera and results panels.
- [x] Connect true live inference results to the controller; reset on source change/stop. Add explicit preview controls; limit preview modes to the implemented three labels.
- [x] Add local scene failure message and static gradient fallback; confirm camera, status, probabilities and export remain usable with scene disabled or failed.
- [x] Preserve `prefers-reduced-motion` and keyboard access; test narrow layout and reduced motion in browser.
- [x] Commit as `feat: integrate emotion ecosystem into dashboard`.

### Task 5: Browser verification, benchmarks, and rollback record

**Files:**

- Modify: `tests/e2e/emotion-scene.spec.ts`
- Modify: `reports/playwright.json` and responsive UI screenshots from the final browser run
- Create: `reports/emotion-ecosystem-device-matrix.md`
- Create: `reports/emotion-ecosystem-benchmark.md`
- Create: `reports/visual-baseline-manifest.json`
- Create: `scripts/rollback_visual_baseline.mjs`
- Create: `scripts/rollback_visual_baseline.test.mjs`
- Modify: `package.json` to add the visual rollback command

**Interfaces:**

- Rollback restores a captured baseline frontend build/version and validates its recorded digest; it must not reset `active.json` or alter deployment.
- Benchmark report distinguishes existing baseline from branch results, real-device data from automation, cold/hot load, model load, classification throughput, render FPS, chunk size, and observed memory/CPU/GPU.

- [x] Extend browser checks for three scene choices, visible pointer disturbance, reduced motion, simulated context loss fallback/recovery, inference controls and export isolation. Wait for async scene initialization before injecting context events; the context-loss case passed three repeated runs.
- [x] Run `npm test` (44/44), `npm run build`, and `npm run test:e2e` (14/14); retain machine-generated results without replacing historical baseline reports.
- [x] Capture the original frontend build in a SHA-256 manifest, verify the digest and exercise rollback in a disposable output directory.
- [x] Compare same-machine headless desktop baseline and branch results. Record the SwiftShader limitation and mark iPhone Safari as not tested; the emulated viewport is not presented as a phone measurement.
- [x] Update benchmark/device records with measured environment and unmeasured limits; commit as `test: document emotion scene verification and rollback`.

## Self-review

Coverage maps the design's controller, entities, flow, single renderer, interaction, transitions, quality, reduced motion, theme, integration isolation, license record, performance measurement, and rollback requirements across Tasks 1–5. Review Focus failures map to controller tests, flow tests, scene lifecycle tests, and end-to-end fallback checks. Types remain consistent across `EmotionLabel`, `EmotionInput`, `EmotionEntity`, `FlowField`, scene props, and emitted events. Real iPhone evidence remains a phase gate; implementation may produce a desktop demo, but eight-shape expansion/merge must wait for actual device acceptance.
