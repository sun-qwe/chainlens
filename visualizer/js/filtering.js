/**
 * 筛选逻辑（规格 5.2 左侧筛选栏）：搜索 / 阶段 / 节点类型 / 严重度 / 结果 / 关系。
 * 纯模块；筛选结果以 id 集合返回，供链路图、时间线、发现与证据等视图复用。
 */
import {
  NODE_TYPE_MAP,
  RELATION_MAP,
  RESULT_MAP,
  SEVERITY_MAP,
  STAGE_MAP
} from './constants.js';
import { inferSeverity, severityZh } from './format.js';

const nodeHaystackCache = new WeakMap();
const edgeHaystackCache = new WeakMap();
const eventHaystackCache = new WeakMap();
const evidenceHaystackCache = new WeakMap();
const findingHaystackCache = new WeakMap();

/** 扁平化 props 中的可搜索文本（最多 3 层） */
function flattenProps(value, out, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenProps(item, out, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const child of Object.values(value)) flattenProps(child, out, depth + 1);
  }
}

function propsText(props) {
  const parts = [];
  flattenProps(props, parts);
  return parts.join(' ');
}

/** 空筛选条件 */
export function emptyFilters() {
  return { q: '', stages: [], types: [], severities: [], results: [], relations: [] };
}

/** 是否没有任何筛选条件 */
export function hasActiveFilters(filters) {
  if (!filters) return false;
  return Boolean(
    filters.q ||
      filters.stages?.length ||
      filters.types?.length ||
      filters.severities?.length ||
      filters.results?.length ||
      filters.relations?.length
  );
}

/** 统计激活的筛选项数量 */
export function activeFilterCount(filters) {
  if (!filters) return 0;
  return (
    (filters.q ? 1 : 0) +
    (filters.stages?.length || 0) +
    (filters.types?.length || 0) +
    (filters.severities?.length || 0) +
    (filters.results?.length || 0) +
    (filters.relations?.length || 0)
  );
}

/** 规范化外部传入的筛选对象 */
export function normalizeFilters(input = {}) {
  const base = emptyFilters();
  return {
    q: typeof input.q === 'string' ? input.q.trim().toLowerCase() : '',
    stages: Array.isArray(input.stages) ? [...new Set(input.stages.filter((s) => STAGE_MAP.has(s)))] : [],
    types: Array.isArray(input.types) ? [...new Set(input.types.filter((t) => NODE_TYPE_MAP.has(t)))] : [],
    severities: Array.isArray(input.severities)
      ? [...new Set(input.severities.filter((s) => SEVERITY_MAP.has(s)))]
      : [],
    results: Array.isArray(input.results) ? [...new Set(input.results.filter((r) => RESULT_MAP.has(r)))] : [],
    relations: Array.isArray(input.relations)
      ? [...new Set(input.relations.filter((r) => RELATION_MAP.has(r)))]
      : []
  };
}

function nodeText(node) {
  let text = nodeHaystackCache.get(node);
  if (text === undefined) {
    text = [
      node.id,
      node.label,
      NODE_TYPE_MAP.get(node.type)?.zh || node.type,
      STAGE_MAP.get(node.stage)?.zh || node.stage,
      node.tags?.join(' ') || '',
      propsText(node.props)
    ]
      .join(' ')
      .toLowerCase();
    nodeHaystackCache.set(node, text);
  }
  return text;
}

function edgeText(edge) {
  let text = edgeHaystackCache.get(edge);
  if (text === undefined) {
    text = [
      edge.id,
      edge.from,
      edge.to,
      edge.relation,
      RELATION_MAP.get(edge.relation)?.zh || '',
      STAGE_MAP.get(edge.stage)?.zh || '',
      propsText(edge.props)
    ]
      .join(' ')
      .toLowerCase();
    edgeHaystackCache.set(edge, text);
  }
  return text;
}

function eventText(event) {
  let text = eventHaystackCache.get(event);
  if (text === undefined) {
    text = [
      event.id,
      event.action,
      event.summary,
      event.detail || '',
      RESULT_MAP.get(event.result)?.zh || '',
      STAGE_MAP.get(event.stage)?.zh || ''
    ]
      .join(' ')
      .toLowerCase();
    eventHaystackCache.set(event, text);
  }
  return text;
}

function evidenceText(evidence) {
  let text = evidenceHaystackCache.get(evidence);
  if (text === undefined) {
    // 敏感证据的 summary 不参与搜索，避免通过搜索泄露内容
    const parts = [evidence.id, evidence.title, evidence.type];
    if (!evidence.sensitive) parts.push(evidence.summary || '');
    text = parts.join(' ').toLowerCase();
    evidenceHaystackCache.set(evidence, text);
  }
  return text;
}

