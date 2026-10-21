import type { EmotionLabel } from "./controller";
import { EmotionRegistry } from "./registry";

export type PrototypeEmotion = "neutral" | "happiness" | "anger";
export type VisualEmotionMode = "live" | "manual" | "cycle";

export function resolveVisualEmotion(
  mode: VisualEmotionMode,
  detected: EmotionLabel,
  preview: PrototypeEmotion,
): PrototypeEmotion {
  const label = mode === "live" ? detected : preview;
  return EmotionRegistry[label].implemented ? (label as PrototypeEmotion) : "neutral";
}
