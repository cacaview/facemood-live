import type { EmotionLabel } from "./controller";

export type { EmotionLabel } from "./controller";
export type Quality = "low" | "medium" | "high";

export type EmotionDefinition = {
  label: EmotionLabel;
  implemented: boolean;
  palette: { primary: string; secondary: string; background: string };
  particleScale: number;
  assetUrl?: string;
  license?: string;
};

export const EmotionRegistry: Record<EmotionLabel, EmotionDefinition> = {
  neutral: {
    label: "neutral",
    implemented: true,
    palette: {
      primary: "#b9cfff",
      secondary: "#b18be9",
      background: "#090710",
    },
    particleScale: 1,
  },
  happiness: {
    label: "happiness",
    implemented: true,
    palette: {
      primary: "#ffc06f",
      secondary: "#dca3e8",
      background: "#21152a",
    },
    particleScale: 1.15,
  },
  surprise: {
    label: "surprise",
    implemented: false,
    palette: {
      primary: "#65ddff",
      secondary: "#428bff",
      background: "#0a1728",
    },
    particleScale: 1,
  },
  sadness: {
    label: "sadness",
    implemented: false,
    palette: {
      primary: "#729fef",
      secondary: "#756fc1",
      background: "#10182a",
    },
    particleScale: 0.8,
  },
  anger: {
    label: "anger",
    implemented: true,
    palette: {
      primary: "#ff5949",
      secondary: "#ff9e37",
      background: "#26121a",
    },
    particleScale: 0.9,
  },
  disgust: {
    label: "disgust",
    implemented: false,
    palette: {
      primary: "#b8cf63",
      secondary: "#71845a",
      background: "#171e18",
    },
    particleScale: 0.8,
  },
  fear: {
    label: "fear",
    implemented: false,
    palette: {
      primary: "#b8a8ee",
      secondary: "#e6e9fb",
      background: "#171426",
    },
    particleScale: 0.85,
  },
  contempt: {
    label: "contempt",
    implemented: false,
    palette: {
      primary: "#d17be8",
      secondary: "#6748a8",
      background: "#1d1329",
    },
    particleScale: 0.85,
  },
};
