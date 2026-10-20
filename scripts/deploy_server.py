"""Build locally; SSH transfers only static files. The private SSH key stays local."""

import argparse, datetime, hashlib, json, shlex, subprocess, tarfile
from pathlib import Path
from zoneinfo import ZoneInfo


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--identity", required=True)
    p.add_argument("--host", default="106.53.199.187")
    p.add_argument("--skip-build", action="store_true")
    a = p.parse_args()
    if a.host != "106.53.199.187":
        p.error(
            "Review nginx certificate/firewall configuration before deploying to a different host"
        )
    if not a.skip_build:
        subprocess.run(["npm", "run", "build:server"], check=True)
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    release = (
        datetime.datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y%m%d-%H%M%S")
        + "-"
        + commit[:8]
    )
    version = {
        "release": release,
        "commit": commit,
        "model_sha256": json.loads(Path("public/models/active.json").read_text())[
            "sha256"
        ],
    }
    Path("dist-server/version.json").write_text(json.dumps(version, indent=2))
    Path("release").mkdir(exist_ok=True)
    archive = Path("release") / ("facemood-" + release + ".tar.gz")

    def owner(info):
        info.uid = info.gid = 0
        info.uname = info.gname = "root"
        return info

    with tarfile.open(archive, "w:gz") as tar:
        for file in sorted(Path("dist-server").rglob("*")):
            if file.is_file():
                tar.add(
                    file,
                    arcname="site/" + str(file.relative_to("dist-server")),
                    filter=owner,
                    recursive=False,
                )
        tar.add("deploy/nginx.conf", arcname="nginx.conf", filter=owner)
    ssh = [
        "-i",
        str(Path(a.identity).expanduser()),
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "ConnectTimeout=15",
    ]
    target = "root@" + a.host
    subprocess.run(
        ["scp", *ssh, str(archive), target + ":/tmp/" + archive.name], check=True
    )
    command = "python3 - " + shlex.quote(release)
    result = subprocess.run(
        ["ssh", *ssh, target, command],
        input=Path("deploy/install_release.py").read_text(),
        text=True,
        capture_output=True,
    )
    print(result.stdout)
    print(result.stderr)
    result.check_returncode()
    record = json.loads(result.stdout.strip().splitlines()[-1])
    record.update(
        source_commit=commit,
        archive_sha256=hashlib.file_digest(archive.open("rb"), "sha256").hexdigest(),
    )
    Path("reports/deployment.json").write_text(json.dumps(record, indent=2))
    print("Deployed:", record["url"])


if __name__ == "__main__":
    main()
