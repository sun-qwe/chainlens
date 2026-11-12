/**
 * 关于 / 自检视图：项目说明、数据规范摘要、算法与快捷键、运行自检。
 * #/about 与 ?selftest=1 都会在控制台输出统计数据与耗时（规格 5.6 第 8 条）。
 */
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { getDerived, summarise } from '../analytics.js';
import { layoutLayered } from '../layout.js';
import { fmtDuration, fmtMs } from '../format.js';

function metricPill(label, value) {
  return `<div class="import-stat"><b>${esc(String(value))}</b><span>${esc(label)}</span></div>`;
}

function runSelfTest(ctx) {
  const chain = ctx.chain;
  const startedAt = performance.now();
  const summary = summarise(chain);
  const layoutStart = performance.now();
  const layout = layoutLayered(chain.nodes, chain.edges);
  const layoutMs = performance.now() - layoutStart;
  const positionsCount = Object.keys(layout.positions).length;
  const elapsed = performance.now() - startedAt;
  const checks = [
    { name: '解析与归一化', ok: chain.nodes.length > 0, detail: `${chain.stats.acceptedRecords} 条记录 / ${chain.stats.skippedLines} 坏行` },
    { name: '布局完整性', ok: positionsCount === chain.nodes.length, detail: `${positionsCount}/${chain.nodes.length} 个节点获得坐标` },
    { name: '关键路径', ok: summary.criticalPathNodes > 0, detail: `风险分 ${summary.criticalPathScore.toFixed(1)} / ${summary.criticalPathNodes} 节点` },
    { name: 'ATT&CK 覆盖', ok: summary.attackTactics > 0, detail: `${summary.attackTactics}/12 战术 · ${summary.attackTechniques} 技术` },
    { name: '数据质量', ok: summary.quality.score >= 0, detail: `${summary.quality.score}/100（${summary.quality.errors} 错误 / ${summary.quality.warnings} 警告）` },
    { name: '全局接口', ok: Boolean(window.ChainLens?.bench && window.__chainlensReady), detail: 'window.ChainLens / __chainlensReady 可用' }
  ];
  const result = {
    at: new Date().toISOString(),
    scenario: ctx.scenario?.id,
    summary,
    layoutMs: Math.round(layoutMs * 100) / 100,
    totalMs: Math.round(elapsed * 100) / 100,
    checks
  };
  // 规格 5.6：控制台自检输出
  console.info('[ChainLens selftest]', JSON.stringify(result, null, 2));
  window.__chainlensSelftest = result;
  return result;
}

function selfTestMarkup(result) {
  if (!result) return '<p class="faint">尚未运行自检。</p>';
  return `<div class="import-stats" style="margin-bottom:10px">
      ${metricPill('节点', result.summary.nodes)}
      ${metricPill('关系', result.summary.edges)}
      ${metricPill('事件', result.summary.events)}
      ${metricPill('阶段', `${result.summary.stages}/7`)}
      ${metricPill('关键路径分', result.summary.criticalPathScore.toFixed(1))}
      ${metricPill('质量分', result.summary.quality.score)}
    </div>
    <table class="data-table" style="min-width:0">
      <thead><tr><th>检查项</th><th>结果</th><th>说明</th></tr></thead>
      <tbody>${result.checks
        .map(
          (check) =>
            `<tr style="cursor:default"><td>${esc(check.name)}</td><td>${
              check.ok ? '<span class="badge badge-green">通过</span>' : '<span class="badge badge-red">异常</span>'
            }</td><td class="faint">${esc(check.detail)}</td></tr>`
        )
        .join('')}</tbody>
    </table>
    <p class="faint" style="margin-top:8px;font-size:10.5px">布局耗时 ${fmtMs(result.layoutMs)} · 自检总耗时 ${fmtMs(
    result.totalMs
  )} · 结果已输出到控制台</p>`;
}

