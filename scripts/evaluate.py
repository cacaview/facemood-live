"""Frozen, unsmoothed CPU baseline evaluation; PrivateTest blocked unless --final-test."""

import argparse, hashlib, io, json, platform, time, zipfile
from pathlib import Path
import numpy as np
from PIL import Image
import onnxruntime as ort

LABELS = [
    "neutral",
    "happiness",
    "surprise",
    "sadness",
    "anger",
    "disgust",
    "fear",
    "contempt",
]
MAPPING = {
    "neutral": 0,
    "happy": 1,
    "surprised": 2,
    "surprise": 2,
    "sad": 3,
    "anger": 4,
    "disgust": 5,
    "fear": 6,
}


def classification_metrics(truth, pred):
    cm = np.zeros((8, 8), dtype=int)
    for t, p in zip(truth, pred):
        cm[t, p] += 1
    support = cm.sum(axis=1)
    recall = np.divide(cm.diagonal(), support, out=np.zeros(8), where=support != 0)
    precision = np.divide(
        cm.diagonal(), cm.sum(axis=0), out=np.zeros(8), where=cm.sum(axis=0) != 0
    )
    f1 = np.divide(
        2 * precision * recall,
        precision + recall,
        out=np.zeros(8),
        where=(precision + recall) != 0,
    )
    present = support > 0
    return dict(
        accuracy=float(np.trace(cm) / max(1, cm.sum())),
        macro_f1=float(f1[present].mean()),
        balanced_accuracy=float(recall[present].mean()),
        labels=LABELS,
        support=support.tolist(),
        per_class_recall=recall.tolist(),
        per_class_f1=f1.tolist(),
        confusion_matrix=cm.tolist(),
        macro_scope="Only ground-truth-supported classes; contempt remains a possible wrong prediction (8th column).",
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--zip", default="情绪检测.zip")
    p.add_argument("--model", default="public/models/baseline/emotion-ferplus-8.onnx")
    p.add_argument(
        "--split", choices=["PublicTest", "PrivateTest"], default="PublicTest"
    )
    p.add_argument("--final-test", action="store_true")
    p.add_argument("--limit", type=int, default=0)
    a = p.parse_args()
    if a.split == "PrivateTest" and not a.final_test:
        p.error(
            "PrivateTest sealed; pass --final-test only after model selection is complete"
        )
    out = Path("models/baseline")
    out.mkdir(parents=True, exist_ok=True)
    target = out / ("validation.json" if a.split == "PublicTest" else "final_test.json")
    if a.split == "PrivateTest" and target.exists():
        p.error("Final test already recorded. Do not repeatedly tune against it.")
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    opts.inter_op_num_threads = 1
    start = time.perf_counter()
    sess = ort.InferenceSession(
        a.model, sess_options=opts, providers=["CPUExecutionProvider"]
    )
    truth = []
    pred = []
    latencies = []
    with zipfile.ZipFile(a.zip) as z:
        names = sorted(
            n
            for n in z.namelist()
            if f"/fer2013/{a.split}/" in n and n.endswith(".jpg")
        )
        if a.limit:
            names = names[: a.limit]
        for i, name in enumerate(names):
            label = name.split("/")[-2]
            if label not in MAPPING:
                raise ValueError(f"Unknown label: {label}")
            im = (
                Image.open(io.BytesIO(z.read(name)))
                .convert("L")
                .resize((64, 64), Image.Resampling.BILINEAR)
            )
            x = np.asarray(im, dtype=np.float32)[None, None]
            t = time.perf_counter()
            y = sess.run(None, {sess.get_inputs()[0].name: x})[0].reshape(-1)
            latencies.append((time.perf_counter() - t) * 1000)
            truth.append(MAPPING[label])
            pred.append(int(y.argmax()))
            if (i + 1) % 500 == 0:
                print(
                    f"{i + 1}/{len(names)}, elapsed={time.perf_counter() - start:.1f}s",
                    flush=True,
                )
    result = classification_metrics(truth, pred)
    result.update(
        split=a.split,
        count=len(truth),
        subset=bool(a.limit),
        elapsed_seconds=time.perf_counter() - start,
        model_sha256=hashlib.file_digest(open(a.model, "rb"), "sha256").hexdigest(),
        inference_mean_ms=float(np.mean(latencies)),
        inference_p50_ms=float(np.percentile(latencies, 50)),
        inference_p95_ms=float(np.percentile(latencies, 95)),
        runtime=ort.__version__,
        platform=platform.platform(),
        intra_op_threads=1,
        warning="FERPlus pretraining uses FER2013; not independent generalization evidence. Original splits have duplicate leakage. Unsmooth raw logits argmax, contempt always error on this 7-class dataset.",
    )
    target.write_text(json.dumps(result, indent=2))
    if a.split == "PublicTest":
        try:
            from scripts.generate_fixtures import generate
        except ModuleNotFoundError:
            from generate_fixtures import generate
        generate()
    Path("reports/baseline_evaluation.md").write_text(
        "# 固定 CPU 基线验证\n\n```json\n"
        + json.dumps(result, indent=2)
        + "\n```\n\nPrivateTest 封存未评。以上是模型兼容性参考，不能作为独立测试集泛化成绩。PIL bilinear 灰度 resize；浏览器对实拍图片使用 Canvas RGB→灰度，边界插值可能存在差异。fixtures 用相同 float32 数组跨运行时核验。\n"
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
