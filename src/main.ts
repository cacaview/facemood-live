import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
const legacyWorkerPath = `${import.meta.env.BASE_URL}sw.js`;
async function start() {
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const r of registrations) {
        const script =
          r.active?.scriptURL ||
          r.waiting?.scriptURL ||
          r.installing?.scriptURL;
        if (script && new URL(script).pathname === legacyWorkerPath)
          await r.unregister();
      }
      for (const key of await caches.keys())
        if (key.startsWith("facemood-")) await caches.delete(key);
      const controller = navigator.serviceWorker.controller;
      if (
        controller &&
        new URL(controller.scriptURL).pathname === legacyWorkerPath &&
        !sessionStorage.getItem("facemood-sw-retired")
      ) {
        sessionStorage.setItem("facemood-sw-retired", "1");
        location.reload();
        return;
      }
      if (!controller) sessionStorage.removeItem("facemood-sw-retired");
    } catch (error) {
      console.warn("清理旧离线版本失败", error);
    }
  }
  createApp(App).mount("#app");
}
void start();
