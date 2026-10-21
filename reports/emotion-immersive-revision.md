# Immersive particle revision — 2026-10-21

Branch: `codex/emotion-ecosystem-v2`. Previous visual revision: `745e7e9`.

The user supplied a video and approved a full-screen composition with floating glass observation panels. This revision changes the existing page, without a separate demo route or third-party model download.

## Implementation

- Neutral: four rippling, translucent energy membranes. Happiness: eleven curled petals with a luminous centre. Anger: a faceted core and seven independent fragments.
- Each sculpture has its own area-weighted surface particle cloud, filament material and soft aureole. Part matrices attach particles to moving petals, shells and fragments. Shared deformation uses world coordinates and injects field velocity in view coordinates.
- Pointer and touch velocity enter the existing bounded, diffusing and decaying field. Surface particles and membranes sample it together. Reduced motion freezes idle and reduces direct disturbance to 30%; settling continues.
- One WebGL canvas. Medium/low use local point-sprite glow and a single aureole; high adds the existing bloom pass. The camera/worker/model/export source paths were retained.
- Desktop observation panels float over the stage. Narrow screens show the observation cards below the stage and offer a camera jump link, so users need not swipe across the interactive canvas to reach controls.

| Quality | Surface particles | Field particles | Steady total | Crossfade peak | DPR cap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low (touch default) | 4,000 | 1,000 | 5,000 | 9,000 | 1 |
| Medium | 12,000 | 3,000 | 15,000 | 27,000 | 1.25 |
| High | 20,000 | 8,000 | 28,000 | 48,000 | 1.5 |

Low also reduces shell/petal subdivisions. Quality changes release/rebuild only visual entities and field resources. The inference worker retains its original lifecycle.

## Verification

- Vitest: 49 passed.
- Production TypeScript/build: passed. Lazy Three.js scene: 566.18 KB minified / 142.68 KB gzip; main app: 39.39 KB gzip. Vite retains its large-chunk advisory for the lazy scene.
- Targeted browser regression: high → low → medium quality and an injected runtime rendering exception both passed after first reproducing the defects.
- Visual rollback tests: 4 passed.
- Independent code review found two particle/membrane alignment defects; both fixed and re-reviewed. The shallow engine reference and local runtime-error boundary were also reviewed without further findings.
- Browser regression: all 9 existing app cases passed in the final full run; after correcting model-readiness assumptions, the complete 10-case visual suite passed in a dedicated rerun (2.2 minutes). This includes responsive floating panels, three-form preview/cycling, reduced motion, pointer and synthetic touch, quality changes, runtime fallback, context recovery and export isolation. All 19 distinct cases passed on the unchanged final production build; these results are from the full run plus the visual rerun, not a claim that the earlier full command had zero failures.

Two full browser runs exposed the same test timing assumption in different cases: one visual-switch assertion, then one pause assertion checked camera enablement while ONNX was still initializing (16/17 and 18/19 otherwise passed). These assertions now explicitly wait for independent model readiness before applying visual operations, using the same policy as the existing model integration tests. The three camera-availability visual cases share that readiness helper; the visual suite was then rerun.

## Performance evidence and limits

The live Codex in-app browser at its native narrow viewport (approximately 506×712) displayed 60 FPS during medium neutral and high happiness visual checks with inference idle. These are UI observations at that viewport; physical GPU identity, sustained load, concurrent camera throughput and pressure metrics were not measured.

Interim headless desktop smoke checks at 1440×1000 displayed 7–12 FPS on the software-rendered browser path. The final automated local-sample screenshot at the test default desktop viewport displays 5 scene FPS / 6 page FPS, and one completed classification with 1218 ms latency. A single classification does not establish throughput or a meaningful latency percentile. They are evidence that this path remains below target, not a hardware performance acceptance. The earlier benchmark document describes the previous visual revision and must not be read as measurements of this new full-screen scene.

Real iPhone Safari, verified physical-GPU full-screen desktop, cold/hot first usable time, 35 MB model bandwidth contention, classification throughput under sustained 3D load, memory growth and thermal/GPU pressure remain unmeasured. Automated layout and synthetic touch checks do not substitute for these devices. Only the three approved prototypes are implemented; the remaining five labels retain neutral fallback.

## Recovery

Pause 3D immediately releases the scene while preserving the observation interface. Renderer exceptions now trigger local fallback and resource disposal; context loss/recovery retains its existing handling. No deployment, merge, server configuration or credential change was performed. The existing independently saved baseline and `npm run rollback:visual` procedure remain available; the prior visual source is retained at `745e7e9`.

## Screenshot artifacts

- [Desktop with the existing local sample and working recognition](emotion-immersive-desktop.png). This is an automated software-rendering screenshot, not a desktop performance pass.
- [390 px viewport layout](emotion-immersive-mobile.png). This is viewport emulation, not iPhone Safari.

## Subsequent user-authorized server test deployment

On 2026-10-21 the user explicitly requested deployment for other people to test. The earlier no-deployment statement above describes implementation time. Release `20261021-185308-f71799b9` now serves source `f71799b9` at https://106.53.199.187:8443/ using an atomic static symlink switch. Previous release and guarded rollback script were retained; server configuration, existing site and GPU services were unchanged. See [deployment status](deployment_status.md) and machine-readable deployment/verification reports. This deployment does not mark physical-device performance acceptance complete.
