/**
 * 性能实验：通过 shot 服务驱动无头 Chrome，对三个场景重复运行 window.ChainLens.bench()。
 * 前置：python serve.py（8787）、node tools/shot-service.mjs（8799）。
 * 输出：docs/bench-results.json
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.CHAINLENS_BASE || "http://127.0.0.1:8787/visualizer/";
const SHOT = process.env.SHOT_SERVICE || "http://127.0.0.1:8799/shot";
const scenarios = ["campus-lab", "corp-ad", "cloud-k8s"];
const reps = Number(process.env.BENCH_REPS || 3);

async function shot(url, evalExpr, wait = 3000) {
  const res = await fetch(SHOT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, width: 1600, height: 1000, wait, eval: evalExpr })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 400));
  return json;
}

const all = [];
for (const id of scenarios) {
  const runs = [];
  for (let i = 0; i < reps; i++) {
    const r = await shot(
      `${BASE}#/overview?scenario=${id}&selftest=1`,
      `return (async () => {
        const t0 = performance.now();
        const b = await window.ChainLens.bench('${id}');
        const wall = performance.now() - t0;
        const st = window.ChainLens.app.state;
        const nav = performance.getEntriesByType('navigation')[0];
        return {
          bench: b, wallMs: Math.round(wall * 100) / 100,
          firstScreenMs: st.firstScreenMs ?? null,
          navigationMs: nav ? Math.round(nav.duration * 100) / 100 : null,
          domNodes: document.getElementsByTagName('*').length,
          memory: performance.memory ? {
            usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576 * 100) / 100,
            totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576 * 100) / 100
          } : null,
          errors: window.__chainlensErrors?.length ?? 0, consoleErrors: []
        };
      })()`,
      2200
    );
    if (r.eval) runs.push(r.eval);
    else console.warn("shot no eval", id, i, r.error);
  }
  const pick = (key) => runs.map((r) => r.bench?.[key]).filter((n) => typeof n === "number");
  const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 100) / 100;
  };
  const summary = {
    scenarioId: id,
    runs: runs.length,
    nodes: runs[0]?.bench?.nodes ?? null,
    edges: runs[0]?.bench?.edges ?? null,
    events: runs[0]?.bench?.events ?? null,
    fetchMs: median(pick("fetchMs")),
    parseMs: median(pick("parseMs")),
    layoutMs: median(pick("layoutMs")),
    renderMs: median(pick("renderMs")),
    firstScreenMs: median(pick("firstScreenMs")),
    wallMs: median(runs.map((r) => r.wallMs)),
    navigationMs: median(runs.map((r) => r.navigationMs)),
    renderedNodes: runs[0]?.bench?.renderedNodes ?? null,
    memory: runs[0]?.bench?.memory ?? runs[0]?.memory ?? null,
    domNodes: median(runs.map((r) => r.domNodes)),
    errors: runs.reduce((a, r) => a + (r.errors || 0), 0),
    samples: runs
  };
  all.push(summary);
  console.log(JSON.stringify(summary, null, 2));
}

const out = {
  at: new Date().toISOString(),
  environment: { browser: "Chrome headless 157", viewport: "1600x1000", node: process.version },
  reps,
  scenarios: all
};
writeFileSync("docs/bench-results.json", JSON.stringify(out, null, 2), "utf8");
console.log("written docs/bench-results.json");
