import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const config = JSON.parse(
  await readFile("models/baseline/config.json", "utf8"),
);
const hash = createHash("sha256")
  .update(await readFile("public" + config.path))
  .digest("hex");
if (hash !== config.sha256)
  throw Error("Frozen baseline digest mismatch; refusing rollback");
await writeFile(
  "public/models/active.json",
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  "Active configuration reset to frozen baseline. Build before serving.",
);
