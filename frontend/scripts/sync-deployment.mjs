// Copies the deployment record into the bundle so `frontend/` builds standalone
// (e.g. from a Vercel project rooted here). Keeps the committed copy when the
// repo-level record is not present.
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../deployments/studio-next.json");
const dst = resolve(here, "../src/lib/deployment.json");
if (existsSync(src)) {
  copyFileSync(src, dst);
  console.log("synced deployments/studio-next.json -> src/lib/deployment.json");
}
