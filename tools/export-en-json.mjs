import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const EX = process.argv[2], OUT = process.argv[3];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(EX, "manifest.json"), "utf8"));
let done = 0, fail = 0;
for (const e of manifest) {
  if (!e.dicts?.en?.out) { console.log("SKIP (no en):", e.ns); fail++; continue; }
  const f = path.join(EX, e.dicts.en.out);
  try {
    const mod = await import(pathToFileURL(f).href);
    const dict = mod.default;
    fs.writeFileSync(path.join(OUT, e.ns + ".json"), JSON.stringify(dict, null, 2) + "\n");
    done++;
  } catch (err) { console.log("FAIL:", e.ns, String(err).slice(0, 120)); fail++; }
}
console.log("exported:", done, "failed:", fail);
