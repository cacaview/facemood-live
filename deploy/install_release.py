"""Executed over SSH: dedicated 8443 listener and a versioned static release only."""

import json, os, shutil, subprocess, sys, tarfile
from pathlib import Path

release = sys.argv[1]
if not all(c.isalnum() or c in "-_" for c in release):
    raise ValueError("invalid release id")
base = Path("/var/www/facemood")
dest = base / "releases" / release
config = Path("/etc/nginx/sites-available/facemood.conf")
enabled = Path("/etc/nginx/sites-enabled/facemood.conf")
firewall = Path("/etc/nftables.conf")
marker = "facemood-https"
anchor = "tcp dport { 22, 80, 443, 3478 } ct state new accept"
old_firewall = firewall.read_text()
if marker not in old_firewall and anchor not in old_firewall:
    raise RuntimeError(
        "Firewall layout changed; inspect before adding port. No change applied."
    )
if config.exists() and "Dedicated FaceMood listener" not in config.read_text():
    raise RuntimeError("Unrelated config at target path; refusing overwrite")
if enabled.exists() and (not enabled.is_symlink() or enabled.resolve() != config):
    raise RuntimeError("Unrelated site at target path")
current = base / "current"
if current.exists() and not current.is_symlink():
    raise RuntimeError("Current release must be a symlink")
old_target = os.readlink(current) if current.is_symlink() else None
old_config = config.read_bytes() if config.exists() else None
old_enabled = enabled.is_symlink()
backup = Path("/var/backups/facemood") / release
backup.mkdir(parents=True, exist_ok=False)
shutil.copy2(firewall, backup / "nftables.conf")
if config.exists():
    shutil.copy2(config, backup / "nginx.conf")
(backup / "previous.json").write_text(
    json.dumps({"current": old_target, "enabled": old_enabled})
)
dest.mkdir(parents=True, exist_ok=False)
with tarfile.open("/tmp/facemood-" + release + ".tar.gz") as tar:
    tar.extractall(dest, filter="data")
new_firewall = (
    old_firewall
    if marker in old_firewall
    else old_firewall.replace(
        anchor,
        anchor
        + '\n        tcp dport 8443 ct state new accept comment "facemood-https"',
    )
)
trial = backup / "nftables-new.conf"
trial.write_text(new_firewall)
subprocess.run(["nft", "-c", "-f", str(trial)], check=True)
added_firewall = False
try:
    config.write_bytes((dest / "nginx.conf").read_bytes())
    if not old_enabled:
        enabled.symlink_to(config)
    candidate = base / "current.next"
    candidate.symlink_to(dest / "site")
    os.replace(candidate, current)
    subprocess.run(["nginx", "-t"], check=True)
    rules = subprocess.check_output(
        ["nft", "list", "chain", "inet", "game_web", "input"], text=True
    )
    if marker not in rules:
        subprocess.run(
            [
                "nft",
                "add",
                "rule",
                "inet",
                "game_web",
                "input",
                "tcp",
                "dport",
                "8443",
                "ct",
                "state",
                "new",
                "accept",
                "comment",
                json.dumps(marker),
            ],
            check=True,
        )
        added_firewall = True
    # Preserve the existing firewall file permissions; never flush live rules.
    firewall.write_text(new_firewall)
    subprocess.run(["systemctl", "reload", "nginx"], check=True)
except BaseException:
    if old_target:
        rollback = base / "current.rollback"
        rollback.symlink_to(old_target)
        os.replace(rollback, current)
    elif current.is_symlink():
        current.unlink()
    if old_config is not None:
        config.write_bytes(old_config)
    else:
        config.unlink(missing_ok=True)
    if not old_enabled:
        enabled.unlink(missing_ok=True)
    firewall.write_text(old_firewall)
    if added_firewall:
        import re

        listing = subprocess.check_output(
            ["nft", "-a", "list", "chain", "inet", "game_web", "input"], text=True
        )
        for line in listing.splitlines():
            if marker in line and (m := re.search(r"handle (\d+)", line)):
                subprocess.run(
                    [
                        "nft",
                        "delete",
                        "rule",
                        "inet",
                        "game_web",
                        "input",
                        "handle",
                        m.group(1),
                    ],
                    check=True,
                )
    if subprocess.run(["nginx", "-t"]).returncode == 0:
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
    raise
print(
    json.dumps(
        {
            "release": release,
            "current": str(current.resolve()),
            "previous": old_target,
            "backup": str(backup),
            "port": 8443,
            "url": "https://106.53.199.187:8443/",
            "existing_site": "unchanged",
            "vllm": "not accessed",
        }
    )
)
