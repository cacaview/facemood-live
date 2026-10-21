# Emotion Ecosystem v2 — automated benchmark record

Recorded: 2026-10-21 (Asia/Shanghai)

This is a browser automation observation, not a hardware performance acceptance. The browser reported an ANGLE WebGL2 renderer backed by **SwiftShader (software rendering)**. It does not measure the Mac's physical GPU, and the mobile row below is a viewport emulation rather than an iPhone.

## Environment and method

- Host: macOS 15.8.1, x86_64; Node.js 22.23.3.
- Browser: Playwright 1.56.1, Headless Chromium 141.0.7390.37.
- Baseline source: `aacb7052548d918197d3927cb96a78c524aaf14c`.
- Branch: `codex/emotion-ecosystem-v2`.
- Baseline and branch were served locally in separate Vite preview processes. The benchmark blocked `/models/active.json` to isolate the page and scene renderer from model inference and the existing model download. The reported FPS is the browser animation-frame observation; it is not camera classification throughput.
- WebGL diagnostic: WebGL2 via ANGLE / Vulkan / SwiftShader Device (Subzero). With the scene paused, the desktop page returned to 60 FPS, so the low scene-on result is associated with the software WebGL path in this run.

## Results

| Build / viewport                  | Page animation FPS | Scene FPS | Interpretation                                                                       |
| --------------------------------- | -----------------: | --------: | ------------------------------------------------------------------------------------ |
| Baseline, 1440×900                |                 60 |         — | Existing page, no emotion scene                                                      |
| Branch, 1440×900                  |                 22 |        22 | Scene enabled under SwiftShader; below the desktop target, not a physical-GPU result |
| Branch, 390×844 emulated viewport |                 58 |        58 | Layout/render observation only; does not represent iPhone Safari                     |
| Branch, scene paused, 1440×900    |                 60 |         — | Confirms the app page itself remained responsive in this software-rendered run       |

The scene-on SwiftShader result is a concrete performance issue to check on actual GPUs. Do not infer that the desktop target passes from the emulated mobile row. Reduced quality did not materially change the desktop software-render result in the exploratory run; this is not enough evidence to tune hardware presets.

## Load and inference measurements

| Metric                                 | Result                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Lazy scene JavaScript chunk            | 565.40 KB minified / 141.66 KB gzip                                                                                         |
| Main app JavaScript                    | 39.06 KB gzip                                                                                                               |
| Third-party GLB models                 | None; the three initial forms are procedural                                                                                |
| Existing baseline model size           | 35 MB baseline referenced by the project handover; its network request was deliberately blocked in this isolated render run |
| Cold/hot first usable time             | Not measured in this render-isolation run                                                                                   |
| Model/3D bandwidth contention          | Not measured; no GLB is downloaded, but the lazy Three.js scene chunk is downloaded when the scene mounts                   |
| Classification throughput / latency    | Not measured in this run; model loading was blocked to isolate rendering                                                    |
| CPU, physical GPU, and memory pressure | Not instrumented; the only GPU-path evidence is the browser's SwiftShader renderer report                                   |

Existing inference behavior was covered by the app's Playwright worker/model integration tests, including mapping the worker's happiness result to the flower visual. Those correctness checks are not a new throughput benchmark.

## Functional verification

- Vitest: 44/44 passed.
- Playwright: 14/14 passed in the final run; the context-loss case passed three additional consecutive runs after the test was changed to wait for asynchronous scene initialization.
- Production build and TypeScript checking: passed.
- Visual rollback tests: 3/3 passed; a disposable baseline rebuild matched the recorded SHA-256.

## Acceptance limits

No physical desktop GPU or iPhone Safari session was available for this measurement. The desktop 50–60 FPS and phone 24–30 FPS targets are therefore **not accepted**. No claim is made about first-screen time, the 35 MB model download, real camera FPS, 10/30 minute stability, thermal behavior, memory growth, or GPU utilization. Repeat the measurement on a hardware-accelerated desktop browser and a real iPhone Safari device before expanding the visual phase or claiming the performance targets.