function findingText(finding) {
  let text = findingHaystackCache.get(finding);
  if (text === undefined) {
    text = [finding.title, finding.label, finding.id, finding.cve, finding.category, finding.assetLabel]
      .join(' ')
      .toLowerCase();
    findingHaystackCache.set(finding, text);
  }
  return text;
}

function matchQuery(text, q) {
  return !q || text.includes(q);
}

function matchesNode(node, filters) {
  if (filters.stages.length && !filters.stages.includes(node.stage)) return false;
  if (filters.types.length && !filters.types.includes(node.type)) return false;
  if (filters.severities.length) {
    const isRisk = node.type === 'vulnerability' || node.type === 'finding';
    if (isRisk && !filters.severities.includes(inferSeverity(node))) return false;
  }
  return matchQuery(nodeText(node), filters.q);
}

function matchesEdge(edge, filters) {
  if (filters.stages.length && !filters.stages.includes(edge.stage)) return false;
  if (filters.relations.length && !filters.relations.includes(edge.relation)) return false;
  return matchQuery(edgeText(edge), filters.q);
}

function matchesEvent(event, filters) {
  if (filters.stages.length && !filters.stages.includes(event.stage)) return false;
  if (filters.results.length && !filters.results.includes(event.result)) return false;
  return matchQuery(eventText(event), filters.q);
}

function matchesEvidence(evidence, filters) {
  return matchQuery(evidenceText(evidence), filters.q);
}

/**
 * 对整条链路应用筛选。
 * @returns {{nodeIds:Set<string>, edgeIds:Set<string>, eventIds:Set<string>, evidenceIds:Set<string>, counts:object}}
 */
export function filterChain(chain, inputFilters = {}) {
  const filters = normalizeFilters(inputFilters);
  const nodeIds = new Set();
  for (const node of chain.nodes) if (matchesNode(node, filters)) nodeIds.add(node.id);

  const nodeMap = new Map(chain.nodes.map((n) => [n.id, n]));
  const edgeIds = new Set();
  for (const edge of chain.edges) {
    if (!matchesEdge(edge, filters)) continue;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    edgeIds.add(edge.id);
  }
  // 关系筛选激活时，只保留参与符合条件关系的节点
  if (filters.relations.length) {
    const connected = new Set();
    for (const edge of chain.edges) {
      if (!edgeIds.has(edge.id)) continue;
      connected.add(edge.from);
      connected.add(edge.to);
    }
    for (const id of [...nodeIds]) if (!connected.has(id)) nodeIds.delete(id);
  }

  const eventIds = new Set();
  for (const event of chain.events) {
    if (!matchesEvent(event, filters)) continue;
    if (filters.types.length && event.node_ids.length) {
      const intersects = event.node_ids.some((id) => nodeIds.has(id));
      if (!intersects) continue;
    }
    eventIds.add(event.id);
  }

  const evidenceIds = new Set();
  for (const evidence of chain.evidences) {
    if (!matchesEvidence(evidence, filters)) continue;
    if (filters.types.length && evidence.node_id && nodeMap.has(evidence.node_id)) {
      if (!nodeIds.has(evidence.node_id)) continue;
    }
    evidenceIds.add(evidence.id);
  }

  return {
    nodeIds,
    edgeIds,
    eventIds,
    evidenceIds,
    counts: {
      nodes: nodeIds.size,
      edges: edgeIds.size,
      events: eventIds.size,
      evidences: evidenceIds.size
    }
  };
}

/** 发现列表筛选（发现与证据视图） */
export function filterFindings(list, inputFilters = {}) {
  const filters = normalizeFilters(inputFilters);
  return list.filter((finding) => {
    if (filters.stages.length && !filters.stages.includes(finding.stage)) return false;
    if (filters.severities.length && !filters.severities.includes(finding.severity)) return false;
    return matchQuery(findingText(finding), filters.q);
  });
}

/** 证据列表筛选 */
export function filterEvidenceList(list, inputFilters = {}) {
  const filters = normalizeFilters(inputFilters);
  return list.filter((item) => matchQuery(evidenceText(item.evidence), filters.q));
}

/** 生成当前筛选条件的中文标签，便于工具栏展示 */
export function filterLabels(filters) {
  if (!filters) return [];
  const labels = [];
  if (filters.q) labels.push(`搜索：${filters.q}`);
  for (const id of filters.stages || []) labels.push(`阶段：${STAGE_MAP.get(id)?.zh || id}`);
  for (const id of filters.types || []) labels.push(`类型：${NODE_TYPE_MAP.get(id)?.zh || id}`);
  for (const id of filters.severities || []) labels.push(`严重度：${severityZh(id)}`);
  for (const id of filters.results || []) labels.push(`结果：${RESULT_MAP.get(id)?.zh || id}`);
  for (const id of filters.relations || []) labels.push(`关系：${RELATION_MAP.get(id)?.zh || id}`);
  return labels;
}
