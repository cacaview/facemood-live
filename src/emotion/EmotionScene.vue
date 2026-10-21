<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { EmotionLabel } from "./controller";
import type { QualityPreset } from "./scene-logic";
import type { EmotionScene as EmotionSceneEngine } from "./scene";

const props = defineProps<{
  label: EmotionLabel;
  enabled: boolean;
  reducedMotion: boolean;
  quality: QualityPreset;
}>();
const emit = defineEmits<{
  ready: [fps: number];
  fallback: [message: string];
  "quality-change": [quality: QualityPreset];
}>();

const host = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const errorMessage = ref("");
const engine = ref<EmotionSceneEngine | null>(null);
let disposed = false;

onMounted(async () => {
  try {
    const { EmotionScene: SceneEngine } = await import("./scene");
    if (disposed || !host.value || !canvas.value) return;
    engine.value = new SceneEngine(
      canvas.value,
      host.value,
      props.quality,
      props.reducedMotion,
      {
        ready: (fps) => emit("ready", fps),
        fallback: (message) => {
          errorMessage.value = message;
          emit("fallback", message);
        },
        qualityChange: (quality) => emit("quality-change", quality),
      },
    );
    engine.value.setEnabled(props.enabled);
    engine.value.setEmotion(props.label);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    emit("fallback", errorMessage.value);
  }
});

watch(() => props.label, (label) => engine.value?.setEmotion(label));
watch(() => props.enabled, (enabled) => engine.value?.setEnabled(enabled));
watch(() => props.quality, (quality) => engine.value?.setQuality(quality));
watch(() => props.reducedMotion, (value) => engine.value?.setReducedMotion(value));

onBeforeUnmount(() => {
  disposed = true;
  engine.value?.dispose();
  engine.value = null;
});
</script>

<template>
  <div ref="host" class="emotion-scene-host" :class="{ 'has-fallback': errorMessage }">
    <canvas ref="canvas" class="emotion-scene-canvas" aria-label="可交互的三维情绪形态" />
    <div v-if="errorMessage" class="emotion-scene-fallback" role="status">
      {{ errorMessage }}
    </div>
  </div>
</template>
