/**
 * 链路指标与前端分析算法（规格 5.5 节）。
 * 纯模块，全部函数确定性、无 DOM 依赖，可直接在 node:test 中测试。
 */
import {
  NODE_TYPES,
  PLAYBACK_MAX_DELAY,
  PLAYBACK_MIN_DELAY,
  QUALITY_ERROR_PENALTY,
  QUALITY_WARNING_PENALTY,
  SEVERITIES,
  STAGES,
  STAGE_INDEX,
  TACTICS,
  TACTIC_MAP
} from './constants.js';
import { clamp, groupBy, maxBy, round, sum, uniq } from './util.js';
import { inferSeverity } from './format.js';

const indexCache = new WeakMap();
const derivedCache = new WeakMap();

/** 构建对象索引与邻接表 */
export function indexChain(chain) {
  const nodeMap = new Map();
  const edgeMap = new Map();
  const eventMap = new Map();
  const evidenceMap = new Map();
  const noteMap = new Map();
  const outgoing = new Map();
  const incoming = new Map();
  const evidenceByNode = new Map();
  const eventsByNode = new Map();

  for (const node of chain.nodes) {
    nodeMap.set(node.id, node);
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of chain.edges) {
    edgeMap.set(edge.id, edge);
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
  }
  for (const event of chain.events) eventMap.set(event.id, event);
  for (const evidence of chain.evidences) {
    evidenceMap.set(evidence.id, evidence);
    if (evidence.node_id) {
      if (!evidenceByNode.has(evidence.node_id)) evidenceByNode.set(evidence.node_id, []);
      evidenceByNode.get(evidence.node_id).push(evidence);
    }
  }
  for (const note of chain.notes) noteMap.set(note.id, note);
  for (const event of chain.events) {
    for (const id of event.node_ids || []) {
      if (!eventsByNode.has(id)) eventsByNode.set(id, []);
      eventsByNode.get(id).push(event);
    }
  }
  return { nodeMap, edgeMap, eventMap, evidenceMap, noteMap, outgoing, incoming, evidenceByNode, eventsByNode };
}

/** 获取索引（带 WeakMap 缓存） */
export function getIndex(chain) {
  let index = indexCache.get(chain);
  if (!index) {
    index = indexChain(chain);
    indexCache.set(chain, index);
  }
  return index;
}

/** 节点类型计数（返回全部 10 类，按数量降序） */
export function nodeTypeCounts(chain) {
  const counts = new Map(NODE_TYPES.map((t) => [t.id, 0]));
  for (const node of chain.nodes) counts.set(node.type, (counts.get(node.type) || 0) + 1);
  return NODE_TYPES.map((t, order) => ({
    id: t.id,
    zh: t.zh,
    color: t.color,
    icon: t.icon,
    order,
    count: counts.get(t.id) || 0
  })).sort((a, b) => b.count - a.count || a.order - b.order);
}

/** 阶段计数（节点 / 事件 / 关系） */
export function stageCounts(chain) {
  const nodes = new Map(STAGES.map((s) => [s.id, 0]));
  const events = new Map(STAGES.map((s) => [s.id, 0]));
  const edges = new Map(STAGES.map((s) => [s.id, 0]));
  for (const n of chain.nodes) nodes.set(n.stage, (nodes.get(n.stage) || 0) + 1);
  for (const e of chain.events) events.set(e.stage, (events.get(e.stage) || 0) + 1);
  for (const e of chain.edges) edges.set(e.stage, (edges.get(e.stage) || 0) + 1);
  return STAGES.map((s) => ({
    id: s.id,
    zh: s.zh,
    color: s.color,
    index: s.index,
    nodes: nodes.get(s.id) || 0,
    events: events.get(s.id) || 0,
    edges: edges.get(s.id) || 0
  }));
}

/** 严重度计数（vulnerability + finding） */
export function severityCounts(chain) {
  const counts = new Map(SEVERITIES.map((s) => [s.id, 0]));
  const targets = chain.nodes.filter((n) => n.type === 'vulnerability' || n.type === 'finding');
  for (const node of targets) counts.set(inferSeverity(node), (counts.get(inferSeverity(node)) || 0) + 1);
  return SEVERITIES.map((s) => ({ ...s, count: counts.get(s.id) || 0 }));
}

