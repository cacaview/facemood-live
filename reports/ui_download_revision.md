# UI and model-download revision — 2026-10-20

## Design source and decisions

Searched skills.sh and reviewed Anthropic's official frontend-design skill:
https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md

Applied a bounded visual refresh: camera-first layout, a face-framing motif, blue hierarchy, quieter secondary controls and a confidence ring driven only by actual classifier output. Base #0c1220, surface #141e30, analysis #172338, separator #28354a, accent #8abfff, text #eef3fc. Native Avenir Next / Segoe UI / PingFang SC stacks avoid new font downloads. Kept the PRD's dark appearance, responsive single column, keyboard focus and reduced motion. No animated decoration or extra runtime dependency.

Before the download fix, all 9 existing Playwright browser tests passed in 37.6 seconds. Desktop and 390px mobile screenshots were inspected. Final post-fix results are recorded in playwright.json.

## Root cause and fix

The engine previously terminated its Worker exactly 90 seconds after initialization began. It did not distinguish a slow active download from a stalled operation. Public server logs showed partial transfer of the 35,040,571-byte model at approximately that boundary. Fake-clock regression testing reproduced termination despite continuing status updates before changing production code.

The model body is now read as a stream; actual bytes and, when Content-Length is available, percentage are shown at most every 400ms. Progress resets a 90-second inactivity watchdog; a separate 10-minute overall deadline prevents indefinite initialization. A phase status is emitted before initializing the expression runtime. SHA-256 verification and atomic IndexedDB replacement remain mandatory: incomplete/invalid downloads are never saved as a usable new model.

New tests cover initialization lasting 180 seconds with progress, 90-second inactivity, the 10-minute absolute cap, streamed progress and interrupted downloads retaining no partial model. All 20 unit tests passed after the fix; both production builds passed. Public browser verification is recorded separately in deployment_verification.json.

No GPU task or vLLM/Qwen change was performed. Windows/iPhone/Android hardware acceptance remains untested.
