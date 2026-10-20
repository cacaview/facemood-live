/// <reference lib="webworker" />
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web/wasm";
import { cropBox, grayscale, softmax } from "./core";
import { loadModel, browserModelStore } from "./model-cache";
import { appAsset } from "./asset-url";
const base = new URL("./", self.location.href).href;
let detector: FaceDetector, session: ort.InferenceSession;
const canvas = new OffscreenCanvas(64, 64),
  ctx = canvas.getContext("2d", { willReadFrequently: true })!;
let busy = false;
let normalize = false;
self.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  try {
    if (data.type === "init") {
      ort.env.wasm.wasmPaths = appAsset("vendor/ort/", base);
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      const progress = (message: string) =>
        self.postMessage({ type: "status", message });
      progress("正在检查网站上的模型版本…");
      const manifest = await fetch(appAsset("models/active.json", base), {
        cache: "no-store",
      });
      if (!manifest.ok) throw Error("无法检查模型版本，请检查网络后重试");
      const config = await manifest.json();
      if (
        JSON.stringify(config.input.shape) !== JSON.stringify([1, 1, 64, 64]) ||
        config.input.dtype !== "float32" ||
        config.output.labels.length !== 8 ||
        !["none", "divide 255"].includes(config.input.normalization)
      )
        throw Error("不支持的模型输入契约，请回滚基线");
      normalize = config.input.normalization === "divide 255";
      const store = browserModelStore();
      const bytes = await loadModel(
        {
          key: "expression",
          path: appAsset(config.path, base),
          sha256: config.sha256,
        },
        store,
        fetch,
        progress,
      );
      const faceBytes = await loadModel(
        {
          key: "detector",
          path: appAsset("models/face-detector.tflite", base),
          sha256:
            "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f",
        },
        store,
        fetch,
        progress,
      );
      progress("正在初始化本地推理…");
      const vision = await FilesetResolver.forVisionTasks(
        appAsset("vendor/mediapipe", base),
      );
      detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer: new Uint8Array(faceBytes),
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
      progress("正在初始化表情分类引擎…");
      session = await ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      await session.run({
        [session.inputNames[0]]: new ort.Tensor(
          "float32",
          new Float32Array(4096),
          [1, 1, 64, 64],
        ),
      });
      self.postMessage({
        type: "ready",
        backend: "WASM · CPU",
        model: config.id,
      });
      return;
    }
    if (data.type === "fixture") {
      const r = await session.run({
        [session.inputNames[0]]: new ort.Tensor(
          "float32",
          new Float32Array(data.input),
          [1, 1, 64, 64],
        ),
      });
      self.postMessage({
        type: "fixture",
        id: data.id,
        probabilities: softmax(r[session.outputNames[0]].data as Float32Array),
      });
      return;
    }
    if (data.type !== "frame") return;
    const bitmap: ImageBitmap = data.bitmap;
    if (busy) {
      bitmap.close();
      return;
    }
    busy = true;
    try {
      const t = performance.now();
      const detected = detector.detect(bitmap);
      const d = performance.now();
      const candidates = detected.detections
        .map((face) => face.boundingBox)
        .filter(Boolean)
        .sort((a, b) => b!.width * b!.height - a!.width * a!.height);
      const box = candidates.length
        ? cropBox(candidates[0]!, bitmap.width, bitmap.height)
        : null;
      if (!box) {
        self.postMessage({
          type: "result",
          id: data.id,
          box: null,
          probabilities: null,
          detect: d - t,
          preprocess: 0,
          classify: 0,
          total: performance.now() - t,
          faces: 0,
        });
        return;
      }
      ctx.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, 64, 64);
      const input = grayscale(ctx.getImageData(0, 0, 64, 64).data);
      if (normalize) for (let i = 0; i < input.length; i++) input[i] /= 255;
      const p = performance.now();
      const result = await session.run({
        [session.inputNames[0]]: new ort.Tensor(
          "float32",
          input,
          [1, 1, 64, 64],
        ),
      });
      const end = performance.now();
      self.postMessage({
        type: "result",
        id: data.id,
        box,
        probabilities: softmax(
          result[session.outputNames[0]].data as Float32Array,
        ),
        detect: d - t,
        preprocess: p - d,
        classify: end - p,
        total: end - t,
        faces: candidates.length,
        width: bitmap.width,
        height: bitmap.height,
      });
    } finally {
      bitmap.close();
      busy = false;
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      id: data.id,
    });
  }
};
