/**
 * 总览视图：Hero、6 个 KPI、阶段分布、严重度环图、时间密度、
 * 节点类型排行、ATT&CK 覆盖与链路摘要（关键路径 / Top 风险 / 最近事件）。
 */
import { SEVERITIES } from '../constants.js';
import { icon } from '../icons.js';
import { esc } from '../util.js';
import {
  fmtClock,
  fmtDateTime,
  fmtDuration,
  fmtNumber,
  fmtPct,
  riskColor,
  stageZh,
  typeZh
} from '../format.js';
import { qualityColor } from '../ui.js';

const RING_RADIUS = 46;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function qualityRing(score, label) {
  const color = qualityColor(score);
  const length = (score / 100) * RING_CIRCUMFERENCE;
  return `<div class="qa-ring">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="qa-bg" cx="60" cy="60" r="${RING_RADIUS}"></circle>
      <circle class="qa-fill" cx="60" cy="60" r="${RING_RADIUS}" style="stroke:${color};stroke-dasharray:${length.toFixed(
        1
      )} ${RING_CIRCUMFERENCE.toFixed(1)}"></circle>
    </svg>
    <div class="qa-center"><b style="color:${color}">${score}</b><span>数据质量</span></div>
  </div>`;
}

function severityDonut(severities, total) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = severities
    .filter((s) => s.count > 0)
    .map((s) => {
      const length = (s.count / Math.max(1, total)) * circumference;
      const segment = `<circle cx="60" cy="60" r="${radius}" stroke="${s.color}" stroke-dasharray="${Math.max(
        1,
        length - 2
      ).toFixed(1)} ${(circumference - Math.max(1, length - 2)).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(
        1
      )}" stroke-linecap="round"><title>${esc(s.zh)}：${s.count}</title></circle>`;
      offset += length;
      return segment;
    })
    .join('');
  return `<div class="severity-donut-wrap">
    <div class="donut">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="donut-bg" cx="60" cy="60" r="${radius}"></circle>${segments}</svg>
      <div class="donut-center"><b>${total}</b><span>风险对象</span></div>
    </div>
    <div class="legend">
      ${severities
        .map(
          (s) => `<div class="legend-row"><span class="legend-swatch" style="--c:${s.color}"></span>${esc(
            s.zh
          )}<span class="count"><b>${s.count}</b> 项</span></div>`
        )
        .join('')}
    </div>
  </div>`;
}

function stageBars(stageCounts) {
  const max = Math.max(1, ...stageCounts.map((s) => s.nodes + s.events));
  return `<div class="stage-bars">${stageCounts
    .map((stage) => {
      const total = stage.nodes + stage.events;
      return `<div class="stage-bar-row">
        <span class="stage-bar-label"><span class="dot" style="background:${stage.color}"></span>${esc(stage.zh)}</span>
        <span class="stage-bar-track" title="${esc(stage.zh)}：${stage.nodes} 节点 / ${stage.events} 事件"><span class="stage-bar-fill" style="--c:${
        stage.color
      };width:${((total / max) * 100).toFixed(1)}%"></span></span>
        <span class="stage-bar-counts">${stage.nodes} 节 / ${stage.events} 事</span>
      </div>`;
    })
    .join('')}</div>`;
}

function densityChart(buckets) {
  if (!buckets.length) return `<div class="empty-state">${icon('clock')}<strong>暂无事件</strong></div>`;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const cols = buckets
    .map(
      (bucket) =>
        `<div class="density-col" title="${fmtClock(bucket.start)} – ${fmtClock(bucket.end)}：${bucket.count} 个事件"><span class="density-bar" style="height:${Math.max(
          2,
          (bucket.count / max) * 100
        ).toFixed(1)}%"></span></div>`
    )
    .join('');
  return `<div class="density">${cols}</div>
    <div class="density-axis"><span>${esc(fmtClock(buckets[0].start))}</span><span>${esc(
      fmtClock(buckets[buckets.length - 1].end)
    )}</span></div>`;
}

function typeRanking(typeCounts) {
  const top = typeCounts.filter((t) => t.count > 0).slice(0, 6);
  const max = Math.max(1, ...top.map((t) => t.count));
  return `<div class="type-rank">${top
    .map(
      (type) => `<div class="type-row"><span style="color:${type.color}">${icon(type.icon)}</span>
        <span class="type-name">${esc(type.zh)}</span>
        <span class="type-track"><span class="type-fill" style="--c:${type.color};width:${(
        (type.count / max) *
        100
      ).toFixed(1)}%"></span></span>
        <span class="type-count">${type.count}</span></div>`
    )
    .join('')}</div>`;
}

