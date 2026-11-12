/**
 * 发现与证据视图：风险发现表（可排序 / 筛选 / 导出 CSV）与证据库（敏感默认打码 / 导出 JSON）。
 */
import { NODE_TYPE_MAP, SEVERITIES, STAGE_MAP, STAGE_INDEX } from '../constants.js';
import { filterChain, filterEvidenceList, filterFindings } from '../filtering.js';
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { evidenceTypeZh, fmtClock, fmtDateTime, findingStatusZh, severityZh, stageZh } from '../format.js';
import { severityBadge, typeChip } from '../ui.js';

const SORTABLE = {
  severity: { label: '严重度', value: (f) => SEVERITIES.find((s) => s.id === f.severity)?.rank || 0 },
  title: { label: '标题', value: (f) => f.title || '' },
  cvss: { label: 'CVSS', value: (f) => (f.cvss === null ? -1 : f.cvss) },
  asset: { label: '资产', value: (f) => f.assetLabel || '' },
  stage: { label: '阶段', value: (f) => STAGE_INDEX.get(f.stage) ?? 0 },
  status: { label: '状态', value: (f) => f.status || '' },
  evidence: { label: '证据', value: (f) => f.evidenceCount || 0 }
};

function summaryStrip(findings, evidence, coverage) {
  const counts = new Map(SEVERITIES.map((s) => [s.id, 0]));
  for (const finding of findings) counts.set(finding.severity, (counts.get(finding.severity) || 0) + 1);
  const confirmed = findings.filter((f) => f.status === 'confirmed').length;
  const suspected = findings.filter((f) => f.status === 'suspected').length;
  const confirmedRatio = confirmed + suspected ? confirmed / (confirmed + suspected) : 0;
  const sensitiveCount = evidence.filter((item) => item.sensitive).length;
  const cards = [
    { label: '严重', value: counts.get('critical') || 0, color: SEVERITIES[0].color, sub: 'critical' },
    { label: '高危', value: counts.get('high') || 0, color: SEVERITIES[1].color, sub: 'high' },
    {
      label: '中 / 低危',
      value: (counts.get('medium') || 0) + (counts.get('low') || 0),
      color: SEVERITIES[2].color,
      sub: `中 ${counts.get('medium') || 0} · 低 ${counts.get('low') || 0}`
    },
    {
      label: '已确认比例',
      value: `${Math.round(confirmedRatio * 100)}%`,
      color: 'var(--green)',
      sub: `已确认 ${confirmed} · 疑似 ${suspected}`
    },
    {
      label: '证据覆盖率',
      value: `${coverage.covered}/${coverage.total}`,
      color: 'var(--amber)',
      sub: `敏感证据 ${sensitiveCount} 条 · 比例 ${Math.round(coverage.ratio * 100)}%`
    }
  ];
  return `<div class="findings-summary">${cards
    .map(
      (card) => `<div class="panel summary-stat"><div class="label"><i style="--c:${card.color}"></i>${esc(
        card.label
      )}</div><div class="value" style="color:${card.color}">${esc(String(card.value))}</div><div class="sub">${esc(
        card.sub
      )}</div></div>`
    )
    .join('')}</div>`;
}

function statusPill(finding) {
  const status = finding.status || '';
  const label = findingStatusZh(status);
  const cls = status === 'open' ? 'is-open' : status === 'fixed' ? 'is-fixed' : '';
  return `<span class="status-pill ${cls}">${esc(label)}</span>`;
}

function sortFindings(list, sort) {
  const def = SORTABLE[sort.key] || SORTABLE.severity;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return list.slice().sort((a, b) => {
    const av = def.value(a);
    const bv = def.value(b);
    if (av === bv) return (b.risk || 0) - (a.risk || 0);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'zh-CN') * dir;
  });
}

