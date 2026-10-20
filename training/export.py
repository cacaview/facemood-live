"""Candidate export and deterministic torch/ORT parity. Does not change default model."""

import argparse, json, hashlib
from pathlib import Path


def main():
    import torch, numpy as np, onnxruntime as ort, onnx
    from training.network import TinyExpressionNet

    p = argparse.ArgumentParser()
    p.add_argument("checkpoint")
    p.add_argument("--out", required=True)
    a = p.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    state = torch.load(a.checkpoint, map_location="cpu", weights_only=False)
    model = TinyExpressionNet()
    model.load_state_dict(state["model"])
    model.eval()
    torch.manual_seed(42)
    x = torch.rand(5, 1, 64, 64)
    path = out / "candidate.onnx"
    torch.onnx.export(
        model,
        x[:1],
        path,
        input_names=["pixels"],
        output_names=["logits"],
        opset_version=17,
        **(
            {"dynamo": False}
            if "dynamo" in __import__("inspect").signature(torch.onnx.export).parameters
            else {}
        ),
        dynamic_axes={"pixels": {0: "batch"}, "logits": {0: "batch"}},
    )
    graph = onnx.load(path)
    onnx.checker.check_model(graph)
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    with torch.inference_mode():
        expected = model(x).numpy()
    actual = session.run(None, {"pixels": x.numpy()})[0]
    error = float(np.max(np.abs(expected - actual)))
    np.testing.assert_allclose(expected, actual, rtol=1e-4, atol=1e-5)
    (out / "export.json").write_text(
        json.dumps(
            {
                "sha256": hashlib.file_digest(path.open("rb"), "sha256").hexdigest(),
                "opset": 17,
                "shape": ["batch", 1, 64, 64],
                "grayscale": "RGB BT.601",
                "normalization": "divide 255",
                "outputs": "8 logits in FERPlus order",
                "max_absolute_error": error,
                "samples": 5,
                "browser_parity": "pending; do not promote until verified",
            },
            indent=2,
        )
    )
    print(error)


if __name__ == "__main__":
    main()
