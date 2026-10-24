
const { parseMarketIndex, marketInstallTarget } = await import("file:///C:/Users/NIKITA/Documents/kimi/dsh-asar/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js");
const fs = await import("fs");
const doc = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const idx = parseMarketIndex(doc, "https://rumemory.github.io/deepseek-harness-ru/market.json");
console.log("VALID. plugins:", idx.plugins.length, "| install spec:", JSON.stringify(marketInstallTarget("dsh-locale-ru", idx.plugins[0].versions[0])));