function findingRows(list) {
  return list
    .map(
      (finding) => `<tr data-open-node="${esc(finding.id)}" tabindex="0" role="button" aria-label="${esc(
        finding.title
      )}">
        <td>${severityBadge(finding.severity)}</td>
        <td><span class="cell-title">${esc(finding.title)}<small>${esc(finding.id)} · ${esc(
          NODE_TYPE_MAP.get(finding.type)?.zh || finding.type
        )}</small></span></td>
        <td class="cvss">${finding.cvss === null ? '—' : finding.cvss.toFixed(1)}</td>
        <td><span class="truncate" style="display:block;max-width:180px" title="${esc(finding.assetLabel)}">${esc(
          finding.assetLabel
        )}</span></td>
        <td>${esc(stageZh(finding.stage))}</td>
        <td>${statusPill(finding)}</td>
        <td><span class="evidence-count">${icon('data')}<b>${finding.evidenceCount}</b></span></td>
      </tr>`
    )
    .join('');
}

function evidenceRows(list) {
  return list
    .map(
      (item) => `<tr data-open-evidence="${esc(item.id)}" tabindex="0" role="button" aria-label="${esc(item.title)}">
        <td><span class="badge">${esc(evidenceTypeZh(item.type))}</span></td>
        <td><span class="cell-title">${esc(item.title)}<small>${esc(item.id)} · ${esc(
          item.hash ? item.hash.slice(0, 22) : '无哈希'
        )}</small></span></td>
        <td>${item.nodeLabel ? `<span class="truncate" style="display:block;max-width:170px">${esc(item.nodeLabel)}</span>` : '—'}</td>
        <td class="mono" style="font-size:10.5px">${esc(fmtClock(item.ts))}</td>
        <td>${item.sensitive ? '<span class="sensitive-tag">已脱敏</span>' : '<span class="faint">公开</span>'}</td>
      </tr>`
    )
    .join('');
}

