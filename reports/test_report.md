# FaceMood Live — 本地阶段测试报告

记录日期：2026-10-20，北京时间。源码在当前工作目录；本地 preview 端口4173，未执行外部发布。

## 实测证据
|检查|结果|实际范围/耗时|
|---|---|---|
|前端单元测试|9通过|裁剪、RGB灰度、softmax/无效输出、标签、低信度、单飞、60秒统计、框平滑、Worker故障/初始化取消|
|Python单元测试|6通过|审计损坏图/跨拆分重复、contempt错误、失败日志、卡时、忙卡拒绝日志（模拟，不调用GPU）、重叠wall-clock并集|
|Playwright|7通过|实模型/无脸/权限拒绝后恢复/模拟摄像头释放/素材来源/视频暂停恢复/旧离线缓存兜底/模型失败重试；整套33.31s|
|类型检查及生产构建|通过|Vite构建约0.8s（不含依赖安装和模型下载）；本地完整产物|
|依赖审计|0已知漏洞|reports/npm-audit.json；是安装版本的公开数据库检查，不代表安全证明|
|全量ZIP审计|35887图、0损坏|14.26s，原始ZIP未修改|
|完整PublicTest基线CPU验证|3589样本|56.20s，单线程ORT 1.23.2|
|CPU训练/恢复|通过|64样本训练任务3.73s（含导入/准备）；其中训练+验证epoch 0.492s；恢复任务2.46s；最终CPU任务2.88s，详见逐run JSON；不是完整训练|
|CPU安全停止|SIGTERM后成功保存并退出|256已处理样本，2.93s，status=stopped/completed=false，CUDA设备为空|
|候选导出|PyTorch→ONNX对比通过|5个固定种子输入，最大绝对误差 7.45e-09；未晋升默认、候选浏览器验收未执行|

## 准确率（不是独立泛化成绩）
PublicTest Accuracy **56.42%**；Macro-F1 **48.04%**；Balanced Accuracy **49.54%**。
原始未平滑输出，七类真实标签，保留第八类contempt作为可能错误。每类Recall/支持度/完整混淆矩阵见 models/baseline/validation.json。PrivateTest未评。
FERPlus预训练来源包含FER2013；原数据557组完全相同像素跨拆分，716组dHash≤1跨拆分候选，未保证身份互斥。上述分数不支持声称新数据泛化精度。恐惧等类别Recall弱，不适合心理状态推断。

## 实际浏览器性能（macOS，无界面Chromium，非Windows/iPhone）
5次预热 + 200次串行完整脸检测/裁剪/分类（重复公开领域静态样例，无采样节流）。
|环节|平均 ms|P50 ms|P95 ms|
|---|---:|---:|---:|
|检测|5.07|5.00|5.60|
|预处理|0.12|0.10|0.20|
|分类|66.66|63.10|87.60|
|端到端，含bitmap创建/往返|73.77|70.20|94.70|

完成吞吐 **13.56次/秒**，不是页面渲染FPS，也不是Windows/iPhone摄像头FPS。单worker首次初始化（含本地模型加载及warmup）2545.5ms；完整页面冷/热首次可用时间尚未分开测。5个相同float32样例的Python→WASM最大概率误差 1.06e-07。200帧串行门控无队列拥塞，忙时丢帧为0；视频原始未采样帧不计作排队丢帧。应用按推理完成时间自适应，最快20Hz调度；不能由本报告推断移动端达标。

## 未测 / 未完成
Windows/iPhone/Android真实硬件、真实摄像头10分钟、30分钟稳定性及内存趋势、iPhone离线缓存持久性/安装、独立外部准确率、最终PrivateTest、V100/AMP/显存/吞吐、完整候选训练、WebGPU运行时验证、量化、DDP、GPU并行实验、HTTPS公开发布。WebGPU没有启用，没有虚构WebGPU回退验收。

## 复现命令
npm ci; npm run assets; npm test; npm run build; npm run preview -- --port 4173
npm run test:e2e
node scripts/browser_benchmark.mjs
.venv/bin/python -m pytest tests -q
.venv/bin/python scripts/audit_dataset.py
.venv/bin/python scripts/evaluate.py
候选CPU环境和命令见 README / training/requirements-macos-intel-smoke.txt，服务器环境独立。所有实测只限所列范围；本轮开发总wall-clock未从开始完整采样，不估造总开发时长。

## 代码检查与修复
独立只读review发现并已修复：CUDA恢复CPU RNG位置、旧离线版本升级兜底、本地视频暂停/重播、摄像头来源标注、图片错误重试、训练中断计数与GPU预检失败日志。相关单元/浏览器回归通过。无额外服务操作。

## 摄像头自由选择补充（2026-10-20）
已增加设备下拉框、精确deviceId选取、启动后刷新设备名、手动刷新、热插拔检查及镜像开关；运行中换设备先关闭旧轨道，设备不可用不静默回退。前端单元9通过、类型检查/构建通过、浏览器回归9通过（41.2秒），其中2项新增覆盖精确设备请求、运行中切换、设备断开与不可用错误。当前应用内浏览器实际枚举到OBS虚拟、FaceTime内建和iPhone相机，未逐台开启或做真机性能验收。GPU使用仍为0。

## 在线网页＋本地模型缓存（用户调整需求，2026-10-20）
整站离线模式及准备按钮已移除。页面打开自动以no-store读取最新manifest，浏览器IndexedDB保存两种模型；SHA未变复用，更新时下载并验证后事务替换。校验失败保留旧记录并报错，不把旧版本当更新成功。存储不可用时可运行已验证下载，下次可能重下。旧Service Worker注销和本应用Cache Storage清理已接入，sw.js只用于迁移旧安装。
前端单元14通过（新增首次下载/复用、合法更新、失败保留、损坏缓存重取、存储不可用）；类型检查及构建通过；浏览器9项全部通过，整套53.6秒，其中真实IndexedDB/网络计数确认两次打开请求manifest两次、ONNX权重只下载一次，旧离线缓存已清理。模型、标签和精度未变；旧报告中的整站离线验收属于历史能力，不再是当前产品承诺。GPU使用0。
