# FERPlus frozen baseline — FaceMood Live v1

Source: [ONNX Model Zoo](https://github.com/onnx/models/tree/main/validated/vision/body_analysis/emotion_ferplus), emotion-ferplus-8.onnx. 35,040,571 bytes, opset 8. SHA256 in config.json, assets.json; original source and license copies in this directory. The model README explicitly declares MIT; Microsoft FERPlus LICENSE.md is MIT, ONNX repository LICENSE is Apache-2.0. Preserve both notices. No bundled dataset or old project weights are redistributed with web assets.

Input and label order: config.json is the binding contract. No random output, normalization to [-1,1], or seven-class renormalization. Grayscale float32 raw 0..255, 64x64, NCHW. Browser uses canvas bilinear then BT.601 grayscale. Python dataset evaluation starts with gray image and PIL bilinear; small interpolation differences are possible. fixtures.json stores 5 synthetic numerical arrays (no dataset images), raw logits and softmax for cross-runtime comparison, not web-shipped dataset images. Classifier expects cropped frontal face, no geometric alignment in v1.

## Evidence
validation.json: fixed original PublicTest, 3,589 examples, CPU single thread; raw argmax, no display smoothing or threshold. FER2013 seven-class scores treat contempt predictions as wrong and compute macro averages over ground-truth-supported classes. Fear/disgust/sadness recall is weak; see per-class supports and confusion matrix. This is a compatibility benchmark, not independently held-out generalization: FERPlus pretraining uses FER2013 and dataset audit finds cross-split duplicates. PrivateTest sealed and not used for selection or tuning.

Browser parity: reports/browser_parity.json after successful test. No native PyTorch source for this CNTK pretrained model, so PyTorch→ONNX export parity does not apply. Candidate model has independent export comparison tooling and cannot replace baseline until validation and browser tests pass.

## Intended use and limitations
User-initiated local camera/photo/video demonstration of visible facial expressions. Not inner emotional state, psychological health, diagnosis, personal intent, identity recognition or surveillance. Demographic fairness not independently evaluated here. Crops/lighting/pose/occlusion/domain shifts can fail. Only largest face analyzed; display threshold 0.45 is an uncalibrated UI choice, not an accuracy guarantee. EMA resets on no face/source changes; moving between people without no-face gap can mix display history (no identity tracking).

## Rollback
`npm run rollback:baseline` checks the frozen ONNX SHA, resets public/models/active.json to the baseline contract, and builds the static app. The worker reads active.json and verifies model bytes using SHA-256 before creating the session. No candidate is automatically promoted. Keep the previous dist directory before authorized deployment. The online page checks active.json on every open and stores hash-verified models in IndexedDB. Unchanged weights are reused, verified updates atomically replace the corresponding record. Whole-site offline mode was removed by user request; the legacy sw.js only retires previous installations.

## Other assets
MediaPipe BlazeFace Short Range float16 v1, 229,746 bytes. [Official model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf), Apache-2.0. CPU delegate in Worker. JS/WASM local package assets; see THIRD_PARTY_NOTICES.md.
