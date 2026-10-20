<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import {
  labels,
  displayPrediction,
  smooth,
  smoothBox,
  RollingMetrics,
  type Box,
} from "./core";
import { InferenceEngine } from "./engine";
const video = ref<HTMLVideoElement>(),
  overlay = ref<HTMLCanvasElement>(),
  image = ref<HTMLImageElement>();
const appBase = import.meta.env.BASE_URL;
const engine = new InferenceEngine(),
  metrics = new RollingMetrics();
const ready = ref(false),
  loading = ref(false),
  running = ref(false),
  requesting = ref(false),
  error = ref(""),
  status = ref("等待启动"),
  backend = ref("未加载"),
  mode = ref<"camera" | "image" | "video">("camera"),
  selectedCamera = ref("");
const cameras = ref<MediaDeviceInfo[]>([]);
const cameraNotice = ref("首次授权后可显示完整设备名称");
let cameraEnumeration = 0;
const probabilities = ref<number[] | null>(null),
  box = ref<Box | null>(null),
  faces = ref(0),
  mirror = ref(true),
  url = ref(""),
  online = ref(navigator.onLine),
  renderFps = ref(0),
  dropped = ref(0),
  summary = ref(metrics.summary(performance.now()));
const trend = ref<{ t: number; p: number }[]>([]),
  raw = ref<number[] | null>(null);
let stream: MediaStream | null = null,
  token = 0,
  loadPromise: Promise<void> | null = null,
  renderId = 0,
  lastRender = 0,
  renderCount = 0,
  renderStart = 0,
  lastCompleted = 0;
const primary = computed(() => displayPrediction(probabilities.value)),
  confidence = computed(() =>
    probabilities.value ? Math.max(...probabilities.value) : 0,
  );
