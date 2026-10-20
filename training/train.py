"""Bounded single-device candidate. Requires explicit --allow-gpu for CUDA; never manages services."""

import argparse, io, json, os, random, signal, time, zipfile
from pathlib import Path
from training.telemetry import RunLog, append_csv, budget_totals
from scripts.evaluate import MAPPING, classification_metrics


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--zip", default="情绪检测.zip")
    p.add_argument("--device", default="cpu")
    p.add_argument("--allow-gpu", action="store_true")
    p.add_argument("--window-minutes", type=float, default=15)
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--patience", type=int, default=5)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--run-id", default=time.strftime("candidate-%Y%m%d-%H%M%S"))
    p.add_argument("--resume")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--amp", action="store_true")
    a = p.parse_args()
    if a.window_minutes <= 0 or a.window_minutes > 120:
        p.error(
            "window must be 0..120 minutes; extensions need a new explicit budget approval"
        )
    devices = []
    if a.device != "cpu":
        if not a.allow_gpu:
            p.error("CUDA requires explicit authorization and --allow-gpu")
        if not a.device.startswith("cuda:") or os.environ.get("CUDA_VISIBLE_DEVICES"):
            p.error(
                "Use physical cuda:N without CUDA_VISIBLE_DEVICES to make logs unambiguous"
            )
        import subprocess

        devices = [int(a.device.split(":")[1])]
    output = Path("training/runs") / a.run_id
    if output.exists() and not a.resume:
        p.error("Run directory exists; use unique run-id or explicit --resume")
    output.mkdir(parents=True, exist_ok=True)
    stopped = {"reason": None}
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda s, f: stopped.update(reason=f"signal_{s}"))
    with RunLog("reports", a.run_id, [], a.window_minutes * 60) as log:
        log.update(requested_cuda_devices=devices)
        if devices:
            if (
                budget_totals("reports")["gpu_experiment_wall_seconds"] / 60
                + a.window_minutes
                > 360
            ):
                raise RuntimeError(
                    "6h experiment budget would be exceeded; submit new evidence/budget for user approval"
                )
            active = subprocess.check_output(
                ["nvidia-smi", "--query-compute-apps=pid", "--format=csv,noheader"],
                text=True,
            ).strip()
            if active:
                raise RuntimeError(
                    "GPU processes exist; training refused. No service changed."
                )
        import torch
        import numpy as np
        from PIL import Image
        from training.network import TinyExpressionNet

        random.seed(a.seed)
        np.random.seed(a.seed)
        torch.manual_seed(a.seed)
        torch.set_num_threads(2)
        torch.use_deterministic_algorithms(True)
        (output / "config.json").write_text(json.dumps(vars(a), indent=2))
        (output / "environment.json").write_text(
            json.dumps(
                {
                    "torch": torch.__version__,
                    "numpy": np.__version__,
                    "cuda": torch.version.cuda,
                    "cudnn": torch.backends.cudnn.version(),
                },
                indent=2,
            )
        )

        class Dataset(torch.utils.data.Dataset):
            def __init__(self, split):
                self.z = zipfile.ZipFile(a.zip)
                self.names = sorted(
                    n
                    for n in self.z.namelist()
                    if f"/fer2013/{split}/" in n and n.endswith(".jpg")
                )
                self.names = self.names[: a.limit] if a.limit else self.names

            def __len__(self):
                return len(self.names)

            def __getitem__(self, i):
                n = self.names[i]
                im = (
                    Image.open(io.BytesIO(self.z.read(n)))
                    .convert("L")
                    .resize((64, 64), Image.Resampling.BILINEAR)
                )
                x = np.asarray(im, dtype=np.float32).copy()[None] / 255.0
                return torch.from_numpy(x), MAPPING[n.split("/")[-2]]

        train = Dataset("Training")
        val = Dataset("PublicTest")
        generator = torch.Generator().manual_seed(a.seed)
        loader = torch.utils.data.DataLoader(
            train,
            batch_size=a.batch_size,
            shuffle=True,
            num_workers=0,
            generator=generator,
        )
        validation = torch.utils.data.DataLoader(
            val, batch_size=a.batch_size, num_workers=0
        )
        if devices:
            log.acquire_devices(devices)
        model = TinyExpressionNet().to(a.device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=0.001)
        scaler = torch.cuda.amp.GradScaler(enabled=a.amp and bool(devices))
        best = -1.0
        first_epoch = 0
        stale = 0
        seen = 0
        checkpoint = output / "last.pt"
        if a.resume:
            state = torch.load(a.resume, map_location="cpu", weights_only=False)
            model.load_state_dict(state["model"])
            optimizer.load_state_dict(state["optimizer"])
            scaler.load_state_dict(state["scaler"])
            first_epoch = state["epoch"] + 1
            best = state["best"]
            stale = state["stale"]
            seen = state["seen"]
            generator.set_state(state["generator"])
            torch.set_rng_state(state["torch_rng"])
            random.setstate(state["python_rng"])
            np.random.set_state(state["numpy_rng"])
            if devices and state.get("cuda_rng") is not None:
                torch.cuda.set_rng_state_all(state["cuda_rng"])

        def save(epoch, path):
            tmp = str(path) + ".tmp"
            torch.save(
                dict(
                    model=model.state_dict(),
                    optimizer=optimizer.state_dict(),
                    scaler=scaler.state_dict(),
                    epoch=epoch,
                    best=best,
                    stale=stale,
                    seen=seen,
                    generator=generator.get_state(),
                    torch_rng=torch.get_rng_state(),
                    cuda_rng=torch.cuda.get_rng_state_all() if devices else None,
                    python_rng=random.getstate(),
                    numpy_rng=np.random.get_state(),
                    config=vars(a),
                ),
                tmp,
            )
            os.replace(tmp, path)
            log.update(
                checkpoint=str(path), train_samples=seen, epochs=max(0, epoch + 1)
            )

        def should_stop():
            return (
                stopped["reason"]
                or log.stop_reason
                or (
                    "storage_limit"
                    if __import__("shutil").disk_usage(output).free < 512 * 1024 * 1024
                    else None
                )
                or ("window_limit" if log.remaining() < 20 else None)
            )

        reason = "epochs_complete"
        epoch = first_epoch - 1
        try:
            for epoch in range(first_epoch, a.epochs):
                start = time.monotonic()
                model.train()
                epoch_samples = 0
                reason = None
                for x, y in loader:
                    reason = should_stop()
                    if reason:
                        break
                    x = x.to(a.device)
                    y = y.to(a.device)
                    optimizer.zero_grad(set_to_none=True)
                    with torch.autocast(
                        device_type="cuda" if devices else "cpu",
                        enabled=a.amp and bool(devices),
                    ):
                        loss = torch.nn.functional.cross_entropy(model(x), y)
                    scaler.scale(loss).backward()
                    scaler.step(optimizer)
                    scaler.update()
                    epoch_samples += len(y)
                    seen += len(y)
                if reason:
                    save(epoch - 1, checkpoint)
                    break
                model.eval()
                truth = []
                pred = []
                with torch.inference_mode():
                    for x, y in validation:
                        reason = should_stop()
                        if reason:
                            break
                        pred.extend(model(x.to(a.device)).argmax(1).cpu().tolist())
                        truth.extend(y.tolist())
                if reason:
                    save(epoch - 1, checkpoint)
                    break
                result = classification_metrics(truth, pred)
                metric = result["macro_f1"]
                improved = metric > best + 1e-5
                if improved:
                    best = metric
                    stale = 0
                else:
                    stale += 1
                save(epoch, checkpoint)
                if improved:
                    save(epoch, output / "best.pt")
                    log.update(checkpoint=str(checkpoint))
                elapsed = time.monotonic() - start
                eta = elapsed * (a.epochs - epoch - 1)
                if log.record["initial_eta_seconds"] is None:
                    log.record["initial_eta_seconds"] = eta
                log.update(
                    epochs=epoch + 1,
                    train_samples=seen,
                    best_metric=best,
                    current_metric=metric,
                    dynamic_eta_seconds=min(eta, log.remaining()),
                    samples_per_second=epoch_samples / elapsed,
                )
                append_csv(
                    output / "epochs.csv",
                    dict(
                        epoch=epoch + 1,
                        seconds=elapsed,
                        samples=epoch_samples,
                        samples_per_second=epoch_samples / elapsed,
                        macro_f1=metric,
                        balanced_accuracy=result["balanced_accuracy"],
                        best=best,
                        remaining_window_seconds=log.remaining(),
                    ),
                )
                print(
                    f"epoch={epoch + 1} elapsed={time.monotonic() - log.start:.1f}s ETA={min(eta, log.remaining()):.1f}s best_macro_f1={best:.4f} current={metric:.4f} GPU={log.latest} vLLM窗口剩余={log.remaining():.1f}s",
                    flush=True,
                )
                if stale >= a.patience:
                    reason = "early_stopping"
                    break
            log.update(exit_reason=reason or "epochs_complete")
        except BaseException:
            try:
                save(epoch - 1, checkpoint)
            except Exception as checkpoint_error:
                log.update(checkpoint_error=str(checkpoint_error), train_samples=seen)
            raise
        finally:
            train.z.close()
            val.z.close()
            model = None
            optimizer = None
            x = y = loss = None
            if devices:
                import gc

                gc.collect()
                torch.cuda.empty_cache()
    print(
        "进程退出后请运行 python -m training.verify_gpu；未确认 vLLM 恢复。"
        if devices
        else "CPU 任务已退出；未使用 CUDA，未操作 vLLM。"
    )


if __name__ == "__main__":
    main()
