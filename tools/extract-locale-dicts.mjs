// extract-locale-dicts.mjs v2 — словари en/zh из бандлов DSH client.js
import fs from "node:fs";
import path from "node:path";

const NM = process.argv[2];
const OUT = process.argv[3];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function makeScanner(src) {
  return function scanEnd(start, stopAtSemicolon) {
    let i = start; const stack = [];
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (stack.length && stack[stack.length - 1] === "t") {
        if (c === "\\") { i += 2; continue; }
        if (c === "`") { stack.pop(); i++; continue; }
        if (c === "$" && n === "{") { stack.push("{"); i += 2; continue; }
        i++; continue;
      }
      if (c === "/" && n === "/") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
      if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; } i++; continue; }
      if (c === "`") { stack.push("t"); i++; continue; }
      if (c === "{" || c === "(" || c === "[") { stack.push(c); i++; continue; }
      if (c === "}" || c === ")" || c === "]") {
        stack.pop(); i++;
        if (stack.length === 0 && !stopAtSemicolon) return i;
        continue;
      }
      if ((c === ";" || c === ",") && stack.length === 0 && stopAtSemicolon) return i;
      i++;
    }
    return i;
  };
}

function splitTopLevel(s) {
  const parts = []; const stack = []; let cur = ""; let i = 0;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (stack.length && stack[stack.length - 1] === "t") {
      cur += c;
      if (c === "\\") { cur += s[i + 1] || ""; i += 2; continue; }
      if (c === "`") stack.pop();
      else if (c === "$" && n === "{") { stack.push("{"); cur += n; i++; }
      i++; continue;
    }
    if (c === "/" && n === "/") { const e = s.indexOf("\n", i); const seg = s.slice(i, e < 0 ? s.length : e); cur += seg; i += seg.length; continue; }
    if (c === "/" && n === "*") { const e = s.indexOf("*/", i + 2); const seg = s.slice(i, e < 0 ? s.length : e + 2); cur += seg; i += seg.length; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < s.length && s[j] !== c) { if (s[j] === "\\") j++; j++; } cur += s.slice(i, j + 1); i = j + 1; continue; }
    if (c === "`") { stack.push("t"); cur += c; i++; continue; }
    if (c === "{" || c === "(" || c === "[") { stack.push(c); cur += c; i++; continue; }
    if (c === "}" || c === ")" || c === "]") { stack.pop(); cur += c; i++; continue; }
    if (c === "," && stack.length === 0) { parts.push(cur); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(p => p.trim());
}

function resolveConstExpr(src, name) {
  const esc = name.replace(/[$]/g, "\\$");
  const re = new RegExp("(?:const|let|var)\\s+" + esc + "\\s*=\\s*", "");
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = makeScanner(src)(start, true);
  return src.slice(start, end).replace(/;+\s*$/, "");
}

function evalDict(litSrc, src) {
  const prelude = [];
  const seen = new Set();
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const val = (new Function(prelude.join("\n") + "\nreturn (" + litSrc + ");"))();
      return { val, prelude };
    } catch (e) {
      const mm = /ReferenceError: (\S+) is not defined/.exec(String(e));
      if (!mm) return { error: String(e).slice(0, 150), prelude };
      const name = mm[1];
      if (seen.has(name)) return { error: "unresolvable: " + name, prelude };
      seen.add(name);
      const expr = resolveConstExpr(src, name);
      if (expr == null) return { error: "const not found: " + name, prelude };
      prelude.push("const " + name + " = " + expr + ";");
    }
  }
  return { error: "too many deps", prelude };
}

const manifest = [];
const files = [];
for (const pkg of fs.readdirSync(NM)) {
  const dir = path.join(NM, pkg, "lib");
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) if (/^client.*\.js$/.test(f)) files.push({ pkg, file: path.join(dir, f) });
}

