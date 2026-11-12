/**
 * URL 深链解析与生成（规格 5.1 节）。
 * 支持的格式：
 *   #/overview?scenario=campus-lab
 *   #/graph?scenario=corp-ad&cursor=120&critical=1&focus=vuln-007&filter=stage:initial_access,type:vulnerability
 *   #/timeline?scenario=campus-lab&cursor=50
 *   #/attack?scenario=cloud-k8s
 *   #/findings?scenario=campus-lab&severity=high,critical
 *   #/report?scenario=campus-lab
 *   #/about
 * 纯函数，不直接访问 location/history，便于单元测试。
 */
import { RELATION_IDS, RESULT_IDS, SEVERITY_IDS, STAGE_IDS, VIEW_IDS } from './constants.js';
import { emptyFilters } from './filtering.js';
import { normalizeFilters } from './filtering.js';

export const DEFAULT_VIEW = 'overview';
export const EXTRA_VIEWS = ['about'];
export const ALL_VIEWS = [...VIEW_IDS, ...EXTRA_VIEWS];

function splitValues(text) {
  return String(text || '')
    .split(/[,\s|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function enc(value) {
  return encodeURIComponent(String(value))
    .replace(/%3A/gi, ':')
    .replace(/%2C/gi, ',')
    .replace(/%7C/gi, '|');
}

/** 解析 hash（也接受完整 URL 的 hash 部分） */
export function parseRoute(hash = '') {
  let raw = String(hash || '').trim();
  if (raw.startsWith('#')) raw = raw.slice(1);
  if (raw.startsWith('/')) raw = raw.slice(1);
  const [pathPart = '', queryPart = ''] = raw.split('?');
  const candidate = decodeURIComponent((pathPart.split('/')[0] || '').trim());
  const view = ALL_VIEWS.includes(candidate) ? candidate : DEFAULT_VIEW;
  const params = Object.fromEntries(new URLSearchParams(queryPart));

  const filters = emptyFilters();
  const addValues = (key, values) => {
    for (const value of values) {
      if (key === 'stage' || key === 'stages') filters.stages.push(value);
      else if (key === 'type' || key === 'types') filters.types.push(value);
      else if (key === 'severity' || key === 'severities') filters.severities.push(value);
      else if (key === 'result' || key === 'results') filters.results.push(value);
      else if (key === 'relation' || key === 'relations') filters.relations.push(value);
      else if (key === 'q' || key === 'search') filters.q = value;
    }
  };

  // filter=stage:initial_access,type:vulnerability（值与键均可出现多次）
  for (const token of String(params.filter || '').split(',')) {
    if (!token) continue;
    const idx = token.indexOf(':');
    if (idx < 0) continue;
    const key = token.slice(0, idx).trim();
    const values = token
      .slice(idx + 1)
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    addValues(key, values);
  }
  for (const key of ['stage', 'stages', 'type', 'types', 'severity', 'severities', 'result', 'results', 'relation', 'relations']) {
    if (params[key] !== undefined) addValues(key, splitValues(params[key]));
  }
  if (params.q !== undefined) filters.q = params.q;

  const normalized = normalizeFilters(filters);
  const totalKeys = [
    ...normalized.stages,
    ...normalized.types,
    ...normalized.severities,
    ...normalized.results,
    ...normalized.relations
  ];
  void totalKeys;

  let cursor = null;
  if (params.cursor !== undefined && params.cursor !== '') {
    const n = Number(params.cursor);
    if (Number.isFinite(n) && n >= 0) cursor = Math.floor(n);
  }

  let zoom = null;
  if (params.zoom !== undefined && params.zoom !== '') {
    const n = Number(params.zoom);
    if (Number.isFinite(n)) zoom = Math.min(2.5, Math.max(0.3, Math.round(n * 100) / 100));
  }
  const fit = params.fit === '1' || params.fit === 'true';

  return {
    view,
    params,
    filters: normalized,
    scenarioId: typeof params.scenario === 'string' && params.scenario ? params.scenario : null,
    data: typeof params.data === 'string' && params.data ? params.data : null,
    cursor,
    critical: params.critical === '1' || params.critical === 'true',
    zoom,
    fit,
    focus: typeof params.focus === 'string' && params.focus ? params.focus : null,
    tab: params.tab === 'evidence' ? 'evidence' : params.tab === 'findings' ? 'findings' : null,
    tactic: typeof params.tactic === 'string' && params.tactic ? params.tactic : null,
    technique: typeof params.technique === 'string' && params.technique ? params.technique : null,
    raw
  };
}

function pushIf(array, key, value) {
  if (value === undefined || value === null || value === '') return;
  array.push(`${key}=${enc(value)}`);
}

/**
 * 从应用状态生成 hash。
 * @param {{view:string, scenarioId?:string, cursor?:number|null, critical?:boolean, focus?:string|null, filters?:object, tab?:string, tactic?:string|null, technique?:string|null, data?:string|null}} state
 */
export function buildRoute(state = {}) {
  const view = ALL_VIEWS.includes(state.view) ? state.view : DEFAULT_VIEW;
  const parts = [];
  pushIf(parts, 'scenario', state.scenarioId);
  if (state.data) pushIf(parts, 'data', state.data);
  if (state.cursor !== null && state.cursor !== undefined && (view === 'graph' || view === 'timeline')) {
    parts.push(`cursor=${Math.max(0, Math.floor(Number(state.cursor) || 0))}`);
  }
  if (state.critical) parts.push('critical=1');
  if (view === 'graph' && state.zoom !== null && state.zoom !== undefined && state.zoom !== '') {
    parts.push(`zoom=${Math.min(2.5, Math.max(0.3, Number(state.zoom))).toFixed(2)}`);
  }
  if (view === 'graph' && state.fit) parts.push('fit=1');
  pushIf(parts, 'focus', state.focus);
  if (state.tab && view === 'findings') pushIf(parts, 'tab', state.tab);
  if (state.tactic) pushIf(parts, 'tactic', state.tactic);
  if (state.technique) pushIf(parts, 'technique', state.technique);

  const filters = normalizeFilters(state.filters || {});
  if (filters.severities.length) parts.push(`severity=${enc(filters.severities.join(','))}`);
  const tokens = [];
  if (filters.stages.length) tokens.push(`stage:${filters.stages.join('|')}`);
  if (filters.types.length) tokens.push(`type:${filters.types.join('|')}`);
  if (filters.results.length) tokens.push(`result:${filters.results.join('|')}`);
  if (filters.relations.length) tokens.push(`relation:${filters.relations.join('|')}`);
  if (tokens.length) parts.push(`filter=${enc(tokens.join(','))}`);
  if (filters.q) parts.push(`q=${enc(filters.q)}`);

  const query = parts.length ? `?${parts.join('&')}` : '';
  return `#/${view}${query}`;
}

/** 生成当前状态的快照（仅包含深链相关字段） */
export function routeSnapshot(state) {
  return {
    view: state.view,
    scenarioId: state.scenarioId,
    cursor: state.cursor,
    critical: Boolean(state.critical),
    zoom: state.zoom ?? null,
    fit: Boolean(state.fit),
    focus: state.focus || null,
    filters: state.filters,
    tab: state.tab || null,
    tactic: state.tactic || null,
    technique: state.technique || null
  };
}

/** 合法 id 集合校验（用于识别无效深链参数） */
export function validFilterValue(kind, value) {
  if (kind === 'stage') return STAGE_IDS.includes(value);
  if (kind === 'severity') return SEVERITY_IDS.includes(value);
  if (kind === 'result') return RESULT_IDS.includes(value);
  if (kind === 'relation') return RELATION_IDS.includes(value);
  return true;
}

export const routerApi = { parseRoute, buildRoute, routeSnapshot, DEFAULT_VIEW, ALL_VIEWS };
