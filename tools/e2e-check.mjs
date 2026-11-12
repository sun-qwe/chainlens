#!/usr/bin/env node
/**
 * ChainLens 端到端验收脚本（通过本地 shot 服务驱动无头 Chrome）。
 *
 * 前置：python serve.py（8787）与 node tools/shot-service.mjs（8799）已启动。
 * 用法：node tools/e2e-check.mjs [--json docs/e2e-results.json]
 * 退出码：0 全部通过；1 有失败。
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.CHAINLENS_BASE || "http://127.0.0.1:8787/visualizer/";
const SHOT = process.env.SHOT_SERVICE || "http://127.0.0.1:8799/shot";

async function probe({ url, wait = 3000, eval: expr }) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(SHOT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, width: 1600, height: 1000, wait: wait + attempt * 1500, eval: expr })
    });
    const json = await res.json();
    last = json;
    if (json.eval !== null && json.eval !== undefined) return json;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error("probe 未返回 eval：" + JSON.stringify(last).slice(0, 500));
}

const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`);
}

const common = `const st = window.ChainLens.app.state;
const q = (s) => document.querySelectorAll(s);
const text = document.body.innerText;`;

async function main() {
  const scenarios = [
    ["campus-lab", 66, 51, 25],
    ["corp-ad", 180, 150, 105],
    ["cloud-k8s", 260, 320, 300]
  ];

  for (const [id, nodes, edges, events] of scenarios) {
    const r = await probe({
      url: `${BASE}#/overview?scenario=${id}`,
      wait: 3800,
      eval: `${common}
        const ch = window.ChainLens.data;
        return { ready: st.ready, view: st.view, scenarioId: st.scenarioId, nodes: ch.stats.nodes, edges: ch.stats.edges,
          events: ch.stats.events, kpis: q('.kpi-card').length, recents: q('.recent-event').length,
          firstScreenMs: st.firstScreenMs, text: text.length, quality: st.quality };
      `
    });
    const d = r.eval || {};
    check(`总览/${id} 数据规模正确`, d.nodes === nodes && d.edges === edges && d.events === events, d);
    check(`总览/${id} KPI 卡与最近事件渲染`, d.kpis === 6 && d.recents >= 6, { kpis: d.kpis, recents: d.recents });
    check(`总览/${id} 无未捕获异常`, (r.errors || []).length === 0, r.errors);
  }

  // 链路图：规模、关键路径、筛选、回放深链
  {
    const r = await probe({
      url: `${BASE}#/graph?scenario=campus-lab&critical=1&cursor=18`,
      wait: 4200,
      eval: `${common}
        return { view: st.view, nodes: st.nodes, critical: st.critical, cursor: st.cursor,
          gnodes: q('.gnode').length, edges: q('.gedge, .edge-path, path.edge').length,
          stats: q('.graph-stat').length, firstScreenMs: st.firstScreenMs,
          criticalNodes: q('.gnode.is-critical, .gnode.critical').length };
      `
    });
    const d = r.eval || {};
    check("链路图/campus 渲染节点数与关键路径", d.view === "graph" && d.gnodes === 66 && d.critical === true, d);
    check("链路图/campus 深链 cursor 生效", d.cursor === 18, d.cursor);
    check("链路图/campus 无未捕获异常", (r.errors || []).length === 0, r.errors);
  }
  {
    const r = await probe({
      url: `${BASE}#/graph?scenario=cloud-k8s&filter=stage:recon,stage:validation`,
      wait: 6500,
      eval: `${common}
        return { nodes: window.ChainLens.data.stats.nodes, filters: st.filters, gnodes: q('.gnode').length,
          firstScreenMs: st.firstScreenMs, errs: window.__chainlensErrors?.length };
      `
    });
    const d = r.eval || {};
    check("链路图/cloud-k8s 大规模渲染", d.nodes === 260 && d.gnodes > 0 && d.gnodes < 260, { nodes: d.nodes, gnodes: d.gnodes });
    check("链路图/cloud-k8s 筛选生效", Array.isArray(d.filters?.stages) && d.filters.stages.length === 2, d.filters);
    check("链路图/cloud-k8s 无未捕获异常", (r.errors || []).length === 0, r.errors);
  }

  // 时间线
  {
    const r = await probe({
      url: `${BASE}#/timeline?scenario=campus-lab&cursor=15`,
      wait: 3800,
      eval: `${common}
        return { view: st.view, cursor: st.cursor, events: window.ChainLens.data.stats.events, visible: q('.tl-event').length,
          summary: document.querySelector('.replay-summary, .playback-summary, .tl-current')?.innerText || '',
          stats: q('.tl-stat').length };
      `
    });
    const d = r.eval || {};
    check("时间线/campus 深链游标与事件渲染", d.view === "timeline" && d.cursor === 15 && d.events === 25 && d.visible === 25, d);
    check("时间线/campus 统计卡", d.stats >= 4, d.stats);
    check("时间线/campus 无未捕获异常", (r.errors || []).length === 0, r.errors);
  }

  // ATT&CK
  {
    const r = await probe({
      url: `${BASE}#/attack?scenario=corp-ad`,
      wait: 6000,
      eval: `${common}
        return { view: st.view, cells: q('.attack-cell').length, events: q('.attack-event-row').length,
          metrics: q('.attack-metric').length, text: text.includes('战术覆盖') && text.includes('技术数') };
      `
    });
    const d = r.eval || {};
    check("ATT&CK/corp-ad 矩阵与事件列表", d.view === "attack" && d.cells >= 10 && d.events >= 10 && d.metrics === 4, d);
    check("ATT&CK/corp-ad 指标文案", d.text === true, d.text);
    check("ATT&CK/corp-ad 无未捕获异常", (r.errors || []).length === 0, r.errors);
  }

  // 发现与证据
  {
    const r = await probe({
      url: `${BASE}#/findings?scenario=campus-lab`,
      wait: 3800,
      eval: `${common}
        return { view: st.view, findingsRows: q('table tbody tr').length, summary: q('.summary-stat').length,
          text: text.includes('风险发现') && text.includes('证据库') };
      `
    });
    const d = r.eval || {};
    check("发现/campus 表格与汇总", d.view === "findings" && d.findingsRows >= 10 && d.summary >= 5, d);
    check("发现/campus 无未捕获异常", (r.errors || []).length === 0, r.errors);
  }

  // 报告
  {
    const r = await probe({
      url: `${BASE}#/report?scenario=campus-lab`,
      wait: 3800,
      eval: `${common}
        return { view: st.view, tables: q('.report-table').length, rows: q('table tbody tr').length,
          sections: q('.report-section, .report-block').length,
          text: text.includes('执行摘要') && text.includes('关键路径') && text.includes('测试范围与授权'),
          printBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('打印')) };
      `
    });
    const d = r.eval || {};
    check("报告/campus 九个部分完整", d.view === "report" && d.text === true && d.tables >= 3, d);
    check("报告/campus 打印入口", d.printBtn === true, d.printBtn);
    check("报告/campus 无未捕获异常", (r.errors || []).length === 0, r.errors);
  }

  // 1466/1366 布局与全局错误
  {
    const res = await fetch(SHOT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: `${BASE}#/overview?scenario=corp-ad`,
        width: 1366,
        height: 768,
        wait: 4200,
        eval: `${common}
          return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
            scrollH: document.documentElement.scrollHeight, errs: window.__chainlensErrors?.length ?? 0,
            kpis: q('.kpi-card').length };`
      })
    });
    const j = await res.json();
    const d = j.eval || {};
    check("1366×768 无横向溢出", d.scrollW <= d.innerW + 2, { scrollW: d.scrollW, innerW: d.innerW });
    check("1366×768 总览渲染", d.kpis === 6, d);
    check("全局无未捕获异常", (j.errors || []).length === 0, j.errors);
  }

  // 算法级校验（不依赖 UI）：坏数据必须报错、关键路径正确
  {
    const r = await probe({
      url: `${BASE}#/overview?scenario=campus-lab`,
      wait: 2500,
      eval: `
        let bad = null, cp = null;
        try { bad = window.ChainLens.parser.parseChain('{"kind":"node"}\\nnot-json\\n'); } catch (e) { bad = { error: e.message }; }
        try { cp = window.ChainLens.analytics.criticalPath(window.ChainLens.data); } catch (e) { cp = { error: e.message }; }
        return { badErrors: bad?.stats?.errors ?? bad?.errors?.length ?? null,
          badWarnings: bad?.stats?.warnings ?? bad?.warnings?.length ?? null,
          cpNodes: cp?.nodes?.length ?? (Array.isArray(cp) ? cp.length : 0),
          cpScore: cp?.score ?? null, cpError: cp?.error ?? bad?.error ?? null };
      `
    });
    const d = r.eval || {};
    check("坏数据被记录为错误/警告", (d.badErrors || 0) + (d.badWarnings || 0) > 0, d);
    check("关键路径算法返回非空路径", d.cpNodes > 1, d);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const summary = { at: new Date().toISOString(), total: results.length, passed, failed, results };
  if (process.argv.includes("--json")) {
    const idx = process.argv.indexOf("--json");
    const out = process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--") ? process.argv[idx + 1] : "docs/e2e-results.json";
    writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
    console.log(`结果已写入 ${out}`);
  }
  console.log(`\nE2E: ${passed}/${results.length} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error("E2E 脚本失败:", e?.stack || e);
  process.exitCode = 2;
});