function attackCoverage(attack) {
  if (!attack.recordCount) {
    return `<div class="empty-state">${icon('shield')}<strong>暂无 ATT&amp;CK 映射</strong><span>数据中的节点 / 事件 / 关系未携带 attck 字段</span></div>`;
  }
  const ratio = attack.tacticCount / attack.totalTactics;
  return `<div class="coverage-meter"><div class="coverage-meter-track"><div class="coverage-meter-fill" style="width:${(
    ratio * 100
  ).toFixed(1)}%"></div></div><span>${attack.tacticCount}/${attack.totalTactics} 战术 · ${attack.techniqueCount} 技术</span></div>
    <div class="attack-chips">${attack.usedTactics
      .map(
        (tactic) =>
          `<span class="attack-chip" title="${esc(tactic.en)}">${esc(tactic.zh)}<b>${tactic.techniques.length}</b></span>`
      )
      .join('')}</div>`;
}

function criticalPathSection(derived) {
  const cp = derived.criticalPath;
  if (!cp.nodes.length) return `<div class="empty-state">${icon('critical')}<strong>无关键路径</strong></div>`;
  const chips = cp.nodes
    .map(
      (node, index) =>
        `${index > 0 ? '<span class="cp-arrow">→</span>' : ''}<button class="cp-node" type="button" data-goto="graph" data-focus="${esc(
          node.id
        )}" title="在链路图中聚焦 ${esc(node.label)}"><span class="dot"></span>${esc(node.label)}</button>`
    )
    .join('');
  return `<div class="cp-path">${chips}</div>
    <div class="cp-meta">
      <span>路径风险分 <b>${cp.score.toFixed(1)}</b></span>
      <span>经过 <b>${cp.nodes.length}</b> 个节点 / <b>${cp.edges.length}</b> 条关系</span>
      <span>覆盖 <b>${cp.stages.length}</b> 个阶段</span>
      ${cp.fallback ? '<span class="badge badge-amber">无前向边，已回退为最高风险节点</span>' : ''}
    </div>`;
}

function riskList(nodes, derived) {
  if (!nodes.length) return `<div class="empty-state">${icon('shield')}<strong>暂无节点</strong></div>`;
  return `<div class="risk-list">${nodes
    .map(
      (node) =>
        `<button class="risk-row" type="button" data-open-node="${esc(node.id)}"><span class="risk-dot" style="--c:${riskColor(
          node.risk
        )}"></span><span class="risk-row-label">${esc(node.label)}<small>${esc(typeZh(node.type))}</small></span><span class="risk-row-score">${Number(
          node.risk
        ).toFixed(1)}</span></button>`
    )
    .join('')}</div>`;
}

