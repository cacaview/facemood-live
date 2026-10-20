import {
  mkdir,
  writeFile,
  readFile,
  copyFile,
  readdir,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root =
  "https://raw.githubusercontent.com/onnx/models/main/validated/vision/body_analysis/emotion_ferplus/";
const assets = [
  [
    "public/models/baseline/emotion-ferplus-8.onnx",
    "https://media.githubusercontent.com/media/onnx/models/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx",
  ],
  [
    "public/models/face-detector.tflite",
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
  ],
  ["models/baseline/UPSTREAM_README.md", root + "README.md"],
  [
    "models/baseline/LICENSE",
    "https://raw.githubusercontent.com/onnx/models/main/LICENSE",
  ],
  [
    "models/baseline/FERPLUS_LICENSE",
    "https://raw.githubusercontent.com/microsoft/FERPlus/master/LICENSE.md",
  ],
];
const manifest = [];
for (const [path, url] of assets) {
  await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  let bytes;
  try {
    bytes = await readFile(path);
    if (!bytes.length) throw Error("empty");
  } catch {
    console.log("Downloading", path);
    execFileSync(
      "curl",
      ["-LsS", "--fail", "--max-time", "600", "-o", path + ".partial", url],
      { stdio: "inherit" },
    );
    bytes = await readFile(path + ".partial");
    await writeFile(path, bytes);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    path.endsWith(".onnx") &&
    sha256 !==
      "a2a2ba6a335a3b29c21acb6272f962bd3d47f84952aaffa03b60986e04efa61c"
  )
    throw Error(
      "Frozen baseline SHA256 mismatch; delete incomplete file and rerun",
    );
  manifest.push({ path, url, bytes: bytes.length, sha256 });
}
for (const [from, to] of [
  ["node_modules/onnxruntime-web/dist", "public/vendor/ort"],
  ["node_modules/@mediapipe/tasks-vision/wasm", "public/vendor/mediapipe"],
]) {
  await mkdir(to, { recursive: true });
  for (const file of await readdir(from)) {
    if (
      from.endsWith("wasm")
        ? /\.(js|wasm)$/.test(file)
        : /^ort-wasm-simd-threaded\.(mjs|wasm)$/.test(file)
    )
      await copyFile(`${from}/${file}`, `${to}/${file}`);
  }
}
await writeFile(
  "models/baseline/assets.json",
  JSON.stringify(manifest, null, 2),
);
console.log(
  manifest.map((x) => `${x.path}: ${x.bytes} bytes ${x.sha256}`).join("\n"),
);
