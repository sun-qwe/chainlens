/**
 * ATT&CK 覆盖矩阵：tactic 为列、technique 为行（仅显示数据中出现的），
 * 单元格热力色表示事件计数；点击单元格筛选下方命中事件。
 */
import { RESULT_MAP, TACTICS } from '../constants.js';
import { filterChain } from '../filtering.js';
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { fmtClock, stageZh } from '../format.js';
import { resultBadge } from '../ui.js';

function shortName(name) {
  const text = String(name || '');
  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
}

function metricsBlock(attack) {
  return `<div class="attack-metrics">
    <div class="panel attack-metric"><div class="label">${icon('target')}战术覆盖</div><div class="value" style="color:var(--cyan)">${
      attack.tacticCount
    }<small> / ${attack.totalTactics}</small></div><div class="sub faint">出现映射的 MITRE 战术数</div></div>
    <div class="panel attack-metric"><div class="label">${icon('grid')}技术数</div><div class="value" style="color:var(--purple)">${
      attack.techniqueCount
    }</div><div class="sub faint">去重后的 technique 数量</div></div>
    <div class="panel attack-metric"><div class="label">${icon('clock')}映射事件</div><div class="value">${
      attack.eventCount
    }<small> 个</small></div><div class="sub faint">带 attck 字段的 event 记录</div></div>
    <div class="panel attack-metric"><div class="label">${icon('link')}映射记录</div><div class="value">${
      attack.recordCount
    }<small> 条</small></div><div class="sub faint">节点 + 关系 + 事件合计</div></div>
  </div>`;
}

function cellMarkup(tacticId, technique, selected, maxEvents) {
  const eventCount = technique.eventCount;
  const intensity = eventCount / Math.max(1, maxEvents);
  const classes = ['attack-cell'];
  if (eventCount > 0) classes.push('is-covered');
  if (intensity >= 0.66) classes.push('is-hot');
  if (selected) classes.push('is-selected');
  const title = `${technique.id} ${technique.name || ''}｜事件 ${technique.eventCount} · 节点 ${technique.nodeCount} · 关系 ${technique.edgeCount}`;
  return `<button class="${classes.join(' ')}" type="button" data-tactic="${esc(tacticId)}" data-technique="${esc(
    technique.id
  )}" title="${esc(title)}">
    <span class="tech-id">${esc(technique.id)}</span>
    <span class="tech-name">${esc(shortName(technique.name || technique.id))}</span>
    <span class="tech-count"><b>${eventCount}</b> 事件</span>
  </button>`;
}

function matrixMarkup(attack, selected) {
  const maxEvents = Math.max(1, ...attack.tactics.flatMap((t) => t.techniques.map((tech) => tech.eventCount)));
  const columns = attack.tactics.map((tactic) => {
    const covered = tactic.recordCount > 0;
    const cells = tactic.techniques.length
      ? tactic.techniques
          .map((technique) =>
            cellMarkup(
              tactic.id,
              technique,
              selected && selected.tactic === tactic.id && selected.technique === technique.id,
              maxEvents
            )
          )
          .join('')
      : `<div class="attack-empty-cell">未使用</div>`;
    return `<div class="attack-col">
      <div class="attack-col-head${covered ? ' is-covered' : ''}">
        <span class="tactic-zh">${esc(tactic.zh)}</span>
        <span class="tactic-id">${esc(tactic.id)} · ${tactic.eventCount} 事件</span>
      </div>
      ${cells}
    </div>`;
  });
  return `<div class="attack-matrix-wrap"><div class="attack-matrix">${columns.join('')}</div></div>`;
}

