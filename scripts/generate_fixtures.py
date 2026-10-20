"""Copyright-free numerical parity fixtures; no dataset pixels included."""

import json
from pathlib import Path
import numpy as np
import onnxruntime as ort


def generate():
    model = "public/models/baseline/emotion-ferplus-8.onnx"
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    session = ort.InferenceSession(
        model, sess_options=options, providers=["CPUExecutionProvider"]
    )
    y, x = np.mgrid[:64, :64]
    inputs = [
        np.zeros((64, 64)),
        np.full((64, 64), 127),
        np.full((64, 64), 255),
        x * 255 / 63,
        ((x // 8 + y // 8) % 2) * 255,
    ]
    fixtures = []
    labels = [
        "neutral",
        "happiness",
        "surprise",
        "sadness",
        "anger",
        "disgust",
        "fear",
        "contempt",
    ]
    for i, image in enumerate(inputs):
        tensor = np.asarray(image, dtype=np.float32)[None, None]
        logits = session.run(None, {session.get_inputs()[0].name: tensor})[0].reshape(
            -1
        )
        exp = np.exp(logits - logits.max())
        prob = exp / exp.sum()
        fixtures.append(
            dict(
                source=f"synthetic-pattern-{i}",
                input=tensor.flatten().tolist(),
                logits=logits.tolist(),
                probabilities=prob.tolist(),
                label=labels[int(logits.argmax())],
            )
        )
    Path("models/baseline/fixtures.json").write_text(json.dumps(fixtures))


if __name__ == "__main__":
    generate()
