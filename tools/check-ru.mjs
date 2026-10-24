// check-ru.mjs <ns...> — сверка ru/<ns>.js с en-json/<ns>.json: ключи, плейсхолдеры, парсинг
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const names = process.argv.slice(2);
let bad = 0;
for (const ns of names) {
  const enPath = path.join(ROOT, "en-json", ns + ".json");
  const ruFile = path.join(ROOT, "ru", ns + ".js");
  if (!fs.existsSync(ruFile)) { console.log("MISSING", ns); bad++; continue; }
  let ru;
  try { ru = (await import(pathToFileURL(ruFile).href + "?t=" + Date.now())).default; }
  catch (e) { console.log("PARSE-FAIL", ns, String(e).slice(0, 120)); bad++; continue; }
  const en = JSON.parse(fs.readFileSync(enFile(enJSON(ns)), "utf8"));
  function enJSON(n) { return n; } function enFile(n) { return path.join(ROOT, "en-json", n + ".json"); }
  const ek = Object.keys(en), rk = Object.keys(ru);
  const missing = ek.filter(k => !(k in ru));
  const extra = rk.filter(k => !(k in en));
  const phMismatch = [];
  for (const k of ek) {
    if (!(k in ru)) continue;
    const ep = (String(en[k]).match(/\{[^}]+\}/g) || []).sort().join(" ");
    const rp = (String(ru[k]).match(/\{[^}]+\}/g) || []).sort().join(" ");
    if (ep !== rp) phMismatch.push(k + ": en[" + ep + "] ru[" + rp + "]");
  }
  const untranslated = ek.filter(k => ru[k] === en[k] && /[A-Za-z]{4,}/.test(String(en[k])) && !/^(https?:|\/|[\w.-]+@[\w.-]+$)/.test(String(en[k])));
  if (missing.length || extra.length || phMismatch.length) {
    bad++;
    console.log("BAD", ns);
    if (missing.length) console.log("  missing:", missing.slice(0, 10).join(", "));
    if (extra.length) console.log("  extra:", extra.slice(0, 10).join(", "));
    if (phMismatch.length) console.log("  placeholders:", phMismatch.slice(0, 10).join(" | "));
  } else {
    console.log("OK", ns, "(" + rk.length + " keys" + (untranslated.length ? ", untranslated: " + untranslated.slice(0, 8).join(", ") : "") + ")");
  }
}
process.exit(bad ? 1 : 0);
