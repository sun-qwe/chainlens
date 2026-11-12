/**
 * 回放状态（规格 5.5 节）：cursor = 已展示的事件数量（0..events.length）。
 * 纯模块，无 DOM 依赖，可被 node:test 测试。
 */
import { clamp } from './util.js';

/** 将任意输入夹取为合法 cursor；null 表示“全部展示” */
export function normalizeCursor(chain, cursor) {
  const total = chain.events.length;
  if (cursor === null || cursor === undefined || cursor === '') return null;
  const n = Number(cursor);
  if (!Number.isFinite(n)) return null;
  return clamp(Math.floor(n), 0, total);
}

/**
 * 计算某一 cursor 下可见的节点 / 关系集合。
 * 规则：
 *  - cursor 为 null 或等于事件总数：全部可见
 *  - 否则：节点在事件引用或自身时间戳已到达时可见；关系在引用或时间戳到达时可见，
 *    且两端节点必须可见（避免悬挂边）
 * @param {object} chain 归一化链路
 * @param {number|null} cursor
 */
export function visibleState(chain, cursor) {
  const events = chain.events;
  const total = events.length;
  const normalized = normalizeCursor(chain, cursor);
  const allNodes = () => new Set(chain.nodes.map((n) => n.id));
  const allEdges = () => new Set(chain.edges.map((e) => e.id));
  const empty = () => new Set();

  if (normalized === null || normalized >= total) {
    const currentEvent = total ? events[total - 1] : null;
    return {
      cursor: total,
      total,
      complete: true,
      currentEvent,
      currentIndex: total - 1,
      currentTs: currentEvent ? currentEvent.ts : null,
      currentTsMs: currentEvent ? currentEvent.tsMs : null,
      visibleNodes: allNodes(),
      visibleEdges: allEdges(),
      currentNodes: new Set(currentEvent?.node_ids || []),
      currentEdges: new Set(currentEvent?.edge_ids || []),
      revealedNodeIds: [],
      revealedEdgeIds: []
    };
  }

  const currentEvent = normalized > 0 ? events[normalized - 1] : null;
  const cutoff = currentEvent ? currentEvent.tsMs : -Infinity;
  const nodeIds = new Set();
  const edgeIds = new Set();
  const referencedNodes = new Set();
  const referencedEdges = new Set();

  for (let i = 0; i < normalized; i += 1) {
    const event = events[i];
    for (const id of event.node_ids || []) referencedNodes.add(id);
    for (const id of event.edge_ids || []) referencedEdges.add(id);
  }

  for (const node of chain.nodes) {
    if (referencedNodes.has(node.id) || node.tsMs <= cutoff) nodeIds.add(node.id);
  }
  for (const edge of chain.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    if (referencedEdges.has(edge.id) || edge.tsMs <= cutoff) edgeIds.add(edge.id);
  }

  // 当前事件新引入的对象（用于脉冲动画）
  const revealedNodeIds = currentEvent ? (currentEvent.node_ids || []).filter((id) => nodeIds.has(id)) : [];
  const revealedEdgeIds = currentEvent ? (currentEvent.edge_ids || []).filter((id) => edgeIds.has(id)) : [];

  return {
    cursor: normalized,
    total,
    complete: false,
    currentEvent,
    currentIndex: normalized - 1,
    currentTs: currentEvent ? currentEvent.ts : null,
    currentTsMs: currentEvent ? currentEvent.tsMs : null,
    visibleNodes: nodeIds.size ? nodeIds : empty(),
    visibleEdges: edgeIds.size ? edgeIds : empty(),
    currentNodes: new Set(currentEvent?.node_ids || []),
    currentEdges: new Set(currentEvent?.edge_ids || []),
    revealedNodeIds,
    revealedEdgeIds
  };
}

/** 回放进度（0–1） */
export function progressRatio(chain, cursor) {
  const total = chain.events.length;
  if (!total) return 0;
  const normalized = normalizeCursor(chain, cursor);
  return normalized === null ? 1 : normalized / total;
}

/** 事件游标步进 */
export function stepCursor(chain, cursor, delta) {
  const total = chain.events.length;
  const current = normalizeCursor(chain, cursor);
  const base = current === null ? total : current;
  return clamp(base + delta, 0, total);
}

/** 当前事件对象（cursor 指向已播放的最后一个事件） */
export function currentEvent(chain, cursor) {
  const normalized = normalizeCursor(chain, cursor);
  if (normalized === null || normalized <= 0) return null;
  return chain.events[Math.min(chain.events.length - 1, normalized - 1)] || null;
}

/** 回放快照（供 window.__chainlensState / 测试使用） */
export function snapshot(chain, cursor) {
  const state = visibleState(chain, cursor);
  return {
    cursor: state.cursor,
    total: state.total,
    complete: state.complete,
    currentEventId: state.currentEvent?.id || null,
    currentEventSummary: state.currentEvent?.summary || '',
    visibleNodes: state.visibleNodes.size,
    visibleEdges: state.visibleEdges.size
  };
}

export const replayApi = { normalizeCursor, visibleState, progressRatio, stepCursor, currentEvent, snapshot };