export function createAboutView(ctx) {
  let root = null;
  let lastResult = null;

  function render() {
    if (!root) return;
    const summary = summarise(ctx.chain);
    const scenario = ctx.scenario || {};
    root.innerHTML = `<div class="view view--about"><div class="about-view">
      <section class="panel about-hero">
        <div class="hero-eyebrow">${icon('lens')}CHAINLENS · 本科毕业设计</div>
        <h1 class="about-title">探索链路可视化工具</h1>
        <p class="about-lead">ChainLens 读取 dsh-pentest 记录的 JSONL 探索链路，提供总览、阶段约束链路图、时间线回放、ATT&amp;CK 覆盖矩阵、风险发现与证据、可打印分析报告。全部算法自研，零第三方依赖、零构建、零外部网络请求，适合隔离环境与论文复现。</p>
        <div class="hero-badges" style="margin-top:12px">
          <span class="badge badge-cyan">当前场景：${esc(scenario.name || summary.scenario || '—')}</span>
          <span class="badge">${esc(summary.nodes)} 节点</span>
          <span class="badge">${esc(summary.edges)} 关系</span>
          <span class="badge">${esc(summary.events)} 事件</span>
          <span class="badge badge-purple">质量 ${summary.quality.score}</span>
        </div>
      </section>

      <div class="about-grid">
        <section class="panel about-card">
          <h3>${icon('database')}数据规范摘要</h3>
          <ul>
            <li>JSON Lines，首行必须是 <code>kind:"meta"</code>，<code>seq</code> 严格递增、时间戳非递减。</li>
            <li>记录类型：<code>meta / node / edge / event / evidence / note</code>。</li>
            <li>节点 10 类：目标组织、主机、服务、Web 应用、接口、漏洞、凭据、会话、数据、风险发现。</li>
            <li>关系 11 类：解析、暴露、运行、路由、漏洞、利用、授权、横向、访问、佐证、归属。</li>
            <li>敏感值（口令 / Token / Cookie / 私钥）在插件端脱敏为 <code>[REDACTED]</code>，前端对 <code>sensitive:true</code> 证据进一步打码。</li>
          </ul>
        </section>

        <section class="panel about-card">
          <h3>${icon('layers')}自研布局与算法</h3>
          <ul>
            <li><strong>阶段约束分层</strong>：7 个阶段列固定，节点按 stage 入列。</li>
            <li><strong>重心法排序</strong>：前进 / 后退交替 ≥4 轮，以邻居平均纵坐标排序。</li>
            <li><strong>轻量力松弛</strong>：同列一维弹簧 + 最小间距约束，消除重叠。</li>
            <li><strong>力导向视图</strong>：Fruchterman-Reingold 300 次迭代，固定种子确定性。</li>
            <li><strong>关键路径</strong>：仅取阶段前向边，节点权重 <code>1 + risk</code>，DAG 上 DP 求最长路径。</li>
            <li><strong>指标</strong>：阶段耗时、成功率、最长静默、ATT&amp;CK 去重、证据覆盖、风险加权分、数据质量分。</li>
          </ul>
        </section>

        <section class="panel about-card">
          <h3>${icon('key')}键盘快捷键</h3>
          <div class="shortcut-table">
            <kbd>1</kbd><span>总览</span><kbd>2</kbd><span>链路图</span>
            <kbd>3</kbd><span>时间线</span><kbd>4</kbd><span>ATT&amp;CK 矩阵</span>
            <kbd>5</kbd><span>发现与证据</span><kbd>6</kbd><span>分析报告</span>
            <kbd>/</kbd><span>聚焦搜索框</span><kbd>Esc</kbd><span>关闭抽屉 / 弹窗 / 菜单</span>
            <kbd>Space</kbd><span>播放 / 暂停回放</span><kbd>← →</kbd><span>上 / 下一事件</span>
            <kbd>F</kbd><span>链路图适配屏幕</span><kbd>C</kbd><span>关键路径高亮</span>
          </div>
        </section>

        <section class="panel about-card">
          <h3>${icon('check')}运行自检</h3>
          <p class="faint" style="font-size:11.5px">自检会重新计算核心指标与布局，并把结果输出到浏览器控制台（<code>?selftest=1</code> 可在加载时自动执行）。</p>
          <div class="drawer-actions" style="margin:10px 0">
            <button class="btn btn-sm" type="button" data-about-action="selftest">${icon('play')}运行自检</button>
            <button class="btn btn-sm" type="button" data-about-action="import">${icon('import')}导入数据</button>
            <button class="btn btn-sm" type="button" data-about-action="report">${icon('report')}查看报告</button>
            <button class="btn btn-sm" type="button" data-about-action="bench">${icon('clock')}bench 性能</button>
          </div>
          <div data-role="selftest">${selfTestMarkup(lastResult)}</div>
        </section>
      </div>

      <p class="about-footer">ChainLens v1.0.0 · 零依赖静态前端 · 纯 SVG 自绘 · 深色安全控制台设计<br>
      安全声明：本工具只展示仿真 / 授权数据，不发起任何网络请求，不包含攻击能力。数据中的目标均为 RFC1918 私网或 .test 保留域。</p>
    </div></div>`;
    root.addEventListener('click', onAction);
    if (!lastResult) {
      lastResult = runSelfTest(ctx);
      const box = root.querySelector('[data-role="selftest"]');
      if (box) box.innerHTML = selfTestMarkup(lastResult);
    }
  }

  async function onAction(event) {
    const button = event.target.closest('[data-about-action]');
    if (!button) return;
    const action = button.dataset.aboutAction;
    if (action === 'selftest') {
      lastResult = runSelfTest(ctx);
      root.querySelector('[data-role="selftest"]').innerHTML = selfTestMarkup(lastResult);
      ctx.actions.toast('自检完成，结果已输出到控制台', 'success');
    } else if (action === 'import') {
      ctx.actions.openImport();
    } else if (action === 'report') {
      ctx.actions.goto('report');
    } else if (action === 'bench') {
      const result = await ctx.actions.runBench();
      lastResult = {
        ...(lastResult || runSelfTest(ctx)),
        bench: result,
        checks: [
          ...(lastResult?.checks || []),
          { name: 'bench 性能接口', ok: Boolean(result), detail: result ? `解析 ${result.parseMs}ms · 布局 ${result.layoutMs}ms · 渲染 ${result.renderMs}ms` : '调用失败' }
        ]
      };
      root.querySelector('[data-role="selftest"]').innerHTML = selfTestMarkup(lastResult);
    }
  }

  function mount(container) {
    root = container;
    render();
  }

  function update() {
    if (!root) return;
    if (!lastResult) render();
  }

  function destroy() {
    root = null;
  }

  return { mount, update, destroy };
}

export { runSelfTest };
