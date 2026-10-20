# Dedicated server deployment

URL: https://106.53.199.187:8443/ . Port 8443 is independent of the existing site on 80/443.
Only static build files are served; no Node/Python application service or server GPU is needed. Nginx reuses the existing valid IP certificate and its existing renewal/deploy hook. The key used for SSH stays on the operator's computer, outside Git.

```sh
npm ci
npm run assets
npm run build:server
python3 scripts/deploy_server.py --identity /path/to/private-key.pem --skip-build
```

Prerequisites: reviewed root SSH access and existing nginx/certificate. First connection must establish the expected SSH host key; deploy script requires StrictHostKeyChecking=yes. The deployment does not clone the GitHub repository or place GitHub tokens on the server.

Versioned release: `/var/www/facemood/releases/<timestamp-commit>/site`; active symlink `/var/www/facemood/current`. Config `/etc/nginx/sites-available/facemood.conf`, linked from sites-enabled. Backups `/var/backups/facemood/<release>/` record previous config, firewall configuration and release target. Only TCP 8443 is added to the existing nftables policy, both live and persistent; existing rules are not flushed. Nginx configuration is validated before graceful reload. Installation failure restores the previous app/config and removes only the new firewall rule.

Rollback: inspect `previous.json` in the relevant backup, restore the `current` symlink to its recorded target, run `nginx -t` then `systemctl reload nginx`. For initial deployment, remove only the FaceMood site symlink and its labeled firewall rule if decommissioning; retain all other sites. No vLLM/Qwen or other application service is stopped/restarted.

The `/version.json` endpoint records exact source commit/release/model SHA. After deployment verify HTTPS, active.json `Cache-Control: no-store`, ONNX/WASM MIME types, real browser model load, local IndexedDB reuse and camera permission handling. A cloud security group may additionally need TCP 8443 allowed if external checks fail.

Repository publication uses a fresh main snapshot. Earlier local-only history containing dataset-derived fixtures is retained on the local `facemood-live` branch and MUST NOT be pushed. Current browser parity fixtures contain synthetic numerical patterns, not FER2013 pixels. Dataset archives, per-image manifests, duplicates, raw checkpoints, candidate weights and credentials remain local.