const points = computed(() => {
  const now = performance.now();
  return trend.value
    .map((v) => `${Math.max(0, 300 - (now - v.t) / 200)},${70 - v.p * 60}`)
    .join(" ");
});
async function load() {
  if (ready.value) return;
  if (loadPromise) return loadPromise;
  loading.value = true;
  error.value = "";
  status.value = "正在检查模型版本…";
  loadPromise = (async () => {
    try {
      const r = await engine.init((message) => {
        status.value = message;
      });
      backend.value = r.backend;
      ready.value = true;
      status.value = "模型已就绪";
    } catch (e) {
      fail(e);
    } finally {
      loading.value = false;
      loadPromise = null;
    }
  })();
  return loadPromise;
}
function fail(e: unknown) {
  error.value = e instanceof Error ? e.message : String(e);
  status.value = "需要处理";
  if (!engine.ready) ready.value = false;
}
function clearPrediction() {
  probabilities.value = null;
  raw.value = null;
  box.value = null;
  faces.value = 0;
  const c = overlay.value;
  c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
}
function stop() {
  token++;
  running.value = false;
  requesting.value = false;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video.value) {
    video.value.pause();
    video.value.srcObject = null;
  }
  clearPrediction();
  status.value = "已停止";
}
async function startCamera() {
  stop();
  if (url.value.startsWith("blob:")) URL.revokeObjectURL(url.value);
  url.value = "";
  const generation = token;
  mode.value = "camera";
  error.value = "";
  requesting.value = true;
  try {
    if (!window.isSecureContext)
      throw Error("摄像头需要 HTTPS 或 localhost。请使用安全链接打开。");
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error("此浏览器无法访问摄像头，请改用本地素材。");
    const s = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(selectedCamera.value
          ? { deviceId: { exact: selectedCamera.value } }
          : { facingMode: { ideal: "user" } }),
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
    if (generation !== token) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = s;
    const settings = s.getVideoTracks()[0]?.getSettings();
    if (settings?.deviceId) selectedCamera.value = settings.deviceId;
    if (settings?.facingMode) mirror.value = settings.facingMode === "user";
    await refreshCameras();
    if (generation !== token) return;
    for (const t of s.getVideoTracks())
      t.onended = () => {
        if (generation === token) {
          stop();
          status.value = "摄像头已断开，请重新启动";
        }
      };
    const v = video.value!;
    v.src = "";
    v.srcObject = s;
    await v.play();
    await load();
    if (generation !== token) return;
    if (!ready.value) {
      stop();
      return;
    }
    running.value = true;
    status.value = "摄像头实时识别";
    loop(generation);
  } catch (e) {
    if (generation === token) {
      stop();
      const name = (e as Error).name;
      fail(
        name === "NotAllowedError"
          ? Error(
              "摄像头权限被拒绝。请在浏览器设置中允许摄像头，然后重试；也可上传图片。",
            )
          : name === "OverconstrainedError" || name === "NotFoundError"
            ? Error(
                "所选摄像头不可用或已断开。请刷新设备列表，重新选择摄像头后启动。",
              )
            : e,
      );
    }
  } finally {
    if (generation === token) requesting.value = false;
  }
}
async function refreshCameras(deviceChanged = false) {
  if (!navigator.mediaDevices?.enumerateDevices) {
    cameraNotice.value = "浏览器不支持列出设备，仍可尝试系统默认摄像头";
    return;
  }
  const version = ++cameraEnumeration;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "videoinput" && d.deviceId,
    );
    if (version !== cameraEnumeration) return;
    cameras.value = devices;
    cameraNotice.value =
      devices.length && devices.every((d) => d.label)
        ? `找到 ${devices.length} 个摄像头，可直接选择切换`
        : "首次点击启动并授权后，可显示更多摄像头及设备名称";
    if (
      deviceChanged &&
      selectedCamera.value &&
      !devices.some((d) => d.deviceId === selectedCamera.value)
    ) {
      if (mode.value === "camera" && (running.value || requesting.value))
        stop();
      selectedCamera.value = "";
      status.value = "所选摄像头已断开，请重新选择并启动";
    }
  } catch {
    if (version === cameraEnumeration)
      cameraNotice.value = "无法读取设备列表，请允许摄像头权限后刷新设备";
  }
}
function deviceChange() {
  void refreshCameras(true);
}
async function chooseCamera() {
  if (mode.value === "camera" && (running.value || requesting.value))
    await startCamera();
}
async function selectMedia(event: Event) {
  const f = (event.target as HTMLInputElement).files?.[0];
  if (!f) return;
  stop();
  if (url.value) URL.revokeObjectURL(url.value);
  error.value = "";
  if (f.size > 100 * 1024 * 1024) {
    fail(Error("请选择小于 100 MB 的图片或视频"));
    return;
  }
  if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
    fail(Error("请选择图片或视频"));
    return;
  }
  mode.value = f.type.startsWith("image/") ? "image" : "video";
  mirror.value = false;
  url.value = URL.createObjectURL(f);
  (event.target as HTMLInputElement).value = "";
  status.value = "演示素材 · 准备中";
}
function useSample() {
  stop();
  if (url.value.startsWith("blob:")) URL.revokeObjectURL(url.value);
  mode.value = "image";
  mirror.value = false;
  url.value = `${import.meta.env.BASE_URL}samples/astronaut.png`;
  status.value = "演示素材 · NASA 公开领域样例";
}
async function mediaReady() {
  if (mode.value === "camera" || running.value) return;
  const generation = token;
  await load();
  if (generation !== token || !ready.value) return;
  try {
    running.value = true;
    if (mode.value === "video") await video.value!.play();
    status.value = "演示素材 · 本地处理";
    if (mode.value === "image") await inferOnce(generation);
    else loop(generation);
  } catch (e) {
    if (generation === token) {
      stop();
      fail(e);
    }
  }
}
function pauseVideo() {
  if (mode.value !== "video") return;
  token++;
  running.value = false;
  clearPrediction();
  status.value = "演示素材 · 已暂停";
}
function resumeVideo() {
  if (mode.value === "video" && !running.value) void mediaReady();
}
async function inferOnce(generation: number) {
  const source = mode.value === "image" ? image.value : video.value;
  if (!source || generation !== token) return;
  const w =
      source instanceof HTMLVideoElement
        ? source.videoWidth
        : source.naturalWidth,
    h =
      source instanceof HTMLVideoElement
        ? source.videoHeight
        : source.naturalHeight;
  if (!w || !h) return;
  const start = performance.now();
  const capture = document.createElement("canvas");
  const scale = Math.min(1, 640 / w, 640 / h);
  capture.width = Math.round(w * scale);
  capture.height = Math.round(h * scale);
  capture
    .getContext("2d")!
    .drawImage(source, 0, 0, capture.width, capture.height);
  const bitmap = await createImageBitmap(capture);
  if (generation !== token) {
    bitmap.close();
    return;
  }
  const r = await engine.infer(bitmap);
  if (!r || generation !== token) return;
  faces.value = r.faces;
  box.value = r.box ? smoothBox(box.value, r.box) : null;
  raw.value = r.probabilities;
  if (r.probabilities) {
    const now = performance.now();
    probabilities.value = smooth(probabilities.value, r.probabilities);
    metrics.add(now, now - start, r.detect, r.preprocess, r.classify);
    lastCompleted = now;
    trend.value.push({ t: now, p: Math.max(...probabilities.value!) });
    trend.value = trend.value.filter((v) => now - v.t <= 60000);
  } else {
    clearPrediction();
    status.value =
      mode.value === "camera"
        ? "未检测到人脸 · 请面向镜头"
        : "演示素材 · 未检测到人脸";
  }
  summary.value = metrics.summary(performance.now());
  dropped.value = engine.dropped;
  draw(r.width || capture.width, r.height || capture.height);
  if (mode.value === "image") running.value = false;
}
async function loop(generation: number) {
  if (generation !== token || !running.value) return;
  if (mode.value === "video" && video.value?.paused) {
    running.value = false;
    return;
  }
  const started = performance.now();
  try {
    await inferOnce(generation);
  } catch (e) {
    if (generation === token) {
      stop();
      fail(e);
    }
    return;
  }
  if (generation === token && running.value)
    setTimeout(
      () => loop(generation),
      Math.max(0, 50 - (performance.now() - started)),
    );
}
function draw(w: number, h: number) {
  const c = overlay.value;
  if (!c) return;
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  if (!box.value) return;
  const b = box.value;
  ctx.strokeStyle = "#70e4bc";
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y, b.width, b.height);
}
function exportStats() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          model: "FERPlus-opset8",
          backend: backend.value,
          source: mode.value,
          metrics: summary.value,
          rawProbabilities: raw.value,
          labels,
          trend: trend.value,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  download(blob, "facemood-metrics.json");
}
function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function screenshot() {
  if (!window.confirm("截图将包含当前面部图像，并保存到你的设备。是否继续？"))
    return;
  const source = mode.value === "image" ? image.value : video.value;
  if (!source) return;
  const w =
      source instanceof HTMLVideoElement
        ? source.videoWidth
        : source.naturalWidth,
    h =
      source instanceof HTMLVideoElement
        ? source.videoHeight
        : source.naturalHeight;
  if (!w || !h) return;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  if (mirror.value) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, w, h);
  if (overlay.value) ctx.drawImage(overlay.value, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#10161e";
  ctx.fillRect(0, h - 42, w, 42);
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText(
    `FaceMood · ${primary.value} · ${mode.value === "camera" ? "实时" : "演示素材"}`,
    16,
    h - 14,
  );
  c.toBlob((b) => b && download(b, "facemood.png"));
}
function visibility() {
  if (document.hidden) {
    if (running.value || requesting.value) {
      stop();
      status.value = "已在后台暂停，返回后请重新启动";
    }
  }
}
function connectivity() {
  online.value = navigator.onLine;
}
function render(now: number) {
  renderCount++;
  if (!renderStart) renderStart = now;
  if (now - renderStart >= 1000) {
    renderFps.value = Math.round((renderCount * 1000) / (now - renderStart));
    renderStart = now;
    renderCount = 0;
    summary.value = metrics.summary(now);
    trend.value = trend.value.filter((v) => now - v.t <= 60000);
    if (running.value && lastCompleted && now - lastCompleted > 2000)
      clearPrediction();
  }
  lastRender = now;
  renderId = requestAnimationFrame(render);
}
onMounted(() => {
  void load();
  void refreshCameras();
  navigator.mediaDevices?.addEventListener("devicechange", deviceChange);
  renderId = requestAnimationFrame(render);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("online", connectivity);
  window.addEventListener("offline", connectivity);
});
onBeforeUnmount(() => {
  cameraEnumeration++;
  navigator.mediaDevices?.removeEventListener("devicechange", deviceChange);
  stop();
  engine.close();
  cancelAnimationFrame(renderId);
  if (url.value) URL.revokeObjectURL(url.value);
  document.removeEventListener("visibilitychange", visibility);
  window.removeEventListener("online", connectivity);
  window.removeEventListener("offline", connectivity);
});
</script>

