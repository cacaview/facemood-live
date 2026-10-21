# Deployment status — 2026-10-21 (Asia/Shanghai)

- Public test URL: https://106.53.199.187:8443/
- Release: `20261021-185308-f71799b9`; deployed application source: `f71799b941e01977c01e9d21d91f961bb260e9ed` on `codex/emotion-ecosystem-v2`. No main-branch merge was performed.
- This is the immersive particle/membrane revision with neutral, happiness and anger prototypes. The other five visual forms and physical iPhone performance acceptance remain outstanding.
- Built with `npm run build:server`. Only 6 changed files / 192,247 compressed bytes were transferred. All 27 release files were SHA-256 checked; 21 unchanged files, including the 35,040,571-byte model and WASM, were reused from the previous server release.
- Published by atomic static-release symlink replacement. Nginx configuration and nftables hashes remained unchanged; no certificate, firewall, service reload, GPU job, or vLLM change was made. Existing port 443 homepage status and body SHA-256 remained unchanged.
- Public HTTPS verification passed: model downloaded and SHA-256 matched, the existing sample classified as happiness, reload rechecked the manifest without redownloading ONNX, camera-denial recovery messaging worked, 390px layout had no horizontal overflow, and no page errors were observed. The automated monitor observed initial model readiness at 5.317 seconds in this run; this is a local headless/network observation, not a target-device or sustained-load benchmark.
- Previous release remains available: `/var/www/facemood/releases/20261020-232108-293458eb/site`.
- One-command rollback **on the server**: `python3 /var/backups/facemood/20261021-185308-f71799b9/rollback.py`. It refuses to overwrite a later deployment. The previous target and backup are recorded in `reports/deployment.json` and the server's `previous.json`.
- Public visual smoke also passed all three forms and high → low → medium quality changes, with no page errors and camera input still available. Rollback script syntax and previous release presence were verified without executing a rollback.
- Machine-readable public checks: `reports/deployment_verification.json`. Public visual-switch/quality smoke: `reports/emotion-deployment-visual.json`.

---

# Deployment status — 2026-10-20 (Asia/Shanghai)

- Public repository: https://github.com/cacaview/facemood-live
- Dedicated HTTPS endpoint: https://106.53.199.187:8443/
- Server release: `20261020-232108-293458eb`; exact deployed source commit is recorded in deployment.json and /version.json.
- Nginx configuration validation and server-local HTTPS checks passed. Existing port 443 root response hash and health endpoint were unchanged.
- Real headless Chromium verification passed through an SSH-forwarded connection, preserving the real HTTPS origin and certificate verification. Model inference, SHA-256, IndexedDB model reuse, permission recovery prompt and mobile layout passed. This earlier check does not validate public connectivity or Windows/iPhone hardware performance.
- User confirmed cloud TCP 8443 was allowed. External HTTPS requests to the page, version.json and model headers succeeded on 2026-10-20. The prior public-browser failure was traced to the fixed 90-second initialization deadline; this revision adds streamed progress and inactivity-based timeout handling. Public-browser verification for the new release is recorded in deployment_verification.json. Historical failures are retained in deployment_verification_proxy_failure.json.
- GPU use for deployment: 0 minutes, 0 GPU-card-hours. vLLM/Qwen was not accessed or changed.

Reproduce public checks from a separate network:

```sh
curl --fail https://106.53.199.187:8443/version.json
node scripts/verify_deployment.mjs https://106.53.199.187:8443/
```

Windows camera and iPhone Safari real-device acceptance remain untested.

## Public verification after this revision

The public HTTPS browser check passed without SSH forwarding on 2026-10-20 at 23:25 Asia/Shanghai. SHA-256 matched the frozen 35,040,571-byte ONNX model. The sample was classified, refreshing requested the version manifest again but did not redownload the ONNX model, permission refusal had an actionable message, the 390px layout fit, and no page errors were observed.

First ready was observed approximately 213 seconds after the page monitor began in this macOS headless Chromium network environment. The first download remains slow in this environment; this is not a target-device performance measurement. The second ready was 3.080 seconds after the first post-refresh loading status (not a complete navigation timing). Full timestamps and byte progress are preserved in deployment_verification.json. GPU use remains zero; the existing port 443 health endpoint returned status=ok after deployment.
