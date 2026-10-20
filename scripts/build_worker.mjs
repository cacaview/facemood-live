import { build } from "esbuild";
await build({
  entryPoints: ["src/inference.worker.ts"],
  outfile: "public/inference-worker.js",
  bundle: true,
  format: "iife",
  target: "es2022",
  define: { "import.meta.url": "self.location.href" },
  minify: true,
});