/** 事件总时长：最后事件 - 首事件 */
export function durationMs(chain) {
  const events = chain.events;
  if (events.length < 2) return 0;
  return Math.max(0, events[events.length - 1].tsMs - events[0].tsMs);
}

/** 阶段统计：节点/事件数、事件跨度、阶段推进时间 */
export function stageStats(chain) {
  const byStage = groupBy(chain.events, (e) => e.stage);
  const firstEventByStage = new Map();
  for (const stage of STAGES) {
    const events = (byStage.get(stage.id) || []).slice().sort((a, b) => a.tsMs - b.tsMs);
    if (events.length) firstEventByStage.set(stage.id, events[0].tsMs);
  }
  return STAGES.map((stage) => {
    const events = (byStage.get(stage.id) || []).slice().sort((a, b) => a.tsMs - b.tsMs);
    const nodes = chain.nodes.filter((n) => n.stage === stage.id).length;
    const firstTs = events.length ? events[0].tsMs : null;
    const lastTs = events.length ? events[events.length - 1].tsMs : null;
    const duration = firstTs !== null && lastTs !== null ? Math.max(0, lastTs - firstTs) : 0;
    let advanceMs = 0;
    if (firstTs !== null) {
      const next = STAGES.slice(stage.index + 1).find((s) => firstEventByStage.has(s.id));
      if (next) advanceMs = Math.max(0, firstEventByStage.get(next.id) - firstTs);
    }
    return {
      stage: stage.id,
      zh: stage.zh,
      color: stage.color,
      index: stage.index,
      nodes,
      events: events.length,
      firstTs,
      lastTs,
      durationMs: duration,
      advanceMs,
      reached: events.length > 0 || nodes > 0
    };
  });
}

/** 阶段推进时长映射（规格 stageDurationMs） */
export function stageDurationMs(chain) {
  return stageStats(chain).map((s) => ({ stage: s.stage, durationMs: s.durationMs }));
}

/** 最长静默间隔 */
export function longestSilence(chain) {
  const events = chain.events;
  let best = { gapMs: 0, from: null, to: null };
  for (let i = 1; i < events.length; i += 1) {
    const gap = events[i].tsMs - events[i - 1].tsMs;
    if (gap > best.gapMs) {
      best = { gapMs: gap, from: events[i - 1].ts, to: events[i].ts };
    }
  }
  return best;
}

/** 事件成功率（success /(success+failure+partial)） */
export function successRate(chain) {
  const events = chain.events;
  const success = events.filter((e) => e.result === 'success').length;
  const failure = events.filter((e) => e.result === 'failure').length;
  const partial = events.filter((e) => e.result === 'partial').length;
  const info = events.filter((e) => e.result === 'info').length;
  const considered = success + failure + partial;
  return {
    success,
    failure,
    partial,
    info,
    total: events.length,
    considered,
    ratio: considered ? success / considered : 0
  };
}

