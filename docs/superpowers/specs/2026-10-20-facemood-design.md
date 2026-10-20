# FaceMood Live v1.0 implementation brief
Authority: user PRD dated 2026-10-20. User explicitly authorized autonomous non-destructive development, CPU evaluation and documentation. GPU, service changes and external publication require confirmation.

Vue 3/TypeScript/Vite PWA, local MediaPipe CPU detector and ONNX Runtime WASM classifier. One worker owns both models and processes at most one bitmap at a time. Largest face only, bounded image dimensions, no stale frame queue. Main thread renders video and overlays separately. Default backend is verified WASM; optional WebGPU deferred until measured. Camera/video/image sources are explicitly labeled. No microphone, frame uploads or persistent face history. User-confirmed screenshot only.

Baseline: MIT ONNX Model Zoo FERPlus, 8 classes, NCHW float32 grayscale 64x64 raw 0..255; softmax logits. Keep contempt as an eighth output. FER2013 audit/evaluation maps seven labels; contempt counts as incorrect, no probability renormalization. FER+ trained on FER2013: even predefined holdout scores have potential pretraining overlap and are NOT independent generalization evidence. Do not tune on PrivateTest; use PublicTest fixed baseline validation only. Existing bundled weights have unknown license and provenance and are not redistributed in app.

Audit zip read-only: source hashes, per-file split/class/dimensions/quality, decoded-pixel exact and dHash near duplicate leakage, original splits, unknown identities and authorization. Do not publish dataset.

CPU benchmark/frozen fixtures establish baseline, sample outputs and browser cross-checks. Evaluation is unsmoothed. Manual Windows/iPhone/Android acceptance stays pending until real hardware is supplied. Offline works only after successful explicit complete asset caching; no first-visit offline promise.

Training candidate: small PyTorch CNN with deterministic seed, predefined splits, CPU by default, explicit GPU opt-in, bounded window, early stop, resume and atomic checkpoints. Record per-run CSV and per-GPU samples; budget counts wall window separately from card-hours. No server connections or vLLM commands. CUDA opt-in additionally requires free GPUs, all failure states logged; GPU handback requires explicit process inspection.

Delivery remains local; HTTPS deployment instructions and acceptance checklist supplied, publication pending authorization.

## User override: online page + local models (2026-10-20)
Whole-site offline/PWA caching removed. Check no-store active.json on each open, reuse SHA-verified IndexedDB model records, atomically replace only valid downloads. Legacy sw.js retires previous offline clients; no new registration. No forced offline page availability or offline preparation control.
