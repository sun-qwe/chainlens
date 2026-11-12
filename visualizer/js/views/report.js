/**
 * 分析报告视图：基于真实数据生成文档式报告，支持打印 / 复制 Markdown / 导出 JSON。
 * 报告内容全部来自当前归一化链路与派生指标，无占位符。
 */
import { SEVERITIES } from '../constants.js';
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { copyText, downloadText } from '../io.js';
import {
  evidenceTypeZh,
  fmtDateTime,
  fmtDuration,
  fmtNumber,
  fmtPct,
  findingStatusZh,
  severityZh,
  stageZh
} from '../format.js';

/** 构造报告数据模型（同时用于 JSON 导出） */
export function buildReportModel(ctx) {
  const chain = ctx.chain;
  const derived = ctx.derived;
  const meta = chain.meta?.engagement || {};
  const mode = meta.mode === 'authorized' ? '授权测试' : '仿真模式';
  const scope = Array.isArray(meta.scope) ? meta.scope : [];
  const team = Array.isArray(meta.team) ? meta.team : [];
  const kpis = derived.kpis;
  const cp = derived.criticalPath;
  const quality = derived.quality;
  const success = derived.successRate;
  const severityCounts = new Map(derived.severityCounts.map((s) => [s.id, s.count]));
  const severityText = SEVERITIES.filter((s) => (severityCounts.get(s.id) || 0) > 0)
    .map((s) => `${s.zh} ${severityCounts.get(s.id)}`)
    .join('、');

  const summary = `本次「${meta.name || chain.name || '未命名场景'}」共解析 ${fmtNumber(
    chain.stats.acceptedRecords
  )} 条有效记录，覆盖 ${kpis.stages}/7 个阶段，形成 ${fmtNumber(kpis.nodes)} 个节点、${fmtNumber(
    kpis.edges
  )} 条关系与 ${fmtNumber(kpis.events)} 个事件，事件跨度 ${fmtDuration(derived.durationMs)}；事件成功率 ${fmtPct(
    success.ratio
  )}。关键路径风险分 ${cp.score.toFixed(1)}，经过 ${cp.nodes.length} 个节点、${cp.stages.length} 个阶段${
    cp.fallback ? '（数据中没有前向边，按最高风险节点回退计算）' : ''
  }。共识别风险发现 ${kpis.riskNodes} 项${severityText ? `（${severityText}）` : ''}，证据 ${fmtNumber(
    kpis.evidences
  )} 条，其中敏感证据 ${chain.evidences.filter((e) => e.sensitive).length} 条已脱敏；有证据覆盖的风险项 ${
    derived.evidenceCoverage.covered
  }/${derived.evidenceCoverage.total}。数据质量评分 ${quality.score}/100（${quality.label}），${
    quality.errors
  } 个错误、${quality.warnings} 个警告。`;

  const metrics = [
    { label: '节点总数', value: fmtNumber(kpis.nodes) },
    { label: '关系总数', value: fmtNumber(kpis.edges) },
    { label: '事件总数', value: fmtNumber(kpis.events) },
    { label: '证据数', value: fmtNumber(kpis.evidences) },
    { label: '风险发现', value: fmtNumber(kpis.riskNodes) },
    { label: '事件跨度', value: fmtDuration(derived.durationMs) },
    { label: '事件成功率', value: fmtPct(success.ratio, 1) },
    { label: '关键路径风险分', value: cp.score.toFixed(1) },
    { label: 'ATT&CK 战术', value: `${derived.attack.tacticCount}/${derived.attack.totalTactics}` },
    { label: 'ATT&CK 技术', value: fmtNumber(derived.attack.techniqueCount) },
    { label: '风险加权分', value: derived.riskScore.toFixed(1) },
    { label: '数据质量分', value: String(quality.score) }
  ];

  return {
    generatedAt: new Date().toISOString(),
    generatedAtText: fmtDateTime(new Date().toISOString()),
    scenario: {
      id: ctx.scenario?.id || chain.meta?.scenario || '',
      name: meta.name || chain.name || '未命名场景',
      engagementId: meta.id || '',
      mode,
      operator: meta.operator || '',
      team,
      scope,
      authorization: meta.authorization || {},
      startedAt: meta.started_at || '',
      endedAt: meta.ended_at || '',
      description: meta.description || '',
      source: ctx.scenario?.source || chain.source || '',
      tool: chain.meta?.tool || {}
    },
    stats: { ...chain.stats },
    summary,
    metrics,
    stages: derived.stageStats.map((stage) => ({
      stage: stage.stage,
      zh: stage.zh,
      nodes: stage.nodes,
      events: stage.events,
      firstTs: stage.firstTs,
      durationMs: stage.durationMs,
      advanceMs: stage.advanceMs,
      reached: stage.reached
    })),
    criticalPath: {
      score: cp.score,
      fallback: cp.fallback,
      stages: cp.stages,
      nodes: cp.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        stage: node.stage,
        stageZh: stageZh(node.stage),
        risk: node.risk,
        type: node.type
      }))
    },
    findings: derived.findings.map((finding) => ({
      id: finding.id,
      type: finding.type,
      title: finding.title,
      severity: finding.severity,
      severityZh: severityZh(finding.severity),
      cvss: finding.cvss,
      status: finding.status,
      statusZh: findingStatusZh(finding.status),
      stage: finding.stage,
      stageZh: stageZh(finding.stage),
      asset: finding.assetLabel,
      evidenceCount: finding.evidenceCount,
      recommendation: finding.recommendation,
      impact: finding.impact,
      cve: finding.cve
    })),
    attack: derived.attack.usedTactics.map((tactic) => ({
      tactic: tactic.id,
      zh: tactic.zh,
      en: tactic.en,
      eventCount: tactic.eventCount,
      recordCount: tactic.recordCount,
      techniques: tactic.techniques.map((tech) => ({
        id: tech.id,
        name: tech.name,
        eventCount: tech.eventCount,
        count: tech.count
      }))
    })),
    evidence: derived.evidenceList.map((item) => ({
      id: item.id,
      type: item.type,
      typeZh: evidenceTypeZh(item.type),
      title: item.title,
      nodeId: item.nodeId,
      nodeLabel: item.nodeLabel,
      sensitive: item.sensitive,
      summary: item.sensitive ? '' : item.summary,
      hash: item.hash,
      path: item.path,
      ts: item.ts
    })),
    quality: { ...quality },
    issues: {
      errors: chain.errors.map((issue) => ({ code: issue.code, message: issue.message })),
      warnings: chain.warnings.map((issue) => ({ code: issue.code, message: issue.message }))
    },
    evidenceCoverage: derived.evidenceCoverage,
    successRate: success,
    attackCoverage: {
      tacticCount: derived.attack.tacticCount,
      totalTactics: derived.attack.totalTactics,
      techniqueCount: derived.attack.techniqueCount,
      recordCount: derived.attack.recordCount
    }
  };
}