function saveDict(pkg, ns, lang, litSrc, src, entry) {
  const r = evalDict(litSrc, src);
  const safe = (pkg + "__" + ns + "." + lang + (r.error ? ".raw" : "") + ".js").replace(/[^\w.-]+/g, "_");
  const header = (r.prelude && r.prelude.length ? "// prelude (helper consts):\n" + r.prelude.join("\n") + "\n\n" : "");
  fs.writeFileSync(path.join(OUT, safe), header + "export default " + litSrc + ";\n");
  entry.dicts[lang] = r.error ? { error: r.error, out: safe } : { keys: Object.keys(r.val).length, out: safe };
}

for (const { pkg, file } of files.sort((a, b) => a.pkg.localeCompare(b.pkg))) {
  const src = fs.readFileSync(file, "utf8");
  const loopRe = /for\s*\(\s*const\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*of\s+(\w+)\s*\)/g;
  let lm;
  while ((lm = loopRe.exec(src))) {
    const regRe = /locale\.register\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/g;
    let rm;
    let hasMatchingRegister = false;
    while ((rm = regRe.exec(src))) {
      if (rm[2] === lm[1] && rm[3] === lm[2]) { hasMatchingRegister = true; break; }
    }
    if (!hasMatchingRegister) continue;
    const arrExpr = resolveConstExpr(src, lm[3]);
    if (!arrExpr) continue;
    const r = evalDict(arrExpr, src);
    if (r.error) { manifest.push({ pkg, file: path.basename(file), error: "loop: " + r.error }); continue; }
    regRe.lastIndex = 0;
    while ((rm = regRe.exec(src))) {
      if (rm[2] !== lm[1] || rm[3] !== lm[2]) continue;
      const nsExpr = resolveConstExpr(src, rm[1]) || ('"' + rm[1] + '"');
      const ns = nsExpr.replace(/^["'`]|[\"\'`]$/g, "");
      const entry = { pkg, file: path.basename(file), ns, dicts: {}, form: "loop" };
      for (const [lang, dict] of r.val) {
        const safe = (pkg + "__" + ns + "." + lang + ".js").replace(/[^\w.-]+/g, "_");
        fs.writeFileSync(path.join(OUT, safe), "export default " + JSON.stringify(dict, null, 2) + ";\n");
        entry.dicts[lang] = { keys: Object.keys(dict).length, out: safe };
      }
      manifest.push(entry);
    }
  }

  const re = /locale\.register\s*\(\s*/g;
  let m;
  while ((m = re.exec(src))) {
    const parenPos = m.index + m[0].length - 1;
    const end = makeScanner(src)(parenPos, false);
    const inner = src.slice(parenPos + 1, end - 1);
    const args = splitTopLevel(inner);
    if (args.length === 3) continue;
    if (args.length !== 2 || !args[1].startsWith("{")) { manifest.push({ pkg, file: path.basename(file), error: "unknown form: " + inner.slice(0, 80) }); continue; }
    const nsExpr = args[0].trim();
    let ns;
    if (/^["'`]/.test(nsExpr)) ns = nsExpr.slice(1, -1);
    else {
      const expr = resolveConstExpr(src, nsExpr);
      ns = expr ? expr.replace(/^["'`]|[\"\'`]$/g, "") : nsExpr;
    }
    const entry = { pkg, file: path.basename(file), ns, dicts: {} };
    const body = args[1].slice(1, -1);
    for (const prop of splitTopLevel(body)) {
      const ci = prop.indexOf(":");
      const key = (ci < 0 ? prop : prop.slice(0, ci)).trim().replace(/["']/g, "");
      const varName = (ci < 0 ? prop : prop.slice(ci + 1)).trim();
      const litSrc = resolveConstExpr(src, varName);
      if (litSrc == null) { entry.dicts[key] = { error: "const not found: " + varName }; continue; }
      saveDict(pkg, ns, key, litSrc, src, entry);
    }
    manifest.push(entry);
  }
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
const lines = manifest.map(e => e.error ? ("ERR  " + e.pkg + ": " + e.error) : ("OK   " + e.ns + " (" + e.pkg + ") en=" + (e.dicts?.en?.keys ?? (e.dicts?.en?.error ? "ERR " + e.dicts.en.error : "-"))));
console.log(lines.join("\n"));
console.log("TOTAL:", manifest.length);
