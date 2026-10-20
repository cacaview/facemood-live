"""Run records survive exceptions; no service control, no implicit GPU probing on CPU runs."""

import csv, datetime, hashlib, json, os, subprocess, threading, time, uuid
from pathlib import Path
from zoneinfo import ZoneInfo


def card_hours(occupied_seconds):
    return sum(occupied_seconds) / 3600


def append_csv(path, row):
    # POSIX advisory lock serializes independently scheduled experiment writers.
    import fcntl

    with open(path, "a+", newline="") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.seek(0, 2)
        empty = f.tell() == 0
        w = csv.DictWriter(f, fieldnames=list(row))
        if empty:
            w.writeheader()
        w.writerow(row)
        f.flush()
        os.fsync(f.fileno())
        fcntl.flock(f, fcntl.LOCK_UN)


def now():
    return datetime.datetime.now(ZoneInfo("Asia/Shanghai")).isoformat()


def gpu_snapshot():
    r = subprocess.run(
        [
            "nvidia-smi",
            "--query-gpu=index,uuid,memory.used,utilization.gpu,temperature.gpu",
            "--format=csv,noheader,nounits",
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=5,
    )
    return [
        dict(
            index=int(p[0]),
            uuid=p[1].strip(),
            memory_mib=float(p[2]),
            utilization_pct=float(p[3]),
            temperature_c=float(p[4]),
        )
        for line in r.stdout.strip().splitlines()
        if (p := line.split(","))
    ]


class RunLog:
    def __init__(self, output, run_id=None, devices=None, budget_seconds=900):
        self.out = Path(output)
        self.out.mkdir(parents=True, exist_ok=True)
        self.run_id = run_id or str(uuid.uuid4())
        self.devices = devices or []
        self.budget = budget_seconds
        self.reserved_at = None
        self.stop = threading.Event()
        self.stop_reason = None
        self.peak = {str(d): 0 for d in self.devices}
        self.latest = []
        self.record = {
            "run_id": self.run_id,
            "started_at": now(),
            "timezone": "Asia/Shanghai",
            "cuda_devices": self.devices,
            "pid": os.getpid(),
            "status": "running",
            "budget_seconds": budget_seconds,
            "initial_eta_seconds": None,
            "dynamic_eta_seconds": None,
            "epochs": 0,
            "train_samples": 0,
            "best_metric": None,
            "checkpoint": None,
            "git_commit": self.git_commit(),
            "handback_verified": False,
        }

    @staticmethod
    def git_commit():
        try:
            return subprocess.check_output(
                ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
            ).strip()
        except Exception:
            return "uncommitted"

    def __enter__(self):
        self.start = time.monotonic()
        self.reserved_at = self.start if self.devices else None
        self.flush()
        self.thread = threading.Thread(target=self.sample_loop, daemon=True)
        self.thread.start()
        return self

    def flush(self):
        tmp = self.out / (self.run_id + ".json.tmp")
        tmp.write_text(json.dumps(self.record, indent=2))
        os.replace(tmp, self.out / (self.run_id + ".json"))

    def sample_loop(self):
        while not self.stop.is_set():
            if self.devices:
                try:
                    self.latest = [
                        r for r in gpu_snapshot() if r["index"] in self.devices
                    ]
                    for r in self.latest:
                        self.peak[str(r["index"])] = max(
                            self.peak[str(r["index"])], r["memory_mib"]
                        )
                        append_csv(
                            self.out / "gpu_samples.csv",
                            dict(run_id=self.run_id, timestamp=now(), **r),
                        )
                        if r["temperature_c"] >= 85:
                            self.stop_reason = "temperature_limit"
                except Exception as e:
                    self.stop_reason = "gpu_telemetry_failed: " + str(e)
            self.stop.wait(5)

    def acquire_devices(self, devices):
        self.devices = list(devices)
        self.reserved_at = time.monotonic()
        self.peak = {str(d): 0 for d in devices}
        self.record["cuda_devices"] = self.devices
        self.flush()

    def remaining(self):
        return max(0, self.budget - (time.monotonic() - self.start))

    def update(self, **fields):
        self.record.update(fields)
        self.record["remaining_window_seconds"] = self.remaining()
        self.flush()

    def __exit__(self, typ, value, tb):
        self.stop.set()
        self.thread.join(timeout=7)
        elapsed = time.monotonic() - self.start
        reason = str(value) if typ else self.record.get("exit_reason", "finished")
        completed = typ is None and reason in {
            "finished",
            "epochs_complete",
            "early_stopping",
        }
        self.record.update(
            completed=completed,
            ended_at=now(),
            wall_clock_seconds=elapsed,
            status="failed" if typ else ("completed" if completed else "stopped"),
            exit_reason=str(value)
            if typ
            else self.record.get("exit_reason", "finished"),
            peak_memory_mib=self.peak,
            gpu_card_hours=card_hours(
                [max(0, time.monotonic() - self.reserved_at)] * len(self.devices)
            )
            if self.reserved_at is not None
            else 0,
            remaining_window_seconds=max(0, self.budget - elapsed),
        )
        checkpoint = self.record.get("checkpoint")
        self.record["artifact_sha256"] = (
            hashlib.file_digest(open(checkpoint, "rb"), "sha256").hexdigest()
            if checkpoint and Path(checkpoint).exists()
            else None
        )
        self.flush()
        append_csv(
            self.out / "gpu_runs.csv",
            dict(
                run_id=self.run_id,
                started_at=self.record["started_at"],
                ended_at=self.record["ended_at"],
                timezone="Asia/Shanghai",
                wall_clock_seconds=elapsed,
                cuda_devices=json.dumps(self.devices),
                card_count=len(self.devices),
                gpu_card_hours=self.record["gpu_card_hours"],
                peak_memory_mib=json.dumps(self.peak),
                epochs=self.record["epochs"],
                train_samples=self.record["train_samples"],
                best_metric=self.record["best_metric"],
                status=self.record["status"],
                exit_reason=self.record["exit_reason"],
                checkpoint=checkpoint,
                git_commit=self.record["git_commit"],
                artifact_sha256=self.record["artifact_sha256"],
                handback_verified=False,
            ),
        )
        refresh_budget(self.out)
        return False


def budget_totals(output):
    """Union experiment intervals; cannot infer user's full-server released window."""
    path = Path(output) / "gpu_runs.csv"
    intervals = []
    hours = 0.0
    if path.exists():
        for row in csv.DictReader(path.open()):
            if not json.loads(row["cuda_devices"]):
                continue
            intervals.append(
                (
                    datetime.datetime.fromisoformat(row["started_at"]).timestamp(),
                    datetime.datetime.fromisoformat(row["ended_at"]).timestamp(),
                )
            )
            hours += float(row["gpu_card_hours"])
    total = 0.0
    end = None
    for a, b in sorted(intervals):
        total += max(0, b - max(a, end if end is not None else a))
        end = max(b, end if end is not None else b)
    return {
        "gpu_experiment_wall_seconds": total,
        "gpu_card_hours": hours,
        "normal_suggested_minutes": 300,
        "maximum_suggested_minutes": 360,
        "remaining_experiment_budget_minutes": max(0, 360 - total / 60),
        "whole_server_released_window_minutes": 0 if not intervals else None,
        "whole_server_window_note": "No GPU runs: zero used. With GPU runs, confirm actual whole-server release/restoration times separately; interval union is experiment coverage, not complete exclusive window.",
    }


def refresh_budget(output):
    out = Path(output)
    r = budget_totals(out)
    (out / "gpu_budget.json").write_text(json.dumps(r, indent=2))
    (out / "gpu_budget.md").write_text(f"""# GPU预算（自动汇总，北京时间）

更新时间：{now()}
GPU 实验 wall-clock 区间并集：{r["gpu_experiment_wall_seconds"] / 60:.3f} 分钟；实际已记录卡时：{r["gpu_card_hours"]:.6f} GPU-card-hours。
全服务器独占窗口：{"0 分钟（没有服务器 GPU 实验）" if r["whole_server_released_window_minutes"] == 0 else "未确认：需用户记录整机释放到归还的起止时间，实验区间并集不包含任务间空闲"}。

正常建议预约 300 分钟 + 机动 60 分钟，尚未确认实际预约；剩余实验预算上限 {r["remaining_experiment_budget_minutes"]:.3f} 分钟。卡时不等于训练持续时间，也不等于整机独占窗口。CPU行设备为空、卡时为0。GPU采样每5秒，整卡利用率/显存不是单进程归因。

|北京时间日期|阶段|初步建议窗口|
|---|---|---:|
|10/21|评估及首轮训练|120分钟|
|10/22|候选实验|120分钟|
|10/23|最终验证/导出|60分钟|
|机动|中断恢复/重跑|60分钟|

下一次只建议先授权 10–15 分钟单卡吞吐探测；依据实测 samples/sec、epoch 时间、显存后修订。当前无 V100/AMP/DDP 或完整训练实测，估计信心低，不承诺轮数。多GPU并行实验/DDP尚未实现，现有CUDA进程会阻止启动。

运行中每轮输出任务窗口剩余 wall-clock，CSV/JSON记录实际设备和退出原因。Ctrl+C/SIGTERM在批次边界保存断点；预留20秒清理属于软上限，卡死操作/存盘可能超时。进程退出后运行 python -m training.verify_gpu，确认无遗留计算进程才报告可交还；本工具从不暂停/恢复/重启vLLM，也不宣称服务已恢复。没有GPU实验时无需为本地任务释放服务器。
""")
