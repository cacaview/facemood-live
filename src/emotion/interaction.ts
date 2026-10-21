// Shared limits keep repeated gestures bounded across input, simulation and rendering.
export const INTERACTION = {
  pointerGain: 0.1,
  maxPointerSpeed: 0.45,
  maxFieldSpeed: 0.18,
  splatRadius: 0.045,
  fieldDecay: 2.1,
  surfaceGain: 0.45,
  normalGain: 0.016,
  depthGain: 0.008,
  maxSurfaceOffset: 0.075,
} as const;
