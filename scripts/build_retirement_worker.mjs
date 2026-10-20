// One-time migration at the old URL for already-installed offline clients.
// New app never registers a service worker.
import { writeFile } from "node:fs/promises";
await writeFile(
  `${process.argv[2] || "dist"}/sw.js`,
  `self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('facemood-'))await caches.delete(key);await self.registration.unregister();})()));`,
);
