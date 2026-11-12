/**
 * 通用 UI 片段（深色设计系统）：徽标、胶囊、空态、指标块等。
 * 仅被 DOM 视图引用。
 */
import {
  NODE_TYPE_MAP,
  RESULT_MAP,
  SEVERITY_MAP,
  STAGE_MAP
} from './constants.js';
import { esc } from './util.js';
import { icon, typeIcon } from './icons.js';
import { resultZh, stageZh, typeZh } from './format.js';

/** 严重度胶囊 */
export function severityBadge(severity, label) {
  const spec = SEVERITY_MAP.get(severity) || { color: '#64748b', zh: severity || '未知' };
  return `<span class="sev-pill" style="--c:${spec.color}"><i></i>${esc(label || spec.zh)}</span>`;
}

/** 结果胶囊 / 文本 */
export function resultBadge(result, withText = true) {
  const spec = RESULT_MAP.get(result) || { color: '#64748b', zh: result || '未知' };
  return `<span class="sev-pill" style="--c:${spec.color}"><i></i>${withText ? esc(spec.zh) : ''}</span>`;
}

/** 结果圆点 */
export function resultDot(result, title = '') {
  const spec = RESULT_MAP.get(result) || { color: '#64748b', zh: result || '未知' };
  return `<span class="result-dot" style="--c:${spec.color}" title="${esc(title || spec.zh)}" aria-label="${esc(
    spec.zh
  )}"></span>`;
}

/** 阶段小徽标 */
export function stageChip(stageId) {
  const spec = STAGE_MAP.get(stageId);
  return `<span class="badge"><span class="dot" style="background:${spec?.color || '#64748b'}"></span>${esc(
    stageZh(stageId)
  )}</span>`;
}

/** 节点类型小徽标 */
export function typeChip(typeId) {
  const spec = NODE_TYPE_MAP.get(typeId);
  return `<span class="badge"><span class="dot" style="background:${spec?.color || '#64748b'}"></span>${esc(
    typeZh(typeId)
  )}</span>`;
}

/** 严重度颜色 */
export function severityColor(severity) {
  return SEVERITY_MAP.get(severity)?.color || '#64748b';
}

/** 数据质量颜色 */
export function qualityColor(score) {
  if (score >= 90) return 'var(--green)';
  if (score >= 75) return 'var(--cyan)';
  if (score >= 55) return 'var(--amber)';
  return 'var(--red)';
}

/** 空态 */
export function emptyState(iconName, title, sub = '', actionHtml = '') {
  return `<div class="empty-state">${icon(iconName)}<strong>${esc(title)}</strong>${
    sub ? `<span>${esc(sub)}</span>` : ''
  }${actionHtml}</div>`;
}

/** KV 表格 */
export function kvGrid(entries) {
  const cells = entries
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(
      ([key, value]) =>
        `<div class="kv-cell kv-key">${esc(key)}</div><div class="kv-cell">${
          typeof value === 'string' && value.startsWith('<') ? value : esc(value)
        }</div>`
    )
    .join('');
  return `<div class="kv-grid">${cells}</div>`;
}

/** 风险条 */
export function riskMeter(risk) {
  const value = Math.max(0, Math.min(10, Number(risk) || 0));
  return `<div class="risk-meter"><div class="risk-meter-track"><div class="risk-meter-fill" style="width:${
    (value / 10) * 100
  }%"></div></div><span class="risk-meter-value">${value.toFixed(1)}</span></div>`;
}

/** 关联节点引用胶囊 */
export function refChip(node, extra = '') {
  if (!node) return '';
  const spec = NODE_TYPE_MAP.get(node.type);
  return `<button class="ref-chip" type="button" data-open-node="${esc(node.id)}"><span class="dot" style="background:${
    spec?.color || '#64748b'
  }"></span><span class="truncate">${esc(node.label)}</span><span class="ref-id">${esc(node.id)}</span>${
    extra ? `<span class="faint">${esc(extra)}</span>` : ''
  }</button>`;
}

/** 事件缩略行 */
export function eventMini(event) {
  const spec = RESULT_MAP.get(event.result) || { color: '#64748b' };
  return `<button class="event-mini" type="button" data-open-event="${esc(event.id)}"><time class="ev-time">${esc(
    event.ts.slice(11, 16)
  )}</time><span class="result-dot" style="--c:${spec.color};margin-top:4px"></span><span class="ev-text">${esc(
    event.summary
  )}</span></button>`;
}

/** 指标卡 */
export function metricBlock(label, value, sub = '', color = 'var(--cyan)', iconName = '') {
  return `<div class="panel attack-metric">
    <div class="label">${iconName ? icon(iconName) : ''}${esc(label)}</div>
    <div class="value" style="color:${color}">${value}</div>
    ${sub ? `<div class="sub faint">${esc(sub)}</div>` : ''}
  </div>`;
}

/** 结果中文 */
export function resultLabel(id) {
  return resultZh(id);
}
