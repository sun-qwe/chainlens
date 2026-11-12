/**
 * 论文插图截图：通过 shot 服务按深链截取 ChainLens 六个视图 + 导入错误态。
 * 前置：python serve.py（8787）、node tools/shot-service.mjs（8799）。
 * 输出：screenshots/final/*.png 与 thesis/figures/*.png
 * 用法：node tools/capture-thesis.mjs [--only 5-3,5-4]
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.CHAINLENS_BASE || "http://127.0.0.1:8787/visualizer/";
const SHOT = process.env.SHOT_SERVICE || "http://127.0.0.1:8799/shot";
const ROOT = resolve(import.meta.dirname, "..");
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg >= 0 ? String(process.argv[onlyArg + 1]).split(",").map((s) => s.trim()) : null;

const importErrorEval = `
const content = await fetch('/data/fixtures/invalid-demo.jsonl').then((r) => r.text());
document.getElementById('btn-import').click();
await new Promise((r) => setTimeout(r, 350));
const zone = document.querySelector('[data-role="dropzone"]');
if (!zone) return { ok: false, reason: 'dropzone not found' };
const dt = new DataTransfer();
dt.items.add(new File([content], 'invalid-demo.jsonl', { type: 'application/x-ndjson' }));
zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
await new Promise((r) => setTimeout(r, 900));
const overlay = document.querySelector('.import-overlay, [data-role="dropzone"]')?.closest('.modal, .overlay, dialog, .import-overlay') || document.body;
return { ok: true, text: (overlay.innerText || document.body.innerText).slice(-1600) };
`;

const cases = [
  { id: "5-3", name: "overview", url: `${BASE}#/overview?scenario=campus-lab`, wait: 3800, eval: null },
  { id: "5-4", name: "graph-view", url: `${BASE}#/graph?scenario=campus-lab&critical=1&focus=vuln-002&zoom=1.1&cursor=18`, wait: 5000, eval: null },
  { id: "5-5", name: "timeline", url: `${BASE}#/timeline?scenario=campus-lab&cursor=15`, wait: 4200, eval: null },
  { id: "5-6", name: "attack", url: `${BASE}#/attack?scenario=campus-lab`, wait: 4200, eval: null },
  { id: "5-7", name: "findings", url: `${BASE}#/findings?scenario=campus-lab`, wait: 4000, eval: null },
  { id: "5-8", name: "report", url: `${BASE}#/report?scenario=campus-lab`, wait: 4200, eval: null },
  { id: "6-3", name: "import-error", url: `${BASE}#/overview?scenario=campus-lab`, wait: 3800, eval: importErrorEval }
];

async function shot(c) {
  const body = { url: c.url, width: 1600, height: 1000, wait: c.wait };
  if (c.out) body.out = c.out;
  if (c.eval) body.eval = c.eval;
  const res = await fetch(SHOT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { res, json: await res.json() };
}

for (const c of cases) {
  if (only && !only.includes(c.id)) continue;
  const dir = `screenshots/final`;
  mkdirSync(resolve(ROOT, dir), { recursive: true });
  const out = `${dir}/fig-${c.id}-${c.name}.png`;
  const { res, json } = await shot({ ...c, out });
  if (!res.ok || json.ok !== true) {
    console.error(`FAIL fig-${c.id}`, JSON.stringify(json).slice(0, 600));
    continue;
  }
  if (c.name === "import-error") {
    console.log("import error state:", JSON.stringify(json.eval).slice(0, 900));
  }
  copyFileSync(resolve(ROOT, out), resolve(ROOT, `thesis/figures/fig-${c.id}-${c.name}.png`));
  console.log(`OK fig-${c.id} -> ${out}  errors=${(json.errors || []).length}`);
}