function compareNodeOrder(a, b) {
  const sa = STAGE_INDEX.get(a.stage) ?? 99;
  const sb = STAGE_INDEX.get(b.stage) ?? 99;
  if (sa !== sb) return sa - sb;
  if (a.tsMs !== b.tsMs) return a.tsMs - b.tsMs;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 关键路径：阶段约束的前向边 + 节点权重 (1 + risk) 的 DAG 最长路径。
 * 同阶段边按 (ts, id) 顺序视为前向；若无前向边则回退到最大风险节点。
 * @returns {{nodes:object[], edges:object[], score:number, stages:string[], fallback:boolean}}
 */
export function criticalPath(chain) {
  const index = getIndex(chain);
  const nodes = chain.nodes.slice().sort(compareNodeOrder);
  if (!nodes.length) return { nodes: [], edges: [], score: 0, stages: [], fallback: true };

  const best = new Map();
  const prev = new Map(); // toId -> { fromId, edgeId }
  const order = new Map(nodes.map((n, i) => [n.id, i]));

  for (const node of nodes) best.set(node.id, 1 + (Number(node.risk) || 0));

  for (const from of nodes) {
    const fromScore = best.get(from.id);
    for (const edge of index.outgoing.get(from.id) || []) {
      const to = index.nodeMap.get(edge.to);
      if (!to || compareNodeOrder(from, to) >= 0) continue; // 只允许前向边
      const candidate = fromScore + 1 + (Number(to.risk) || 0);
      if (candidate > (best.get(to.id) || 0) + 1e-9) {
        best.set(to.id, candidate);
        prev.set(to.id, { fromId: from.id, edgeId: edge.id });
      }
    }
  }

  let end = null;
  let top = -Infinity;
  for (const node of nodes) {
    const score = best.get(node.id);
    if (score > top) {
      top = score;
      end = node;
    }
  }

  const pathNodes = [];
  const pathEdges = [];
  let cursor = end;
  let guard = 0;
  while (cursor && guard <= nodes.length + 1) {
    pathNodes.push(cursor);
    const link = prev.get(cursor.id);
    if (!link) break;
    const edge = index.edgeMap.get(link.edgeId);
    if (edge) pathEdges.push(edge);
    cursor = index.nodeMap.get(link.fromId) || null;
    guard += 1;
  }
  pathNodes.reverse();
  pathEdges.reverse();

  const hasForwardEdge = pathEdges.length > 0;
  if (!hasForwardEdge) {
    const fallbackNode = maxBy(nodes, (n) => Number(n.risk) || 0) || nodes[0];
    return {
      nodes: [fallbackNode],
      edges: [],
      score: round(1 + (Number(fallbackNode.risk) || 0), 2),
      stages: [fallbackNode.stage],
      fallback: true
    };
  }

  return {
    nodes: pathNodes,
    edges: pathEdges,
    score: round(top, 2),
    stages: uniq(pathNodes.map((n) => n.stage)),
    fallback: false
  };
}

/** 关键路径上的节点 id 集合 */
export function criticalPathIds(chain) {
  return new Set(criticalPath(chain).nodes.map((n) => n.id));
}

/** 所有带 ATT&CK 映射的记录（事件/节点/关系） */
export function attackRecords(chain) {
  const out = [];
  for (const node of chain.nodes) {
    if (!node.attck) continue;
    out.push({
      kind: 'node',
      record: node,
      id: node.id,
      ts: node.ts,
      tsMs: node.tsMs,
      stage: node.stage,
      tactic: node.attck.tactic,
      technique: node.attck.technique,
      name: node.attck.name || '',
      title: node.label,
      risk: node.risk,
      result: null
    });
  }
  for (const edge of chain.edges) {
    if (!edge.attck) continue;
    out.push({
      kind: 'edge',
      record: edge,
      id: edge.id,
      ts: edge.ts,
      tsMs: edge.tsMs,
      stage: edge.stage,
      tactic: edge.attck.tactic,
      technique: edge.attck.technique,
      name: edge.attck.name || '',
      title: `${edge.from} → ${edge.to}`,
      risk: 0,
      result: null
    });
  }
  for (const event of chain.events) {
    if (!event.attck) continue;
    out.push({
      kind: 'event',
      record: event,
      id: event.id,
      ts: event.ts,
      tsMs: event.tsMs,
      stage: event.stage,
      tactic: event.attck.tactic,
      technique: event.attck.technique,
      name: event.attck.name || '',
      title: event.summary,
      risk: event.risk,
      result: event.result
    });
  }
  return out.sort((a, b) => a.tsMs - b.tsMs);
}

/** ATT&CK 覆盖：tactic → technique 去重计数 */
export function attackCoverage(chain) {
  const records = attackRecords(chain);
  const tacticMap = new Map();
  for (const tactic of TACTICS) {
    tacticMap.set(tactic.id, {
      id: tactic.id,
      zh: tactic.zh,
      en: tactic.en,
      recordCount: 0,
      eventCount: 0,
      techniques: new Map()
    });
  }
  for (const record of records) {
    let bucket = tacticMap.get(record.tactic);
    if (!bucket) {
      bucket = {
        id: record.tactic,
        zh: record.tactic,
        en: '',
        recordCount: 0,
        eventCount: 0,
        techniques: new Map()
      };
      tacticMap.set(record.tactic, bucket);
    }
    bucket.recordCount += 1;
    if (record.kind === 'event') bucket.eventCount += 1;
    let tech = bucket.techniques.get(record.technique);
    if (!tech) {
      tech = {
        id: record.technique,
        name: record.name || '',
        count: 0,
        eventCount: 0,
        nodeCount: 0,
        edgeCount: 0,
        records: []
      };
      bucket.techniques.set(record.technique, tech);
    }
    tech.count += 1;
    if (record.kind === 'event') tech.eventCount += 1;
    else if (record.kind === 'node') tech.nodeCount += 1;
    else tech.edgeCount += 1;
    tech.records.push(record);
  }
  const tactics = [...tacticMap.values()].map((t) => ({
    ...t,
    techniques: [...t.techniques.values()].sort((a, b) => b.eventCount - a.eventCount || b.count - a.count || a.id.localeCompare(b.id))
  }));
  const used = tactics.filter((t) => t.recordCount > 0);
  const techniqueIds = new Set();
  for (const t of used) for (const tech of t.techniques) techniqueIds.add(tech.id);
  return {
    tactics,
    usedTactics: used,
    tacticCount: used.length,
    totalTactics: TACTICS.length,
    techniqueCount: techniqueIds.size,
    recordCount: records.length,
    eventCount: records.filter((r) => r.kind === 'event').length,
    records
  };
}

/** 证据覆盖：有证据的 vulnerability/finding 占比 */
export function evidenceCoverage(chain) {
  const index = getIndex(chain);
  const targets = chain.nodes.filter((n) => n.type === 'vulnerability' || n.type === 'finding');
  const covered = new Set();
  for (const evidence of chain.evidences) {
    if (evidence.node_id && index.nodeMap.has(evidence.node_id)) {
      const node = index.nodeMap.get(evidence.node_id);
      if (node.type === 'vulnerability' || node.type === 'finding') covered.add(node.id);
    }
  }
  for (const edge of chain.edges) {
    if (edge.relation !== 'evidences') continue;
    const target = index.nodeMap.get(edge.to);
    if (target && (target.type === 'vulnerability' || target.type === 'finding')) covered.add(target.id);
  }
  return {
    total: targets.length,
    covered: covered.size,
    ratio: targets.length ? covered.size / targets.length : 0,
    missing: targets.filter((n) => !covered.has(n.id)).map((n) => n.id)
  };
}

/** 风险分：severity 权重 × confidence 求和 */
export function riskBreakdown(chain) {
  const bySeverity = new Map(SEVERITIES.map((s) => [s.id, { ...s, count: 0, score: 0 }]));
  let total = 0;
  for (const node of chain.nodes) {
    if (node.type !== 'vulnerability' && node.type !== 'finding') continue;
    const severity = inferSeverity(node);
    const weight = bySeverity.get(severity)?.weight ?? 0;
    const confidence = Number.isFinite(node.confidence) ? clamp(node.confidence, 0, 1) : 1;
    const score = weight * confidence;
    total += score;
    if (bySeverity.has(severity)) {
      bySeverity.get(severity).count += 1;
      bySeverity.get(severity).score += score;
    }
  }
  return {
    total: round(total, 1),
    bySeverity: [...bySeverity.values()].map((s) => ({ ...s, score: round(s.score, 1) }))
  };
}

/** 风险分（一位小数） */
export function riskScore(chain) {
  return riskBreakdown(chain).total;
}

/** 数据质量评分：max(0, 100 - 8*errors - 2*warnings) */
export function dataQuality(chain) {
  const errors = chain.errors?.length || 0;
  const warnings = chain.warnings?.length || 0;
  const score = Math.max(0, 100 - QUALITY_ERROR_PENALTY * errors - QUALITY_WARNING_PENALTY * warnings);
  let level = 'poor';
  let label = '较差';
  if (score >= 90) {
    level = 'excellent';
    label = '优秀';
  } else if (score >= 75) {
    level = 'good';
    label = '良好';
  } else if (score >= 55) {
    level = 'fair';
    label = '一般';
  }
  return { score, errors, warnings, level, label };
}

/** 时间密度桶（默认 10 分钟） */
export function timeBuckets(chain, bucketMs = 10 * 60 * 1000) {
  const events = chain.events;
  if (!events.length) return [];
  const first = events[0].tsMs;
  const last = events[events.length - 1].tsMs;
  let step = bucketMs;
  const span = Math.max(0, last - first);
  if (span / step > 120) step = Math.ceil(span / 120 / bucketMs) * bucketMs;
  const start = Math.floor(first / step) * step;
  const end = Math.floor(last / step) * step;
  const buckets = [];
  for (let t = start; t <= end; t += step) {
    buckets.push({ start: t, end: t + step, count: 0, riskSum: 0, success: 0, failure: 0 });
  }
  for (const event of events) {
    const idx = Math.floor((event.tsMs - start) / step);
    const bucket = buckets[idx];
    if (!bucket) continue;
    bucket.count += 1;
    bucket.riskSum += Number(event.risk) || 0;
    if (event.result === 'success') bucket.success += 1;
    if (event.result === 'failure') bucket.failure += 1;
  }
  return buckets;
}

/** Top 风险节点 */
export function topRiskNodes(chain, n = 5) {
  return chain.nodes
    .slice()
    .sort((a, b) => (b.risk || 0) - (a.risk || 0) || (b.confidence || 0) - (a.confidence || 0) || a.tsMs - b.tsMs)
    .slice(0, n);
}

/** 最近事件（倒序） */
export function recentEvents(chain, n = 8) {
  return chain.events
    .slice()
    .sort((a, b) => b.tsMs - a.tsMs)
    .slice(0, n);
}

/** 邻居 id 集合（图结构，双向、可多跳） */
export function neighborsOf(chain, nodeId, depth = 1) {
  const index = getIndex(chain);
  const found = new Set();
  let frontier = new Set([nodeId]);
  for (let d = 0; d < depth; d += 1) {
    const next = new Set();
    for (const id of frontier) {
      for (const edge of index.outgoing.get(id) || []) {
        if (!found.has(edge.to) && edge.to !== nodeId) {
          found.add(edge.to);
          next.add(edge.to);
        }
      }
      for (const edge of index.incoming.get(id) || []) {
        if (!found.has(edge.from) && edge.from !== nodeId) {
          found.add(edge.from);
          next.add(edge.from);
        }
      }
    }
    frontier = next;
    if (!frontier.size) break;
  }
  return found;
}

/** 节点资产标签（用于发现表 / 证据表）：按关系亲和度在 2–3 跳内寻找资产类节点 */
function assetLabelFor(chain, index, node) {
  const typePriority = { host: 4, webapp: 3, target: 2, service: 1 };
  const relationAffinity = {
    has_vuln: 4,
    runs_on: 3,
    exposes: 2,
    routes_to: 1,
    resolves_to: 1,
    accesses: 1,
    evidences: 1,
    belongs_to: 0,
    grants: 0,
    pivots_to: 0,
    exploits: 0
  };
  const maxDepth = node.type === 'finding' ? 2 : 3;
  const candidates = new Map();
  const seen = new Set([node.id]);
  let frontier = [{ id: node.id, dist: 0, firstRelation: null }];
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = [];
    for (const current of frontier) {
      const edges = [...(index.outgoing.get(current.id) || []), ...(index.incoming.get(current.id) || [])];
      for (const edge of edges) {
        const otherId = edge.from === current.id ? edge.to : edge.from;
        if (seen.has(otherId)) continue;
        seen.add(otherId);
        const other = index.nodeMap.get(otherId);
        if (!other) continue;
        const firstRelation = current.firstRelation || edge.relation;
        const dist = current.dist + 1;
        const priority = typePriority[other.type] || 0;
        if (priority) {
          const score = priority * 2 - dist * 3 + (relationAffinity[firstRelation] || 0);
          const previous = candidates.get(otherId);
          if (!previous || score > previous.score) {
            candidates.set(otherId, { node: other, score, dist });
          }
        }
        next.push({ id: otherId, dist, firstRelation });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  let best = null;
  for (const candidate of candidates.values()) {
    if (!best || candidate.score > best.score) best = candidate;
  }
  if (best) return { id: best.node.id, label: best.node.label };
  const propAsset = node.props?.asset || node.props?.ip || '';
  if (propAsset) return { id: null, label: String(propAsset) };
  const target = chain.nodes.find((item) => item.type === 'target');
  if (target) return { id: target.id, label: target.label };
  return { id: null, label: '—' };
}

/** 风险发现列表（vulnerability + finding） */
export function findings(chain) {
  const index = getIndex(chain);
  const out = [];
  for (const node of chain.nodes) {
    if (node.type !== 'vulnerability' && node.type !== 'finding') continue;
    const severity = inferSeverity(node);
    const evidenceCount =
      (index.evidenceByNode.get(node.id)?.length || 0) +
      (index.incoming.get(node.id) || []).filter((e) => e.relation === 'evidences').length;
    const asset = assetLabelFor(chain, index, node);
    const props = node.props || {};
    out.push({
      node,
      id: node.id,
      type: node.type,
      title: props.title || node.label,
      label: node.label,
      severity,
      cvss: Number.isFinite(Number(props.cvss)) ? Number(props.cvss) : null,
      cve: props.cve || '',
      category: props.category || '',
      status: props.status || (node.type === 'finding' ? 'open' : 'confirmed'),
      stage: node.stage,
      risk: node.risk,
      confidence: node.confidence,
      assetId: asset.id,
      assetLabel: asset.label,
      evidenceCount,
      recommendation: props.recommendation || '',
      impact: props.impact || '',
      description: props.description || '',
      ts: node.ts,
      tsMs: node.tsMs
    });
  }
  const rank = new Map(SEVERITIES.map((s) => [s.id, s.rank]));
  return out.sort(
    (a, b) =>
      (rank.get(b.severity) || 0) - (rank.get(a.severity) || 0) ||
      (b.risk || 0) - (a.risk || 0) ||
      a.tsMs - b.tsMs
  );
}

/** 证据列表（附带关联节点标签） */
export function evidenceList(chain) {
  const index = getIndex(chain);
  return chain.evidences.map((evidence) => {
    const node = evidence.node_id ? index.nodeMap.get(evidence.node_id) : null;
    return {
      evidence,
      id: evidence.id,
      type: evidence.type,
      title: evidence.title,
      summary: evidence.summary,
      sensitive: evidence.sensitive,
      hash: evidence.hash,
      path: evidence.path,
      nodeId: evidence.node_id || null,
      nodeLabel: node ? node.label : '',
      nodeType: node ? node.type : '',
      ts: evidence.ts,
      tsMs: evidence.tsMs
    };
  });
}

/** 回放节奏：按事件间隔归一化映射到 [350, 1400] ms，再除以播放速度 */
export function playbackPlan(chain, speed = 1) {
  const events = chain.events;
  if (!events.length) return [];
  const gaps = [];
  for (let i = 1; i < events.length; i += 1) gaps.push(Math.max(0, events[i].tsMs - events[i - 1].tsMs));
  const minGap = gaps.length ? Math.min(...gaps) : 0;
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  const safeSpeed = speed > 0 ? speed : 1;
  return events.map((event, i) => {
    let delay;
    if (i === 0) {
      delay = PLAYBACK_MIN_DELAY;
    } else if (maxGap <= minGap) {
      delay = (PLAYBACK_MIN_DELAY + PLAYBACK_MAX_DELAY) / 2;
    } else {
      const ratio = (gaps[i - 1] - minGap) / (maxGap - minGap);
      delay = PLAYBACK_MIN_DELAY + ratio * (PLAYBACK_MAX_DELAY - PLAYBACK_MIN_DELAY);
    }
    return {
      index: i,
      event,
      baseDelayMs: Math.round(delay),
      delayMs: Math.round(delay / safeSpeed)
    };
  });
}

/** KPI 汇总 */
export function kpis(chain) {
  const critical = criticalPath(chain);
  const quality = dataQuality(chain);
  const severities = severityCounts(chain);
  const riskNodes = chain.nodes.filter((n) => n.type === 'vulnerability' || n.type === 'finding');
  const stages = stageCounts(chain).filter((s) => s.nodes > 0 || s.events > 0).length;
  return {
    nodes: chain.nodes.length,
    edges: chain.edges.length,
    events: chain.events.length,
    evidences: chain.evidences.length,
    notes: chain.notes.length,
    riskNodes: riskNodes.length,
    severities,
    critical,
    quality,
    riskScore: riskBreakdown(chain).total,
    durationMs: durationMs(chain),
    stages,
    totalStages: STAGES.length,
    success: successRate(chain)
  };
}

/**
 * 派生数据（缓存；一次构建供所有视图复用）
 */
export function buildDerived(chain) {
  const index = getIndex(chain);
  const critical = criticalPath(chain);
  const severity = severityCounts(chain);
  const attack = attackCoverage(chain);
  const quality = dataQuality(chain);
  return {
    index,
    nodeMap: index.nodeMap,
    edgeMap: index.edgeMap,
    eventMap: index.eventMap,
    evidenceMap: index.evidenceMap,
    noteMap: index.noteMap,
    outgoing: index.outgoing,
    incoming: index.incoming,
    evidenceByNode: index.evidenceByNode,
    eventsByNode: index.eventsByNode,
    nodeTypeCounts: nodeTypeCounts(chain),
    stageCounts: stageCounts(chain),
    stageStats: stageStats(chain),
    severityCounts: severity,
    durationMs: durationMs(chain),
    longestSilence: longestSilence(chain),
    successRate: successRate(chain),
    criticalPath: critical,
    criticalNodeIds: new Set(critical.nodes.map((n) => n.id)),
    criticalEdgeIds: new Set(critical.edges.map((e) => e.id)),
    attack,
    evidenceCoverage: evidenceCoverage(chain),
    riskBreakdown: riskBreakdown(chain),
    riskScore: riskBreakdown(chain).total,
    quality,
    timeBuckets: timeBuckets(chain),
    topRiskNodes: topRiskNodes(chain, 5),
    recentEvents: recentEvents(chain, 8),
    kpis: kpis(chain),
    findings: findings(chain),
    evidenceList: evidenceList(chain),
    playback: playbackPlan(chain),
    neighbors: (id, depth = 1) => neighborsOf(chain, id, depth)
  };
}

/** 获取派生数据（带缓存） */
export function getDerived(chain) {
  let derived = derivedCache.get(chain);
  if (!derived) {
    derived = buildDerived(chain);
    derivedCache.set(chain, derived);
  }
  return derived;
}

/** 汇总统计（用于控制台自检 / bench） */
export function summarise(chain) {
  const k = kpis(chain);
  return {
    records: chain.stats?.acceptedRecords ?? chain.nodes.length + chain.edges.length + chain.events.length,
    nodes: k.nodes,
    edges: k.edges,
    events: k.events,
    evidences: k.evidences,
    findings: k.riskNodes,
    durationMs: k.durationMs,
    criticalPathScore: k.critical.score,
    criticalPathNodes: k.critical.nodes.length,
    stages: k.stages,
    attackTactics: attackCoverage(chain).tacticCount,
    attackTechniques: attackCoverage(chain).techniqueCount,
    quality: dataQuality(chain),
    riskScore: k.riskScore
  };
}

/** 供外部使用的函数集合（window.ChainLens.analytics） */
export const analyticsApi = {
  indexChain,
  nodeTypeCounts,
  stageCounts,
  severityCounts,
  durationMs,
  stageStats,
  stageDurationMs,
  longestSilence,
  successRate,
  criticalPath,
  criticalPathIds,
  attackRecords,
  attackCoverage,
  evidenceCoverage,
  riskBreakdown,
  riskScore,
  dataQuality,
  timeBuckets,
  topRiskNodes,
  recentEvents,
  neighborsOf,
  findings,
  evidenceList,
  playbackPlan,
  kpis,
  buildDerived,
  getDerived,
  summarise
};

export { TACTIC_MAP, groupBy, sum, uniq, round, clamp, PLAYBACK_MAX_DELAY, PLAYBACK_MIN_DELAY };
