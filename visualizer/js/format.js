/**
 * 展示格式化工具：时间、数字、中文标签。
 * 纯函数模块，可被 Node 测试直接导入。
 */
import {
  ACTION_ZH,
  EVIDENCE_TYPE_MAP,
  NODE_TYPE_MAP,
  RELATION_MAP,
  RESULT_MAP,
  SEVERITY_MAP,
  STAGE_MAP,
  TACTIC_MAP,
  VIEWS
} from './constants.js';
import { clamp } from './util.js';

const pad = (n) => String(n).padStart(2, '0');

/** 解析时间戳为毫秒（支持 ISO 字符串或毫秒数；无效返回 NaN） */
export function tsMs(ts) {
  const n = typeof ts === 'number' ? ts : Date.parse(String(ts ?? ''));
  return Number.isFinite(n) ? n : NaN;
}

/** 日期 + 时间：2026-11-01 09:30 */
export function fmtDateTime(ts) {
  const n = tsMs(ts);
  if (!Number.isFinite(n)) return '—';
  const d = new Date(n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

/** 仅日期 */
export function fmtDate(ts) {
  const n = tsMs(ts);
  if (!Number.isFinite(n)) return '—';
  const d = new Date(n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 仅时钟：09:30 */
export function fmtClock(ts) {
  const n = tsMs(ts);
  if (!Number.isFinite(n)) return '—';
  const d = new Date(n);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 时钟 + 秒：09:30:15 */
export function fmtClockSec(ts) {
  const n = tsMs(ts);
  if (!Number.isFinite(n)) return '—';
  const d = new Date(n);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 人类可读时长：2 小时 6 分 / 12 分 30 秒 / 8 秒 */
export function fmtDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  if (total < 1000) return `${total} 毫秒`;
  const sec = Math.round(total / 1000);
  if (sec < 60) return `${sec} 秒`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (min < 60) return rest ? `${min} 分 ${rest} 秒` : `${min} 分`;
  const hour = Math.floor(min / 60);
  const minute = min % 60;
  return minute ? `${hour} 小时 ${minute} 分` : `${hour} 小时`;
}

/** 紧凑时长：1h26m / 12m30s */
export function fmtDurationShort(ms) {
  const sec = Math.round((Number(ms) || 0) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m${sec % 60 ? `${sec % 60}s` : ''}`;
  return `${Math.floor(min / 60)}h${min % 60 ? `${min % 60}m` : ''}`;
}

/** 毫秒耗时：123.4 ms */
export function fmtMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '—';
  if (n < 1) return `${(n * 1000).toFixed(1)} µs`;
  if (n < 1000) return `${n.toFixed(n < 10 ? 2 : 1)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

/** 数字千分位 */
export function fmtNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-CN');
}

/** 百分比（0–1） */
export function fmtPct(ratio, digits = 0) {
  const n = Number(ratio);
  if (!Number.isFinite(n)) return '—';
  return `${(clamp(n, 0, 1) * 100).toFixed(digits)}%`;
}

/** 阶段中文 */
export function stageZh(id) {
  return STAGE_MAP.get(id)?.zh || id || '—';
}

/** 节点类型中文 */
export function typeZh(id) {
  return NODE_TYPE_MAP.get(id)?.zh || id || '—';
}

/** 关系中文 */
export function relationZh(id) {
  return RELATION_MAP.get(id)?.zh || id || '—';
}

/** 结果中文 */
export function resultZh(id) {
  return RESULT_MAP.get(id)?.zh || id || '—';
}

/** 严重度中文 */
export function severityZh(id) {
  return SEVERITY_MAP.get(id)?.zh || id || '—';
}

/** 证据类型中文 */
export function evidenceTypeZh(id) {
  return EVIDENCE_TYPE_MAP.get(id)?.zh || id || '—';
}

/** 动作中文（无映射时保留原始 snake_case） */
export function actionZh(id) {
  return ACTION_ZH[id] || String(id || '—').replace(/_/g, ' ');
}

/** tactic 中文 */
export function tacticZh(id) {
  return TACTIC_MAP.get(id)?.zh || id || '—';
}

/** 视图中文 */
export function viewZh(id) {
  return VIEWS.find((v) => v.id === id)?.zh || id;
}

/** 将 props 的值格式化为可显示文本 */
export function fmtPropValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.map(fmtPropValue).join('、');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '—';
    }
  }
  return String(value);
}

/** 根据风险分返回颜色（绿 → 琥珀 → 红） */
export function riskColor(risk) {
  const n = clamp(risk, 0, 10);
  if (n >= 8) return '#ef4444';
  if (n >= 6) return '#f97316';
  if (n >= 3.5) return '#eab308';
  if (n > 0) return '#22c55e';
  return '#475569';
}

/** 根据风险分返回等级中文 */
export function riskLevel(risk) {
  const n = clamp(risk, 0, 10);
  if (n >= 8) return '严重';
  if (n >= 6) return '高';
  if (n >= 3.5) return '中';
  if (n > 0) return '低';
  return '无';
}

/** 文本截断 + 省略号（用于 SVG 标签） */
export function shorten(text, maxLen = 12) {
  const s = String(text ?? '');
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

/** 从 props 推断严重度（优先 props.severity，否则按 risk 映射） */
export function inferSeverity(node) {
  const explicit = node?.props?.severity;
  if (explicit && SEVERITY_MAP.has(explicit)) return explicit;
  const risk = Number(node?.risk) || 0;
  if (risk >= 9) return 'critical';
  if (risk >= 7) return 'high';
  if (risk >= 4) return 'medium';
  if (risk > 0) return 'low';
  return 'info';
}

/** 状态中文（发现 status） */
export function findingStatusZh(status) {
  const map = { open: '待修复', fixed: '已修复', accepted: '已接受', confirmed: '已确认', suspected: '疑似' };
  return map[status] || status || '—';
}

/** 数值范围标签 */
export function rangeLabel(min, max) {
  return `${fmtClock(min)} – ${fmtClock(max)}`;
}
