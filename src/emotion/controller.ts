export type EmotionLabel =
  | "neutral"
  | "happiness"
  | "surprise"
  | "sadness"
  | "anger"
  | "disgust"
  | "fear"
  | "contempt";

export type EmotionInput = {
  probabilities: readonly number[] | null;
  labels: readonly string[];
  faces: number;
  at: number;
  live: boolean;
};

export type EmotionControllerConfig = {
  emaAlpha: number;
  enterConfidence: number;
  lead: number;
  candidateMs: number;
  minimumHoldMs: number;
  lowConfidenceMs: number;
  staleMs: number;
};

const defaults: EmotionControllerConfig = {
  emaAlpha: 0.25,
  enterConfidence: 0.55,
  lead: 0.12,
  candidateMs: 250,
  minimumHoldMs: 900,
  lowConfidenceMs: 700,
  staleMs: 2000,
};
const knownLabels = new Set<EmotionLabel>([
  "neutral",
  "happiness",
  "surprise",
  "sadness",
  "anger",
  "disgust",
  "fear",
  "contempt",
]);

function isEmotionLabel(label: string): label is EmotionLabel {
  return knownLabels.has(label as EmotionLabel);
}

export class EmotionController {
  private readonly config: EmotionControllerConfig;
  private smoothed: number[] | null = null;
  private labels: readonly string[] | null = null;
  private active: EmotionLabel = "neutral";
  private activeSince = 0;
  private candidate: EmotionLabel | null = null;
  private candidateSince = 0;
  private lowConfidenceSince: number | null = null;
  private lastValidAt: number | null = null;

  constructor(config: Partial<EmotionControllerConfig> = {}) {
    this.config = { ...defaults, ...config };
  }

  update(input: EmotionInput): EmotionLabel {
    const { at, probabilities, labels, faces, live } = input;
    if (!Number.isFinite(at)) return this.resetAndReturn(0);
    if (!(faces > 0)) return this.resetAndReturn(at);

    if (!probabilities) {
      if (
        live &&
        this.lastValidAt !== null &&
        at - this.lastValidAt >= this.config.staleMs
      )
        return this.resetAndReturn(at);
      return this.active;
    }

    if (
      labels.length !== probabilities.length ||
      !labels.length ||
      labels.some((label) => !isEmotionLabel(label)) ||
      probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    )
      return this.resetAndReturn(at);

    const labelsChanged =
      this.labels !== null &&
      (labels.length !== this.labels.length ||
        labels.some((label, index) => label !== this.labels![index]));
    if (labelsChanged) {
      this.reset(at);
    }

    if (!live) {
      let topIndex = 0;
      for (let index = 1; index < probabilities.length; index++)
        if (probabilities[index]! > probabilities[topIndex]!) topIndex = index;
      const label = labels[topIndex] as EmotionLabel;
      const confidence = probabilities[topIndex]!;
      const neutralIndex = labels.indexOf("neutral");
      const neutralConfidence = neutralIndex >= 0 ? probabilities[neutralIndex]! : 0;
      this.reset(at);
      this.labels = [...labels];
      this.smoothed = Array.from(probabilities);
      this.lastValidAt = at;
      if (
        confidence >= this.config.enterConfidence &&
        confidence - neutralConfidence >= this.config.lead
      ) {
        this.active = label;
      }
      return this.active;
    }

    this.labels = [...labels];
    this.lastValidAt = at;
    const next = Array.from(probabilities);
    this.smoothed = this.smoothed
      ? next.map(
          (value, index) =>
            this.config.emaAlpha * value +
            (1 - this.config.emaAlpha) * this.smoothed![index]!,
        )
      : next;

    let topIndex = 0;
    for (let index = 1; index < this.smoothed.length; index++)
      if (this.smoothed[index]! > this.smoothed[topIndex]!) topIndex = index;
    const topLabel = labels[topIndex] as EmotionLabel;
    const confidence = this.smoothed[topIndex]!;
    const activeIndex = labels.indexOf(this.active);
    const activeConfidence = activeIndex >= 0 ? this.smoothed[activeIndex]! : 0;

    if (confidence < 0.45) {
      this.lowConfidenceSince ??= at;
      if (at - this.lowConfidenceSince >= this.config.lowConfidenceMs)
        return this.resetAndReturn(at);
    } else {
      this.lowConfidenceSince = null;
    }

    if (
      topLabel === this.active ||
      confidence < this.config.enterConfidence ||
      confidence - activeConfidence < this.config.lead
    ) {
      this.candidate = null;
      return this.active;
    }

    if (this.candidate !== topLabel) {
      this.candidate = topLabel;
      this.candidateSince = at;
      return this.active;
    }

    if (
      at - this.candidateSince >= this.config.candidateMs &&
      at - this.activeSince >= this.config.minimumHoldMs
    ) {
      this.active = topLabel;
      this.activeSince = at;
      this.candidate = null;
    }
    return this.active;
  }

  reset(at = 0): void {
    this.smoothed = null;
    this.labels = null;
    this.active = "neutral";
    this.activeSince = Number.isFinite(at) ? at : 0;
    this.candidate = null;
    this.candidateSince = 0;
    this.lowConfidenceSince = null;
    this.lastValidAt = null;
  }

  private resetAndReturn(at: number): EmotionLabel {
    this.reset(at);
    return this.active;
  }
}
