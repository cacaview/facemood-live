# Deployment status — 2026-10-20 (Asia/Shanghai)

- Public repository: https://github.com/cacaview/facemood-live
- Dedicated HTTPS endpoint: https://106.53.199.187:8443/
- Server release: `20261020-222022-8575489b`; exact deployed source commit is recorded in deployment.json and /version.json.
- Nginx configuration validation and server-local HTTPS checks passed. Existing port 443 root response hash and health endpoint were unchanged.
- Real headless Chromium verification passed through an SSH-forwarded connection, preserving the real HTTPS origin and certificate verification. Model inference, SHA-256, IndexedDB model reuse, permission recovery prompt and mobile layout passed. This earlier check does not validate public connectivity or Windows/iPhone hardware performance.
- User confirmed cloud TCP 8443 was allowed. External HTTPS requests to the page, version.json and model headers succeeded on 2026-10-20. Full public-browser verification encountered an incomplete model download; see deployment_verification.json and deployment_verification_proxy_failure.json. The prior SSH-forwarded inference check passed, but public model-loading acceptance is not marked passed.
- GPU use for deployment: 0 minutes, 0 GPU-card-hours. vLLM/Qwen was not accessed or changed.

Reproduce public checks from a separate network:

```sh
curl --fail https://106.53.199.187:8443/version.json
node scripts/verify_deployment.mjs https://106.53.199.187:8443/
```

Windows camera and iPhone Safari real-device acceptance remain untested.
