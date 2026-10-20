# Deployment status — 2026-10-20 (Asia/Shanghai)

- Private repository: https://github.com/cacaview/facemood-live
- Dedicated HTTPS endpoint: https://106.53.199.187:8443/
- Server release: `20261020-222022-8575489b`; exact deployed source commit is recorded in deployment.json and /version.json.
- Nginx configuration validation and server-local HTTPS checks passed. Existing port 443 root response hash and health endpoint were unchanged.
- Real headless Chromium verification passed through an SSH-forwarded connection, preserving the real HTTPS origin and certificate verification. Model inference, SHA-256, IndexedDB model reuse, permission recovery prompt and mobile layout passed. See deployment_verification.json. This does not validate public connectivity or Windows/iPhone hardware performance.
- Public TCP 8443 remains pending the user's cloud security group/light-server firewall rule. The server's own firewall already permits this port. User will allow the cloud rule later; no cloud account change was performed.
- GPU use for deployment: 0 minutes, 0 GPU-card-hours. vLLM/Qwen was not accessed or changed.

After allowing cloud inbound TCP 8443, verify from a separate network:

```sh
curl --fail https://106.53.199.187:8443/version.json
node scripts/verify_deployment.mjs https://106.53.199.187:8443/
```

Windows camera and iPhone Safari real-device acceptance remain untested.
