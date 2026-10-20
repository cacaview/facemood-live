"""Read-only check. This NEVER starts/stops/restarts vLLM."""

import subprocess, json, datetime
from pathlib import Path

if __name__ == "__main__":
    r = subprocess.run(
        [
            "nvidia-smi",
            "--query-compute-apps=pid,gpu_uuid,process_name,used_gpu_memory",
            "--format=csv,noheader",
        ],
        text=True,
        capture_output=True,
        check=True,
    )
    free = not r.stdout.strip()
    record = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "no_compute_processes": free,
        "processes": r.stdout,
        "vllm_resumed": "unconfirmed",
    }
    Path("reports/gpu_handback.json").write_text(json.dumps(record, indent=2))
    print(
        "GPU 可交还：无计算进程；请用户恢复 vLLM。"
        if free
        else "GPU 尚有计算进程，不能确认可交还；未改动任何服务。"
    )
    print(r.stdout)