function eventsList(attack, ctx, selected) {
  const filtered = filterChain(ctx.chain, ctx.state.filters);
  let records = attack.records.filter(
    (record) => record.kind === 'event' && filtered.eventIds.has(record.id)
  );
  if (selected) {
    records = records.filter(
      (record) => record.tactic === selected.tactic && record.technique === selected.technique
    );
  }
  records.sort((a, b) => a.tsMs - b.tsMs);
  const limit = 80;
  const shown = records.slice(0, limit);
  const heading = selected
    ? `${selected.tactic} · ${selected.technique}${selected.name ? ` ${selected.name}` : ''}`
    : '全部 ATT&CK 映射事件';
  const rows = shown
    .map((record) => {
      const event = record.record;
      return `<button class="attack-event-row" type="button" data-open-event="${esc(event.id)}">
        <time>${esc(fmtClock(event.ts))}</time>
        <span class="badge">${esc(stageZh(event.stage))}</span>
        <span class="mono" style="color:var(--text-faint);font-size:10px">${esc(record.technique)}</span>
        <span class="attack-event-summary">${esc(event.summary)}</span>
        <span class="result-tag">${resultBadge(event.result)}</span>
      </button>`;
    })
    .join('');
  return `<section class="panel attack-events" aria-label="命中事件">
    <div class="panel-head">
      <h3>${icon('clock')}${esc(heading)}</h3>
      <span class="micro">${records.length} 个事件${records.length > limit ? `（显示前 ${limit} 条）` : ''}</span>
    </div>
    ${rows || `<div class="empty-state">${icon('shield')}<strong>没有命中事件</strong><span>当前筛选条件下该技术没有事件记录</span></div>`}
  </section>`;
}

/** 渲染 ATT&CK 视图 */
export function createAttackView(ctx) {
  let root = null;
  let lastSignature = '';

  function template() {
    return `<div class="view view--attack">
      <div class="view-header">
        <div>
          <div class="view-title">${icon('shield')}ATT&amp;CK 矩阵</div>
          <div class="view-sub">按 tactic 分组展示本次探索链路覆盖的 MITRE ATT&amp;CK 技术；单元格颜色表示事件计数</div>
        </div>
        <div class="view-actions">
          <button class="btn btn-sm" type="button" data-attack-action="clear" data-role="clear-cell" hidden>${icon(
            'close'
          )}清除选择</button>
        </div>
      </div>
      <div data-role="body"></div>
    </div>`;
  }

  function render() {
    if (!root) return;
    const attack = ctx.derived.attack;
    const body = root.querySelector('[data-role="body"]');
    const selected = ctx.state.attackCell;
    if (!attack.recordCount) {
      body.innerHTML = `${metricsBlock(attack)}<div class="panel" style="padding:20px">${''}
        <div class="empty-state">${icon('shield')}<strong>本场景暂无 ATT&amp;CK 映射数据</strong>
        <span>数据中的节点 / 事件 / 关系均未携带 attck 字段，无法生成覆盖矩阵。</span>
        <span class="faint">数据规范：attck 需包含 tactic（TAxxxx）与 technique（Txxxx）字段。</span></div></div>`;
    } else {
      body.innerHTML = `${metricsBlock(attack)}
        <section class="panel" style="padding:14px" aria-label="覆盖矩阵">
          <div class="panel-head">
            <h3>${icon('grid')}覆盖矩阵</h3>
            <span class="micro">${attack.usedTactics.length} / ${TACTICS.length} 战术 · ${attack.techniqueCount} 技术 · 热度=事件数</span>
          </div>
          ${matrixMarkup(attack, selected)}
        </section>
        ${eventsList(attack, ctx, selected)}`;
    }
    const clear = root.querySelector('[data-role="clear-cell"]');
    if (clear) clear.hidden = !selected;
    lastSignature = signature();
    bind();
  }

  function signature() {
    return `${JSON.stringify(ctx.state.filters)}|${JSON.stringify(ctx.state.attackCell)}|${ctx.chain.stats.acceptedRecords}`;
  }

  function bind() {
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';
    root.addEventListener('click', (event) => {
      const clearBtn = event.target.closest?.('[data-attack-action="clear"]');
      if (clearBtn) {
        ctx.actions.setAttackCell(null);
        return;
      }
      const cell = event.target.closest?.('.attack-cell');
      if (!cell) return;
      const tactic = cell.dataset.tactic;
      const technique = cell.dataset.technique;
      const current = ctx.state.attackCell;
      if (current && current.tactic === tactic && current.technique === technique) {
        ctx.actions.setAttackCell(null);
        return;
      }
      const tacticInfo = ctx.derived.attack.tactics.find((t) => t.id === tactic);
      const techInfo = tacticInfo?.techniques.find((t) => t.id === technique);
      ctx.actions.setAttackCell({ tactic, technique, name: techInfo?.name || '' });
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