function recentEventList(events) {
  if (!events.length) return `<div class="empty-state">${icon('clock')}<strong>暂无事件</strong></div>`;
  return `<div class="recent-events">${events
    .map(
      (event) =>
        `<button class="recent-event" type="button" data-open-event="${esc(event.id)}"><time>${esc(
          event.ts.slice(11, 16)
        )}</time><span class="result-dot" style="--c:${
          event.result === 'success' ? '#10b981' : event.result === 'failure' ? '#ef4444' : event.result === 'partial' ? '#f59e0b' : '#64748b'
        }"></span><span class="recent-event-text"><em>${esc(stageZh(event.stage))}</em>${esc(event.summary)}</span></button>`
    )
    .join('')}</div>`;
}

/** 渲染总览视图 */
export function renderOverview(root, ctx) {
  const chain = ctx.chain;
  const derived = ctx.derived;
  const meta = chain.meta?.engagement || {};
  const kpis = derived.kpis;
  const criticalCount = kpis.severities.find((s) => s.id === 'critical')?.count || 0;
  const highCount = kpis.severities.find((s) => s.id === 'high')?.count || 0;
  const mode = meta.mode === 'authorized' ? '授权测试' : '仿真模式';
  const modeClass = meta.mode === 'authorized' ? 'badge-green' : 'badge-amber';
  const quality = derived.quality;
  const riskTotal = kpis.riskNodes;
  const totalEvents = chain.events;
  const firstEvent = totalEvents[0];
  const lastEvent = totalEvents[totalEvents.length - 1];
  const durationText = firstEvent && lastEvent ? fmtDuration(lastEvent.tsMs - firstEvent.tsMs) : '—';
  const scope = Array.isArray(meta.scope) ? meta.scope.join('、') : '—';
  const team = Array.isArray(meta.team) && meta.team.length ? meta.team.join('、') : '—';
  const evidenceSensitive = chain.evidences.filter((e) => e.sensitive).length;
  const coverage = derived.evidenceCoverage;

  root.innerHTML = `<div class="view view--overview">
    <section class="hero" aria-label="场景信息">
      <div class="hero-main">
        <div class="hero-eyebrow">${icon('target')}ENGAGEMENT · ${esc(meta.id || chain.name || '未命名场景')} · ${
    esc(chain.source || 'simulation')
  }</div>
        <h1 class="hero-title">${esc(meta.name || chain.name || '未命名场景')}</h1>
        <div class="hero-badges">
          <span class="badge ${modeClass}">${esc(mode)}</span>
          <span class="badge badge-cyan">${esc(chain.stats.acceptedRecords)} 条记录</span>
          <span class="badge">${esc(derived.kpis.stages)} / 7 阶段</span>
          <span class="badge badge-purple">数据质量 ${quality.score} · ${esc(quality.label)}</span>
          ${meta.ended_at === null ? '<span class="badge">进行中</span>' : '<span class="badge">已结束</span>'}
        </div>
        <div class="hero-meta">
          <div class="hero-meta-item">
            <div class="hero-meta-key">授权依据</div>
            <div class="hero-meta-value"><strong>${esc(meta.authorization?.basis || '数据未提供')}</strong><br><span class="faint">有效期至 ${esc(
    meta.authorization?.expires_at ? fmtDateTime(meta.authorization.expires_at) : '—'
  )}</span></div>
          </div>
          <div class="hero-meta-item">
            <div class="hero-meta-key">目标范围</div>
            <div class="hero-meta-value">${esc(scope)}</div>
          </div>
          <div class="hero-meta-item">
            <div class="hero-meta-key">操作者 / 团队</div>
            <div class="hero-meta-value"><strong>${esc(meta.operator || '—')}</strong> · ${esc(team)}</div>
          </div>
          <div class="hero-meta-item">
            <div class="hero-meta-key">测试窗口</div>
            <div class="hero-meta-value">${esc(fmtDateTime(meta.started_at))}<br><span class="faint">事件跨度 ${esc(
    durationText
  )}</span></div>
          </div>
        </div>
      </div>
      <div class="hero-side">
        ${qualityRing(quality.score, quality.label)}
        <div class="qa-caption">${quality.errors} 个错误 · ${quality.warnings} 个警告<br>${esc(
    derived.quality.level === 'excellent' ? '数据完整，可直接分析' : '建议在导入前检查数据质量'
  )}</div>
      </div>
    </section>

    <section class="kpi-grid" aria-label="关键指标">
      <button class="kpi-card" type="button" data-goto="graph" style="--kpi-color:#38bdf8">
        <div class="kpi-top"><span class="kpi-label">节点总数</span>${icon('server')}</div>
        <div class="kpi-value">${fmtNumber(kpis.nodes)}<small>个</small></div>
        <div class="kpi-sub">${derived.nodeTypeCounts
          .filter((t) => t.count > 0)
          .slice(0, 3)
          .map((t) => `${t.zh} ${t.count}`)
          .join(' · ')}</div>
      </button>
      <button class="kpi-card" type="button" data-goto="graph" style="--kpi-color:#22d3ee">
        <div class="kpi-top"><span class="kpi-label">关系数</span>${icon('link')}</div>
        <div class="kpi-value">${fmtNumber(kpis.edges)}<small>条</small></div>
        <div class="kpi-sub">关键路径关系 ${derived.criticalPath.edges.length} 条</div>
      </button>
      <button class="kpi-card" type="button" data-goto="timeline" style="--kpi-color:#8b5cf6">
        <div class="kpi-top"><span class="kpi-label">事件数</span>${icon('clock')}</div>
        <div class="kpi-value">${fmtNumber(kpis.events)}<small>个</small></div>
        <div class="kpi-sub">成功率 ${fmtPct(derived.successRate.ratio)} · 最长静默 ${fmtDuration(derived.longestSilence.gapMs)}</div>
      </button>
      <button class="kpi-card" type="button" data-goto="findings" style="--kpi-color:#f87171">
        <div class="kpi-top"><span class="kpi-label">漏洞 / 发现</span>${icon('shield')}</div>
        <div class="kpi-value">${fmtNumber(riskTotal)}<small>项</small></div>
        <div class="kpi-sub"><span class="sev-dots">${SEVERITIES.filter((s) => kpis.severities.find((x) => x.id === s.id)?.count)
          .map((s) => `<i style="background:${s.color}" title="${s.zh} ${kpis.severities.find((x) => x.id === s.id)?.count}"></i>`)
          .join('')}</span>严重 ${criticalCount} · 高危 ${highCount}</div>
      </button>
      <button class="kpi-card" type="button" data-goto="findings" data-tab="evidence" style="--kpi-color:#fbbf24">
        <div class="kpi-top"><span class="kpi-label">证据数</span>${icon('data')}</div>
        <div class="kpi-value">${fmtNumber(kpis.evidences)}<small>条</small></div>
        <div class="kpi-sub">敏感证据 ${evidenceSensitive} 条 · 覆盖 ${coverage.covered}/${coverage.total} 风险项</div>
      </button>
      <button class="kpi-card" type="button" data-goto="graph" data-critical="1" style="--kpi-color:#ef4444">
        <div class="kpi-top"><span class="kpi-label">关键路径风险</span>${icon('critical')}</div>
        <div class="kpi-value">${kpis.critical.score.toFixed(1)}<small>分</small></div>
        <div class="kpi-sub">覆盖 ${kpis.critical.stages.length} 阶段 · ${kpis.critical.nodes.length} 节点</div>
      </button>
    </section>

    <div class="overview-grid">
      <section class="panel ov-card" aria-label="阶段分布">
        <div class="panel-head"><h3>${icon('layers')}阶段分布</h3><span class="micro">节点 / 事件</span></div>
        ${stageBars(derived.stageCounts)}
      </section>

      <section class="panel ov-card" aria-label="严重度分布">
        <div class="panel-head"><h3>${icon('target')}严重度分布</h3><span class="micro">风险分 ${derived.riskScore.toFixed(1)}</span></div>
        ${severityDonut(derived.severityCounts, riskTotal)}
      </section>

      <section class="panel ov-card" aria-label="ATT&amp;CK 覆盖">
        <div class="panel-head"><h3>${icon('shield')}ATT&amp;CK 覆盖</h3><span class="micro">${esc(
    derived.attack.techniqueCount
  )} 项技术</span></div>
        ${attackCoverage(derived.attack)}
      </section>

      <section class="panel ov-card ov-card--wide" aria-label="事件时间密度">
        <div class="panel-head"><h3>${icon('clock')}事件时间密度</h3><span class="micro">按 10 分钟分桶 · ${esc(
    durationText
  )}</span></div>
        ${densityChart(derived.timeBuckets)}
      </section>

      <section class="panel ov-card ov-card--wide" aria-label="节点类型排行">
        <div class="panel-head"><h3>${icon('grid')}节点类型 Top</h3><span class="micro">${esc(
    derived.nodeTypeCounts.filter((t) => t.count > 0).length
  )} 类</span></div>
        ${typeRanking(derived.nodeTypeCounts)}
      </section>

      <section class="panel ov-card ov-card--full" aria-label="链路摘要">
        <div class="panel-head">
          <h3>${icon('critical')}链路摘要</h3>
          <button class="btn btn-sm" type="button" data-goto="graph" data-critical="1">${icon('layers')}查看关键路径</button>
        </div>
        ${criticalPathSection(derived)}
        <div class="summary-columns" style="margin-top:16px">
          <div>
            <div class="panel-head"><h3>${icon('alert')}Top 风险节点</h3><span class="micro">按 risk 排序</span></div>
            ${riskList(derived.topRiskNodes, derived)}
          </div>
          <div>
            <div class="panel-head"><h3>${icon('clock')}最近事件</h3><span class="micro">${fmtNumber(
    chain.events.length
  )} 个事件</span></div>
            ${recentEventList(derived.recentEvents)}
          </div>
        </div>
      </section>
    </div>
  </div>`;
}