/** 构建 Markdown（复制用） */
export function buildReportMarkdown(model) {
  const lines = [];
  const pushTable = (headers, rows) => {
    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
    for (const row of rows) lines.push(`| ${row.map((cell) => String(cell ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`);
    lines.push('');
  };
  lines.push(`# 探索链路分析报告：${model.scenario.name}`);
  lines.push('');
  lines.push(`- 报告生成时间：${model.generatedAtText}`);
  lines.push(`- 场景：${model.scenario.name}（${model.scenario.engagementId}）`);
  lines.push(`- 模式：${model.scenario.mode}；操作者：${model.scenario.operator}；团队：${model.scenario.team.join('、') || '—'}`);
  lines.push(`- 授权依据：${model.scenario.authorization.basis || '—'}`);
  lines.push(`- 目标范围：${model.scenario.scope.join('、') || '—'}`);
  lines.push(`- 数据来源：${model.scenario.source || '—'}；工具：${model.scenario.tool.name || 'dsh-pentest'} ${model.scenario.tool.version || ''}`);
  lines.push('');
  lines.push('## 执行摘要');
  lines.push('');
  lines.push(model.summary);
  lines.push('');
  lines.push('## 链路指标');
  lines.push('');
  pushTable(['指标', '数值'], model.metrics.map((m) => [m.label, m.value]));
  lines.push('## 阶段推进');
  lines.push('');
  pushTable(
    ['阶段', '节点', '事件', '首个事件', '事件跨度'],
    model.stages.map((s) => [s.zh, s.nodes, s.events, s.firstTs ? fmtDateTime(s.firstTs) : '—', s.durationMs ? fmtDuration(s.durationMs) : '—'])
  );
  lines.push('## 关键路径');
  lines.push('');
  lines.push(`风险分：${model.criticalPath.score.toFixed(1)}；经过节点：${model.criticalPath.nodes.length}；覆盖阶段：${model.criticalPath.stages.map(stageZh).join(' → ')}${model.criticalPath.fallback ? '（无前向边，回退为最高风险节点）' : ''}`);
  lines.push('');
  lines.push(model.criticalPath.nodes.map((n, i) => `${i + 1}. ${n.label}（${n.stageZh} / 风险 ${Number(n.risk).toFixed(1)}）`).join('\n'));
  lines.push('');
  lines.push('## 风险发现');
  lines.push('');
  pushTable(
    ['严重度', '标题', '资产', 'CVSS', '状态', '证据', '建议'],
    model.findings.map((f) => [f.severityZh, f.title, f.asset, f.cvss ?? '—', f.statusZh, f.evidenceCount, f.recommendation || '—'])
  );
  lines.push('## ATT&CK 覆盖');
  lines.push('');
  pushTable(
    ['战术', '技术', '事件数'],
    model.attack.map((t) => [`${t.zh}（${t.tactic}）`, t.techniques.map((x) => `${x.id} ${x.name}`).join('；'), t.eventCount])
  );
  lines.push('## 证据清单');
  lines.push('');
  pushTable(
    ['类型', '标题', '关联节点', '时间', '敏感'],
    model.evidence.map((e) => [e.typeZh, e.title, e.nodeLabel || '—', fmtDateTime(e.ts), e.sensitive ? '已脱敏' : '公开'])
  );
  lines.push('## 数据质量');
  lines.push('');
  lines.push(`数据质量评分：${model.quality.score}/100（${model.quality.label}）；错误 ${model.quality.errors} 个，警告 ${model.quality.warnings} 个。`);
  if (model.issues.errors.length) {
    lines.push('');
    lines.push('错误：');
    for (const issue of model.issues.errors) lines.push(`- [${issue.code}] ${issue.message}`);
  }
  if (model.issues.warnings.length) {
    lines.push('');
    lines.push('警告：');
    for (const issue of model.issues.warnings) lines.push(`- [${issue.code}] ${issue.message}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('本报告由 ChainLens 根据 dsh-pentest 记录的探索链路数据自动生成，仅用于授权测试与教学研究。');
  return lines.join('\n');
}

function stageTable(model) {
  return `<table class="report-table"><thead><tr><th>阶段</th><th>节点</th><th>事件</th><th>首个事件</th><th>事件跨度</th></tr></thead><tbody>${model.stages
    .map(
      (stage) => `<tr class="${stage.reached ? '' : 'is-muted'}"><td>${esc(stage.zh)}</td><td>${stage.nodes}</td><td>${
        stage.events
      }</td><td>${esc(stage.firstTs ? fmtDateTime(stage.firstTs) : '—')}</td><td>${esc(
        stage.durationMs ? fmtDuration(stage.durationMs) : '—'
      )}</td></tr>`
    )
    .join('')}</tbody></table>`;
}

function findingsTable(model) {
  if (!model.findings.length) return '<p class="report-muted">本次数据未记录风险发现。</p>';
  return `<table class="report-table"><thead><tr><th>严重度</th><th>发现</th><th>资产</th><th>CVSS</th><th>状态</th><th>建议</th></tr></thead><tbody>${model.findings
    .map(
      (finding) => `<tr><td><span class="report-sev" data-sev="${esc(finding.severity)}">${esc(
        finding.severityZh
      )}</span></td><td><strong>${esc(finding.title)}</strong><br><small>${esc(finding.id)} · ${esc(
        finding.stageZh
      )}</small></td><td>${esc(finding.asset)}</td><td>${finding.cvss === null ? '—' : finding.cvss.toFixed(
        1
      )}</td><td>${esc(finding.statusZh)}</td><td>${esc(finding.recommendation || '—')}</td></tr>`
    )
    .join('')}</tbody></table>`;
}

function attackTable(model) {
  if (!model.attack.length) return '<p class="report-muted">本次数据未包含 ATT&amp;CK 映射。</p>';
  return `<table class="report-table"><thead><tr><th>战术</th><th>技术</th><th>事件数</th></tr></thead><tbody>${model.attack
    .map(
      (tactic) => `<tr><td>${esc(tactic.zh)}<br><small>${esc(tactic.tactic)}</small></td><td>${tactic.techniques
        .map((tech) => `${esc(tech.id)} ${esc(tech.name)}`)
        .join('<br>')}</td><td>${tactic.eventCount}</td></tr>`
    )
    .join('')}</tbody></table>`;
}

function evidenceTable(model) {
  if (!model.evidence.length) return '<p class="report-muted">本次数据未记录证据。</p>';
  return `<table class="report-table"><thead><tr><th>类型</th><th>标题</th><th>关联节点</th><th>时间</th><th>敏感</th></tr></thead><tbody>${model.evidence
    .map(
      (evidence) => `<tr><td>${esc(evidence.typeZh)}</td><td>${esc(evidence.title)}${
        evidence.sensitive ? '<br><small class="report-masked">内容已脱敏，仅保留标题</small>' : ''
      }</td><td>${esc(evidence.nodeLabel || '—')}</td><td>${esc(fmtDateTime(evidence.ts))}</td><td>${
        evidence.sensitive ? '已脱敏' : '公开'
      }</td></tr>`
    )
    .join('')}</tbody></table>`;
}

function qualitySection(model) {
  const errors = model.issues.errors;
  const warnings = model.issues.warnings;
  const list = (items) =>
    items.length
      ? `<ul class="report-issues">${items
          .slice(0, 12)
          .map((issue) => `<li><code>${esc(issue.code)}</code>${esc(issue.message)}</li>`)
          .join('')}${items.length > 12 ? `<li>… 其余 ${items.length - 12} 条已省略</li>` : ''}</ul>`
      : '<p class="report-muted">未发现错误或警告。</p>';
  return `<p>数据质量评分 <strong>${model.quality.score}/100（${esc(
    model.quality.label
  )}</strong>，解析记录 ${fmtNumber(model.stats.acceptedRecords)} 条，跳过坏行 ${model.stats.skippedLines} 行；错误 ${
    model.quality.errors
  } 个、警告 ${model.quality.warnings} 个。评分公式：<code>max(0, 100 − 8×errors − 2×warnings)</code>。</p>
    <h3 class="report-subhead">错误</h3>${list(errors)}
    <h3 class="report-subhead">警告</h3>${list(warnings)}`;
}

/** 渲染报告视图 */
export function createReportView(ctx) {
  let root = null;
  let lastSignature = '';

  function render() {
    if (!root) return;
    const model = buildReportModel(ctx);
    lastSignature = subscription();
    root.innerHTML = `<div class="view view--report">
      <div class="view-header">
        <div>
          <div class="view-title">${icon('report')}分析报告</div>
          <div class="view-sub">基于当前场景真实数据自动生成 · 支持打印 / 另存 PDF / 复制 Markdown / 导出 JSON</div>
        </div>
        <div class="view-actions">
          <button class="btn btn-sm" type="button" data-report-action="print">${icon('print')}打印 / PDF</button>
          <button class="btn btn-sm" type="button" data-report-action="markdown">${icon('copy')}复制 Markdown</button>
          <button class="btn btn-sm" type="button" data-report-action="json">${icon('download')}导出 JSON</button>
        </div>
      </div>
      <article class="report-paper" id="report-paper" aria-label="链路分析报告">
        <header class="report-head">
          <div class="report-brand">ChainLens · 探索链路可视化</div>
          <h1>探索链路分析报告</h1>
          <p class="report-meta">${esc(model.scenario.name)} · ${esc(model.scenario.engagementId)} · 生成于 ${esc(
      model.generatedAtText
    )}</p>
          <div class="report-badges">
            <span>${esc(model.scenario.mode)}</span>
            <span>数据质量 ${model.quality.score}</span>
            <span>${esc(model.stats.acceptedRecords)} 条记录</span>
            <span>${esc(model.attackCoverage.tacticCount)}/${model.attackCoverage.totalTactics} ATT&amp;CK 战术</span>
          </div>
        </header>

        <section class="report-section">
          <h2>1. 报告信息</h2>
          <table class="report-kv">
            <tr><th>场景名称</th><td>${esc(model.scenario.name)}</td><th>场景 ID</th><td>${esc(model.scenario.id)}</td></tr>
            <tr><th>授权依据</th><td colspan="3">${esc(model.scenario.authorization.basis || '数据未提供')}</td></tr>
            <tr><th>授权有效期</th><td>${esc(
              model.scenario.authorization.expires_at ? fmtDateTime(model.scenario.authorization.expires_at) : '—'
            )}</td><th>测试模式</th><td>${esc(model.scenario.mode)}</td></tr>
            <tr><th>目标范围</th><td colspan="3">${esc(model.scenario.scope.join('、') || '—')}</td></tr>
            <tr><th>操作者</th><td>${esc(model.scenario.operator || '—')}</td><th>团队</th><td>${esc(
      model.scenario.team.join('、') || '—'
    )}</td></tr>
            <tr><th>开始时间</th><td>${esc(fmtDateTime(model.scenario.startedAt))}</td><th>结束时间</th><td>${esc(
      model.scenario.endedAt ? fmtDateTime(model.scenario.endedAt) : '进行中 / 未记录'
    )}</td></tr>
            <tr><th>数据来源</th><td>${esc(model.scenario.source || '—')}</td><th>记录工具</th><td>${esc(
      `${model.scenario.tool.name || 'dsh-pentest'} ${model.scenario.tool.version || ''}`.trim()
    )}</td></tr>
          </table>
        </section>

        <section class="report-section">
          <h2>2. 执行摘要</h2>
          <p>${esc(model.summary)}</p>
        </section>

        <section class="report-section">
          <h2>3. 测试范围与授权</h2>
          <p>${esc(model.scenario.description || '本场景记录了授权范围内的探索过程。')}</p>
          <p>目标范围：${esc(model.scenario.scope.join('、') || '—')}；授权依据：${esc(
      model.scenario.authorization.basis || '数据未提供'
    )}。${esc(
      model.scenario.mode === '仿真模式'
        ? '本次为仿真模式，仅记录结构化过程数据，不发起网络扫描或攻击行为。'
        : '本次为授权测试模式，所有操作均应在书面授权与隔离靶场环境下进行。'
    )}</p>
        </section>

        <section class="report-section">
          <h2>4. 链路指标</h2>
          <table class="report-table report-metric-table"><tbody>${model.metrics
            .reduce((rows, metric, index) => {
              if (index % 4 === 0) rows.push([]);
              rows[rows.length - 1].push(metric);
              return rows;
            }, [])
            .map(
              (row) =>
                `<tr>${row
                  .map((metric) => `<td><span>${esc(metric.label)}</span><strong>${esc(metric.value)}</strong></td>`)
                  .join('')}</tr>`
            )
            .join('')}</tbody></table>
        </section>

        <section class="report-section">
          <h2>5. 阶段推进</h2>
          ${stageTable(model)}
        </section>

        <section class="report-section">
          <h2>6. 关键路径</h2>
          <p>关键路径风险分 <strong>${model.criticalPath.score.toFixed(1)}</strong>，经过 ${
      model.criticalPath.nodes.length
    } 个节点、${model.criticalPath.stages.length} 个阶段（${esc(
      model.criticalPath.stages.map(stageZh).join(' → ')
    )}）。${model.criticalPath.fallback ? '数据中没有满足阶段前向约束的边，按最高风险节点回退。' : ''}</p>
          <ol class="report-path">${model.criticalPath.nodes
            .map(
              (node) =>
                `<li><strong>${esc(node.label)}</strong><span>${esc(node.stageZh)} · 风险 ${Number(node.risk).toFixed(
                  1
                )}</span><code>${esc(node.id)}</code></li>`
            )
            .join('')}</ol>
        </section>

        <section class="report-section">
          <h2>7. 风险发现与建议</h2>
          ${findingsTable(model)}
        </section>

        <section class="report-section">
          <h2>8. ATT&amp;CK 覆盖</h2>
          <p>覆盖 ${model.attackCoverage.tacticCount}/${model.attackCoverage.totalTactics} 个战术、${
      model.attackCoverage.techniqueCount
    } 项技术，共 ${model.attackCoverage.recordCount} 条映射记录。</p>
          ${attackTable(model)}
        </section>

        <section class="report-section">
          <h2>9. 证据清单</h2>
          ${evidenceTable(model)}
        </section>

        <section class="report-section">
          <h2>10. 数据质量说明</h2>
          ${qualitySection(model)}
        </section>

        <footer class="report-footer">
          <p>本报告由 ChainLens 根据 dsh-pentest 记录的探索链路数据自动生成，仅用于授权测试与教学研究。</p>
          <p>${esc(model.scenario.name)} · ${esc(model.generatedAtText)} · 数据质量 ${model.quality.score}/100</p>
        </footer>
      </article>
    </div>`;
    root.querySelector('.view-actions').addEventListener('click', onAction);
  }

  async function onAction(event) {
    const button = event.target.closest('[data-report-action]');
    if (!button) return;
    const action = button.dataset.reportAction;
    const model = buildReportModel(ctx);
    if (action === 'print') {
      window.print();
    } else if (action === 'markdown') {
      const ok = await copyText(buildReportMarkdown(model));
      ctx.actions.toast(ok ? '报告 Markdown 已复制到剪贴板' : '复制失败，请检查浏览器剪贴板权限', ok ? 'success' : 'error');
    } else if (action === 'json') {
      const name = `chainlens-report-${ctx.scenario?.id || 'scenario'}.json`;
      downloadText(name, JSON.stringify(model, null, 2), 'application/json;charset=utf-8');
      ctx.actions.toast('报告 JSON 已导出', 'success');
    }
  }

  function subscription() {
    return `${ctx.chain.stats.acceptedRecords}|${ctx.scenario?.id}|${ctx.state.filters.q}`;
  }

  function mount(container) {
    root = container;
    render();
  }

  function update() {
    if (!root) return;
    if (subscription() !== lastSignature) render();
  }

  function destroy() {
    root = null;
    lastSignature = '';
  }

  return { mount, update, destroy };
}
