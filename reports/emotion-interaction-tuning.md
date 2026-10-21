# Bounded local interaction fix — 2026-10-21

User report: pointer disturbance deformed the entire particle sculpture.

## Cause and changes

The old field accumulated up to ±2 on each axis (diagonal magnitude ~2.83), and the sculpture multiplied its XY field displacement by 2.8. Worst-case displacement could therefore exceed the sculpture's diameter. Anger also applied a shared agitation value to every fragment.

- Pointer gain: 0.32 → 0.10; injected speed capped as a vector at 0.45.
- Field accumulation: capped as a vector at 0.18; Gaussian radius 0.075 → 0.045 of field width. Decay and neighbor mixing are time based, so a zero-time step does not diffuse the field.
- Surface gain: 2.8 → 0.45. Normal/depth forces reduced to 0.016 / 0.008, with a final combined displacement cap of 0.075 view-space units (0.0225 in reduced motion). This applies to the shared membrane/surface-particle deformation.
- Ambient field particles retain a more visible local wake, separate from the sculpture's small displacement.
- Fragment responses use local Gaussian falloff and non-accumulating bounded impulses; distant fragments stay anchored and all offsets decay after release.
- Idle animation, model topology, quality tiers, inference worker, camera and export logic remain unchanged. Central tuning is in `src/emotion/interaction.ts`.

## Verification

New regression tests first reproduced an accumulated field speed of ~2.797 and fragment displacement of ~0.356 units under repeated fast gestures. After the fix, the field stays below 0.18; fragment offsets stay below 0.06, distant fragments below 0.001, and both return to rest. The existing particle attachment regression now targets the touched fragment and checks its deliberately smaller movement.

Vitest: 51 passed. Production TypeScript/build passed. Targeted Playwright mouse drag, touch/cancel/settling/visibility recovery, and high/low/medium quality checks: 3 passed. Both normal and server production builds passed. These checks do not replace physical iPhone/desktop performance acceptance.