<template>
  <div class="app">
    <header>
      <a class="brand" :href="appBase" aria-label="FaceMood 首页"
        ><span class="brand-icon" aria-hidden="true"
          ><svg viewBox="0 0 32 32" fill="none">
            <path
              d="M11 4H7a3 3 0 0 0-3 3v4m17-7h4a3 3 0 0 1 3 3v4M4 21v4a3 3 0 0 0 3 3h4m10 0h4a3 3 0 0 0 3-3v-4"
              stroke="currentColor"
              stroke-width="2"
            />
            <path
              d="M11 13v2m10-2v2m-10 5c3 3 7 3 10 0"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            /></svg></span
        ><span>FaceMood <b>LIVE</b></span></a
      ><span class="local-badge"><i></i> 设备本地处理</span>
    </header>
    <section class="intro">
      <div>
        <p class="eyebrow">你的实时表情观察台</p>
        <h1>每一个表情，都在此刻。</h1>
        <p>打开摄像头，探索面部表情的细微变化。</p>
      </div>
      <span class="connection"
        >{{ online ? "在线" : "离线" }} / {{ backend }}</span
      >
    </section>
    <main>
      <section class="viewer panel">
        <div class="panel-heading">
          <span
            ><i class="dot" :class="{ active: running }"></i>
            {{ mode === "camera" ? "实时画面" : "演示素材" }}</span
          ><span class="tag">{{
            faces > 1 ? `${faces} 张人脸 · 仅分析最大主脸` : "单人脸模式"
          }}</span>
        </div>
        <div class="stage" :class="{ mirrored: mirror }">
          <video
            ref="video"
            v-show="mode !== 'image'"
            :src="mode === 'video' ? url : undefined"
            playsinline
            muted
            :controls="mode === 'video'"
            @loadeddata="mode === 'video' && mediaReady()"
            @play="resumeVideo"
            @pause="pauseVideo"
            @ended="
              pauseVideo();
              status = '演示视频已结束';
            "
            @error="
              mode !== 'camera' &&
              fail(Error('素材无法解码，请选择 JPEG/PNG 或浏览器支持的 MP4'))
            "
          ></video>
          <img
            ref="image"
            v-show="mode === 'image'"
            :src="mode === 'image' ? url : undefined"
            alt="用户选择的本地演示素材"
            @load="mediaReady"
            @error="mode === 'image' && fail(Error('图片无法解码，请更换素材'))"
          />
          <canvas ref="overlay" class="overlay"></canvas>
          <div class="placeholder" v-if="!running && !url && !stream">
            <div class="face-outline" aria-hidden="true">
              <svg viewBox="0 0 160 160" fill="none">
                <path
                  d="M42 16H26a10 10 0 0 0-10 10v16m102-26h16a10 10 0 0 1 10 10v16M16 118v16a10 10 0 0 0 10 10h16m76 0h16a10 10 0 0 0 10-10v-16"
                  stroke="currentColor"
                  stroke-width="2"
                />
                <path
                  d="M80 29c-28 0-43 23-39 50 3 30 17 52 39 52s36-22 39-52c4-27-11-50-39-50Z"
                  stroke="currentColor"
                  stroke-opacity=".4"
                />
                <path
                  d="M59 69h8m26 0h8M65 99c9 8 21 8 30 0m-15-23-4 12h8"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                />
                <path
                  d="M27 80h106"
                  stroke="currentColor"
                  stroke-opacity=".22"
                  stroke-dasharray="3 5"
                />
              </svg>
            </div>
            <h2>从一个表情开始</h2>
            <p>启动摄像头，或选择本地素材体验</p>
            <small>画面仅在此设备处理，不采集音频</small>
          </div>
          <div class="source-label" v-if="url && mode !== 'camera'">
            演示素材 · 非实时摄像头
          </div>
        </div>
        <div class="camera-picker">
          <label for="camera-device">摄像头</label>
          <select
            id="camera-device"
            v-model="selectedCamera"
            @change="chooseCamera"
            :disabled="requesting"
          >
            <option value="">系统默认摄像头</option>
            <option
              v-for="(device, index) in cameras"
              :key="device.deviceId"
              :value="device.deviceId"
            >
              {{ device.label || `摄像头 ${index + 1}（授权后显示名称）` }}
            </option>
          </select>
          <button @click="refreshCameras()" :disabled="requesting">
            刷新设备
          </button>
          <label class="mirror-toggle"
            ><input type="checkbox" v-model="mirror" /> 镜像预览</label
          >
          <small>{{ cameraNotice }}</small>
        </div>
        <div class="controls">
          <button
            class="primary"
            @click="startCamera"
            :disabled="requesting || loading"
          >
            {{ requesting ? "等待摄像头授权…" : "启动摄像头" }}</button
          ><button @click="stop" :disabled="!running && !requesting">
            停止</button
          ><label class="button"
            >本地图片 / 视频<input
              type="file"
              accept="image/*,video/*"
              @change="selectMedia" /></label
          ><button v-if="url" @click="mediaReady">重新分析素材</button
          ><button @click="useSample">内置样例</button
          ><button @click="screenshot" :disabled="!box">截图</button>
        </div>
        <div class="status" role="status">
          {{ status }} <span v-if="loading">首次加载可能需要稍候</span
          ><button v-if="!ready && !loading" class="text-button" @click="load">
            加载 / 重试模型
          </button>
        </div>
        <div class="error" role="alert" v-if="error">
          {{ error
          }}<button
            @click="
              error = '';
              load();
            "
          >
            重试模型
          </button>
        </div>
      </section>
      <aside class="panel results">
        <div class="panel-heading">
          表情分析 <span class="tag">FER+ / 8 CLASSES</span>
        </div>
        <div class="prediction">
          <div
            class="confidence-orbit"
            :style="{ '--confidence': `${confidence * 100}%` }"
            aria-hidden="true"
          >
            <span>{{
              probabilities ? `${(confidence * 100).toFixed(0)}%` : "—"
            }}</span>
          </div>
          <span class="eyebrow">当前主要表情</span>
          <h2>{{ primary }}</h2>
          <p>
            {{
              probabilities
                ? `${(confidence * 100).toFixed(1)}% 显示置信度`
                : "等待有效人脸输入"
            }}
          </p>
        </div>
        <div class="probabilities">
          <div
            v-for="(label, i) in labels"
            :key="label"
            class="probability"
            :class="{
              leading: probabilities && probabilities[i] === confidence,
            }"
          >
            <div>
              <span>{{ label }}</span
              ><span>{{
                probabilities ? `${(probabilities[i] * 100).toFixed(1)}%` : "—"
              }}</span>
            </div>
            <div class="bar">
              <i :style="{ width: `${(probabilities?.[i] || 0) * 100}%` }"></i>
            </div>
          </div>
        </div>
        <p class="subtle">
          概率经过显示平滑；置信度低于 45%
          显示“无法确定”。分类结果仅描述可见表情。
        </p>
      </aside>
      <section class="panel performance">
        <div class="panel-heading">
          运行指标
          <button class="text-button" @click="exportStats">
            导出统计 JSON ↗
          </button>
        </div>
        <div class="metric-grid">
          <div>
            <strong>{{ summary.fps.toFixed(1) }}</strong
            ><span>真实分类 FPS</span>
          </div>
          <div>
            <strong>{{ summary.p95.toFixed(0) }}<small> ms</small></strong
            ><span>端到端 P95</span>
          </div>
          <div>
            <strong>{{ summary.mean.toFixed(0) }}<small> ms</small></strong
            ><span>平均 / 峰值 {{ summary.peak.toFixed(0) }} ms</span>
          </div>
          <div>
            <strong>{{ renderFps }}</strong
            ><span>页面渲染 FPS</span>
          </div>
        </div>
        <div class="detail">
          最近 60 秒完成 {{ summary.count }} 次分类 · 检测
          {{ summary.detect.toFixed(1) }} / 预处理
          {{ summary.preprocess.toFixed(1) }} / 分类
          {{ summary.classify.toFixed(1) }} ms · 忙时丢弃 {{ dropped }} 帧（{{
            ((100 * dropped) / Math.max(1, engine.submitted)).toFixed(1)
          }}%）<br />串行按需采样，不积压视频帧；原视频未采样帧不计作队列丢帧。P95
          样本 {{ summary.count }} / 建议 ≥200。
        </div>
      </section>
      <section class="panel timeline">
        <div class="panel-heading">
          最近 60 秒 <span class="tag">主要表情置信度</span>
        </div>
        <svg viewBox="0 0 300 80" role="img" aria-label="最近60秒置信度趋势">
          <path
            d="M0 20H300 M0 45H300 M0 70H300"
            stroke="#283440"
            stroke-width=".5"
          />
          <polyline
            :points="points"
            fill="none"
            stroke="#8abfff"
            stroke-width="1.5"
          />
        </svg>
        <p v-if="!trend.length" class="timeline-empty">
          完成识别后，查看置信度随时间的变化
        </p>
        <div class="axis"><span>−60s</span><span>现在</span></div>
      </section>
    </main>
    <footer>
      <span>FaceMood Live v1.0 · WASM 默认后端</span
      ><span>Windows / iPhone / Android 真机验收待完成</span>
    </footer>
  </div>
</template>
