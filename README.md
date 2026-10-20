# FaceMood Live v1.0

Vue 3 + TypeScript 在线网页，本地模型实时面部表情分类。默认 MediaPipe CPU 人脸定位 + ONNX Runtime Web WASM 分类，串行 Worker，只分析最大主脸。Windows Chromium / iPhone Safari 是目标平台；当前自动化环境是 macOS Chromium，真机状态见 reports/device_matrix.md。

## 立即运行
要求 Node.js 22.12+；仓库已包含模型与本地运行资源，不依赖 CDN。

```sh
npm ci
npm run assets
npm run dev
```

打开 http://localhost:5173 。也可 `npm run build` 后 `npm run preview -- --port 4173`，打开 http://localhost:4173 。启动摄像头需要浏览器允许权限。没有摄像头可点击「内置样例」或选择自己的图片/视频（明确标注演示素材）。如果模型加载失败，先检查本地资源完整性，再点加载/重试。

iPhone 通过局域网 HTTP IP 访问不能获得摄像头权限；必须用 HTTPS 托管或受设备信任的开发证书。不要把 localhost 链接当作手机链接。iOS video 使用 playsinline、muted，启动需要用户点击。画面下方可从「摄像头」下拉框选择内建、USB、虚拟摄像头等浏览器可用设备；运行中选择会先释放旧设备，再按精确 deviceId 切换。首次授权后自动刷新名称，支持手动刷新、热插拔和镜像预览。所选设备不可用会报错，不会静默打开另一台。

## 发布与本地模型更新

```sh
npm run assets
npm test
npm run build
npm run preview -- --port 4173
npm run test:e2e
```

