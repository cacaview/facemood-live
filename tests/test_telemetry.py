from training.telemetry import card_hours, RunLog
import json


def test_card_hours_are_not_wall_clock():
    assert card_hours([3600, 1800]) == 1.5


def test_failure_always_logs_and_reports_no_unverified_handback(tmp_path):
    try:
        with RunLog(tmp_path, "cpu-smoke", [], 60):
            raise RuntimeError("failed")
    except RuntimeError:
        pass
    rows = (tmp_path / "gpu_runs.csv").read_text()
    assert "failed" in rows
    record = json.loads((tmp_path / "cpu-smoke.json").read_text())
    assert record["cuda_devices"] == []
    assert record["gpu_card_hours"] == 0
    assert record["status"] == "failed"
    assert record["handback_verified"] is False


def test_busy_gpu_preflight_is_logged_without_claiming_card_hours(
    tmp_path, monkeypatch
):
    from training.train import main
    import sys, subprocess

    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("CUDA_VISIBLE_DEVICES", raising=False)
    monkeypatch.setattr(
        sys,
        "argv",
        ["train", "--device", "cuda:0", "--allow-gpu", "--run-id", "rejected"],
    )
    monkeypatch.setattr(subprocess, "check_output", lambda *a, **k: "12345")
    import pytest

    with pytest.raises(RuntimeError, match="processes exist"):
        main()
    record = json.loads((tmp_path / "reports/rejected.json").read_text())
    assert record["status"] == "failed"
    assert record["cuda_devices"] == []
    assert record["requested_cuda_devices"] == [0]
    assert record["gpu_card_hours"] == 0


def test_overlapping_runs_do_not_double_count_wall_clock(tmp_path):
    from training.telemetry import budget_totals
    import csv

    with (tmp_path / "gpu_runs.csv").open("w", newline="") as f:
        w = csv.DictWriter(
            f, fieldnames=["cuda_devices", "started_at", "ended_at", "gpu_card_hours"]
        )
        w.writeheader()
        w.writerow(
            dict(
                cuda_devices="[0,1]",
                started_at="2026-10-21T10:00:00+08:00",
                ended_at="2026-10-21T11:00:00+08:00",
                gpu_card_hours=2,
            )
        )
        w.writerow(
            dict(
                cuda_devices="[2,3]",
                started_at="2026-10-21T10:30:00+08:00",
                ended_at="2026-10-21T11:30:00+08:00",
                gpu_card_hours=2,
            )
        )
    r = budget_totals(tmp_path)
    assert r["gpu_experiment_wall_seconds"] == 5400
    assert r["gpu_card_hours"] == 4