function tableHead(kind, sort) {
  if (kind === 'findings') {
    const cols = [
      ['severity', '严重度'],
      ['title', '标题'],
      ['cvss', 'CVSS'],
      ['asset', '资产'],
      ['stage', '阶段'],
      ['status', '状态'],
      ['evidence', '证据']
    ];
    return `<thead><tr>${cols
      .map(
        ([key, label]) =>
          `<th scope="col"><button class="th-btn" type="button" data-sort="${key}">${esc(label)}${
            sort.key === key ? `<span class="sort-arrow">${sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''
          }</button></th>`
      )
      .join('')}</tr></thead>`;
  }
  return `<thead><tr><th scope="col">类型</th><th scope="col">标题</th><th scope="col">关联节点</th><th scope="col">时间</th><th scope="col">敏感</th></tr></thead>`;
}

export function createFindingsView(ctx) {
  let root = null;
  let lastSignature = '';
  let sort = { key: 'severity', dir: 'desc' };
  let sortKey = '';

  function signature() {
    return `${JSON.stringify(ctx.state.filters)}|${ctx.state.tab}|${ctx.chain.stats.acceptedRecords}|${JSON.stringify(
      sort
    )}`;
  }

  function template() {
    return `<div class="view view--findings">
      <div class="view-header">
        <div>
          <div class="view-title">${icon('alert')}发现与证据</div>
          <div class="view-sub">风险发现表支持排序与筛选；敏感证据默认打码，仅展示标题与已脱敏说明</div>
        </div>
        <div class="view-actions">
          <button class="btn btn-sm" type="button" data-export="findings">${icon('download')}导出发现 CSV</button>
          <button class="btn btn-sm" type="button" data-export="evidence">${icon('download')}导出证据 JSON</button>
        </div>
      </div>
      <div data-role="summary"></div>
      <div class="tabs" role="tablist" aria-label="发现与证据切换">
        <button class="tab" type="button" role="tab" data-tab="findings" data-role="tab-findings">${icon('alert')}风险发现<span class="count" data-role="finding-count">0</span></button>
        <button class="tab" type="button" role="tab" data-tab="evidence" data-role="tab-evidence">${icon('data')}证据库<span class="count" data-role="evidence-count">0</span></button>
      </div>
      <section class="panel table-panel" data-role="table"></section>
    </div>`;
  }

  function render() {
    if (!root) return;
    const derived = ctx.derived;
    const chain = ctx.chain;
    const filtered = filterChain(chain, ctx.state.filters);
    const findings = sortFindings(
      filterFindings(derived.findings, ctx.state.filters).filter((f) => {
        if (ctx.state.filters.types?.length && !filtered.nodeIds.has(f.id)) return false;
        return true;
      }),
      sort
    );
    const evidence = filterEvidenceList(derived.evidenceList, ctx.state.filters).filter(
      (item) => filtered.evidenceIds.has(item.id) || !ctx.state.filters.types?.length
    );
    evidence.sort((a, b) => b.tsMs - a.tsMs);
    const tab = ctx.state.tab === 'evidence' ? 'evidence' : 'findings';

    root.querySelector('[data-role="summary"]').innerHTML = summaryStrip(
      derived.findings,
      derived.evidenceList,
      derived.evidenceCoverage
    );
    root.querySelector('[data-role="finding-count"]').textContent = String(derived.findings.length);
    root.querySelector('[data-role="evidence-count"]').textContent = String(derived.evidenceList.length);
    root.querySelector('[data-role="tab-findings"]').classList.toggle('is-active', tab === 'findings');
    root.querySelector('[data-role="tab-evidence"]').classList.toggle('is-active', tab === 'evidence');
    root
      .querySelector('[data-role="tab-findings"]')
      .setAttribute('aria-selected', String(tab === 'findings'));
    root.querySelector('[data-role="tab-evidence"]').setAttribute('aria-selected', String(tab === 'evidence'));

    const table = root.querySelector('[data-role="table"]');
    if (tab === 'findings') {
      table.innerHTML = `<div class="table-wrap"><table class="data-table">${tableHead('findings', sort)}<tbody>${
        findings.length
          ? findingRows(findings)
          : ''
      }</tbody></table></div>${
        findings.length
          ? ''
          : `<div class="findings-empty">${`<div class="empty-state">${icon(
              'shield'
            )}<strong>没有符合筛选条件的风险发现</strong><span>调整左侧筛选项或搜索关键词</span></div>`}</div>`
      }`;
    } else {
      table.innerHTML = `<div class="table-wrap"><table class="data-table">${tableHead('evidence', sort)}<tbody>${
        evidence.length ? evidenceRows(evidence) : ''
      }</tbody></table></div>${
        evidence.length
          ? ''
          : `<div class="findings-empty"><div class="empty-state">${icon(
              'data'
            )}<strong>没有符合筛选条件的证据</strong><span>调整搜索或筛选条件</span></div></div>`
      }`;
    }
    // 表格说明
    const footNote = document.createElement('div');
    footNote.className = 'export-hint';
    footNote.style.padding = '8px 12px 10px';
    footNote.textContent =
      tab === 'findings'
        ? `共 ${findings.length} 项风险发现 · 默认按严重度排序 · 点击表头切换排序 · 点击行查看详情`
        : `共 ${evidence.length} 条证据 · 敏感证据内容不会在表格中展示 · 点击行查看详情`;
    table.appendChild(footNote);
    lastSignature = signature();
    bind();
  }

  function bind() {
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';
    // 行点击 / Tab 切换由 app 的统一委托处理，这里只处理表头排序
    root.addEventListener('click', (event) => {
      const sortBtn = event.target.closest?.('[data-sort]');
      if (!sortBtn) return;
      const key = sortBtn.dataset.sort;
      if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
      else sort = { key, dir: key === 'title' || key === 'asset' || key === 'status' ? 'asc' : 'desc' };
      render();
    });
  }

  function mount(container) {
    root = container;
    root.innerHTML = template();
    bind();
    render();
  }

  function update() {
    if (!root) return;
    if (signature() !== lastSignature) render();
  }

  function destroy() {
    root = null;
    lastSignature = '';
  }

  return { mount, update, destroy };
}