只部署 **dist/** 到 HTTPS 静态服务器。无需服务端 API、账户或 GPU，网站默认不上传图像。Cloudflare Pages 等托管：构建命令 `npm ci && npm run assets && npm run build`，输出目录 `dist`。这里没有执行外部发布；发布前必须确认用户数据与比赛使用授权，并完成真机验收。可用 HTTP/HTTPS Content-Encoding br/gzip 和正确的 wasm MIME `application/wasm`，hash JS 可长期缓存，index.html、sw.js 避免长期缓存。不要将整个工作目录部署（含原始人脸数据和报告）。

打开页面会自动联网读取 `/models/active.json`（不缓存版本检查），按 SHA-256 判断模型是否变化。表情模型及人脸检测模型保存在浏览器 IndexedDB；版本不变时直接使用已校验的本地文件，有更新才下载，并在校验通过后原子替换。旧版本在下载/校验失败时保留，但本次启动会报错要求重试，不冒充已经更新成功。浏览器禁止存储或配额不足时，本次仍可使用已校验下载，之后可能需要重新下载。

网页和 JS/WASM 由网站正常加载，不提供整站离线模式，不再注册 Service Worker。`dist/sw.js` 仅用于让曾安装的旧离线版本注销并清除 FaceMood 自身的旧 Cache Storage；需随发布保留一段迁移期。新入口也主动清理旧注册及缓存，必要时只刷新一次。模型数据库不会随清理删除。不再承诺断网刷新可打开远程网页；已加载完成的识别仍是本地计算。

更新模型：经评测确认后发布模型文件及对应 `active.json`（包含 id/path/sha256/输入输出契约）。同路径的新文件必须同时更新 SHA，建议版本化文件名并最后发布 manifest；错误 SHA/不兼容契约不会覆盖可用本地记录。没有发现更新时不会每次重下35MB权重。此处“本地”指当前浏览器的专用存储，不是用户下载文件夹，无法跨浏览器共享。浏览器清除网站数据后需重新下载。


## 验证与数据审计

Python 3.12 建立独立环境，不改变现有服务器环境：

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-eval.txt
.venv/bin/python -m pytest tests -q
.venv/bin/python scripts/audit_dataset.py --zip 情绪检测.zip
.venv/bin/python scripts/evaluate.py --zip 情绪检测.zip
npx playwright install chromium
npm run test:e2e
# 先保持 preview 运行，再运行200帧单飞吞吐测试
node scripts/browser_benchmark.mjs
```

Windows 用 `.venv\Scripts\python.exe` 替代上例 Python 路径。审计仅从 ZIP 读取，不解压覆盖、不改动原图。PublicTest 为固定验证集；PrivateTest 未评测。最终模型封存后可显式 `--split PrivateTest --final-test`，已有最终结果会拒绝重复运行。FER+ 预训练用过 FER2013，且原拆分有重复泄漏，成绩不是独立泛化证明。

一键回滚：`npm run rollback:baseline` 校验冻结权重并重置 active.json、重新构建（不会改动数据或服务）。前端默认读取 active.json 并核对模型SHA。

基线 SHA/输入/类别顺序/概率后处理见 models/baseline/config.json 与 model_card.md；所有显示平滑都在 UI，评测使用原始输出。多脸只选择最大脸，未做身份追踪；脸丢失时立即清除结果。

## 候选训练与 GPU（必须先获授权）

下面是可复现的脚本，不表示本地已经使用服务器 GPU。Linux 服务器请新建训练虚拟环境，禁止修改 vLLM 环境。安装 `training/requirements.txt`。服务器 CUDA/PyTorch/V100/AMP 兼容性待真实窗口验证，不能把 CPU smoke 当 GPU 验收。

```sh
# CPU最小通路：只验证训练/保存/导出，结果不得替换基线
python -m training.train --device cpu --epochs 1 --limit 64 --window-minutes 2 --run-id cpu-smoke
python -m training.export training/runs/cpu-smoke/best.pt --out models/candidate-smoke
# 仅用户明确授权并释放GPU后，单卡15分钟探测
python -m training.train --device cuda:0 --allow-gpu --window-minutes 15 --run-id v100-probe-001
# 断点恢复使用新run-id，明确传本地可信checkpoint
python -m training.train --resume training/runs/v100-probe-001/last.pt --device cuda:0 --allow-gpu --window-minutes 15 --run-id v100-resume-002
# 训练进程完全退出后只读检查；不会操作服务
python -m training.verify_gpu
```

没有停服、重启、杀进程或恢复 vLLM 的命令。任何已有 GPU 计算进程都会阻止 GPU 训练。单卡探测后才决定并行实验或 DDP；多卡训练尚未实现。不保证每个 epoch 时间，不会自动续订超过 6h 的预算。默认 CPU、15分钟上限，Ctrl+C/SIGTERM 在批次边界安全保存；20秒清理预留是软上限。记录包括运行ID、时间/时区、窗口剩余、设备、采样、最佳指标、ETA、git版本、checkpoint SHA、失败原因。原始 CSV/JSON 与 epochs.csv 在 reports/、training/runs/。若数据仍有泄漏，不能据此宣称候选提升可以泛化。

Tiny CNN 是低依赖候选训练通路，没有 ImageNet 预训练；CPU smoke 非准确率训练。AMP 为显式选项，未在 V100 验证。不自动升为默认模型：先完整验证集选型，再独立浏览器速度、大小、概率校验及最终测试。候选归一化 /255，与 baseline raw0..255不同；须独立配置，不能只替换ONNX路径。恢复会保存参数/优化器/scaler/RNG；中断于一轮内会从该轮重新采样，不承诺逐batch完全等价。

## 状态、文档与演示

- reports/dataset_audit.md：全量审计、类别分布、精确/近重复及局限。
- reports/baseline_evaluation.md：unsmoothed验证结果、每类支持度和混淆矩阵。
- reports/test_report.md、device_matrix.md：实际测试范围与未测项。
- reports/gpu_budget.md、gpu_runs.csv、gpu_samples.csv：预算与真实资源账本。
- docs/privacy.md、THIRD_PARTY_NOTICES.md、models/baseline/model_card.md：隐私、来源、许可、回滚。
- docs/demo_guide.md：现场演示顺序与故障恢复。

面部表情分类不能读取内心情绪，不用于医学或心理诊断。用户 ZIP 未附可核验授权，不公开数据或原权重。GPU、外部 HTTPS 发布、Windows/iPhone 真机确认是待用户配合的后续阶段。

## 服务器部署与源码仓库
公开仓库：`cacaview/facemood-live`。独立 HTTPS 地址：`https://106.53.199.187:8443/`；部署方法、备份及回滚见 deploy/README.md。服务器只托管静态资源，不占GPU。源码公开快照仅含合规模型、公开领域样例及合成数值测试输入，不含FER2013原图/原始像素或SSH密钥。历史本地分支禁止一并推送。
