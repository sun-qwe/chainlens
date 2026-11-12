/**
 * 自研布局算法（规格 5.5 节）：
 *  - layoutLayered：阶段约束分层 + 重心法排序（≥4 轮）+ 同层轻量一维力松弛；
 *    当单阶段节点过多时，在阶段列内部按“子列”换行，保持 7 阶段语义同时控制画布纵横比。
 *  - layoutForce：确定性 Fruchterman-Reingold（300 次迭代，种子 PRNG，无 Math.random）。
 * 两个算法都无 DOM 依赖，可被单元测试直接调用；输出位置均为节点卡片左上角坐标。
 */
import { STAGES, STAGE_INDEX } from './constants.js';
import { clamp, mulberry32, round } from './util.js';

export const LAYOUT_METRICS = {
  nodeWidth: 150,
  nodeHeight: 54,
  colWidth: 172,
  colGap: 46,
  rowGap: 66,
  paddingX: 84,
  paddingY: 66
};

const FORCE_ITERATIONS = 300;

function stageIndex(node) {
  return STAGE_INDEX.get(node.stage) ?? 0;
}

function sortNodes(nodes) {
  return nodes.slice().sort((a, b) => {
    const sa = stageIndex(a);
    const sb = stageIndex(b);
    if (sa !== sb) return sa - sb;
    if ((a.tsMs || 0) !== (b.tsMs || 0)) return (a.tsMs || 0) - (b.tsMs || 0);
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function adjacency(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id));
  const incoming = new Map(nodes.map((n) => [n.id, []]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    outgoing.get(edge.from).push(edge.to);
    incoming.get(edge.to).push(edge.from);
  }
  return { incoming, outgoing };
}

/** 阶段内换行：按顺序切成若干子列，返回每列节点与行数 */
function wrapStage(ids, subColumns, rowGap) {
  const rowsPerColumn = Math.ceil(ids.length / Math.max(1, subColumns));
  const subLists = Array.from({ length: Math.max(1, subColumns) }, () => []);
  const rows = new Map();
  ids.forEach((id, index) => {
    const sub = Math.min(subColumns - 1, Math.floor(index / rowsPerColumn));
    subLists[sub].push(id);
    rows.set(id, { sub, row: subLists[sub].length - 1 });
  });
  const maxRows = Math.max(1, ...subLists.map((list) => list.length));
  return { subLists, rows, maxRows, rowsPerColumn };
}

/** 宽度=0 的 stage 子列数量估计：用节点总量决定最大行数，控制纵横比 */
function chooseMaxRows(nodeCount) {
  return clamp(Math.round(Math.sqrt(nodeCount * 4)), 12, 24);
}

/**
 * 分层布局。
 * @param {object[]} nodes 归一化节点
 * @param {object[]} edges 归一化关系
 * @param {{barycenterRounds?:number, relaxIterations?:number, maxRows?:number, metrics?:object}} [opts]
 */
export function layoutLayered(nodes, edges, opts = {}) {
  const metrics = { ...LAYOUT_METRICS, ...(opts.metrics || {}) };
  const barycenterRounds = Math.max(4, opts.barycenterRounds ?? 4);
  const relaxIterations = Math.max(0, opts.relaxIterations ?? 18);
  const sorted = sortNodes(nodes);
  if (!sorted.length) {
    return { positions: {}, width: 0, height: 0, columns: [], mode: 'layered', meta: { nodeCount: 0 } };
  }

  const maxCol = Math.max(...STAGES.map((s) => s.index));
  const groups = Array.from({ length: maxCol + 1 }, () => []);
  for (const node of sorted) {
    groups[Math.min(maxCol, Math.max(0, stageIndex(node)))].push(node.id);
  }

  const maxRows = Math.max(8, opts.maxRows ?? chooseMaxRows(sorted.length));
  const subColumnCounts = groups.map((ids) => Math.max(1, Math.ceil(ids.length / maxRows)));
  const stageWidths = subColumnCounts.map((count) => (count - 1) * metrics.colWidth + metrics.nodeWidth);
  const stageStart = [];
  let cursor = metrics.paddingX;
  for (let i = 0; i <= maxCol; i += 1) {
    stageStart[i] = cursor;
    cursor += stageWidths[i] + metrics.colGap;
  }
  const totalWidth = cursor - metrics.colGap + metrics.paddingX;

  const nodeMap = new Map(sorted.map((n) => [n.id, n]));
  const { incoming, outgoing } = adjacency(sorted, edges);

  // ---------- 重心法排序（≥4 轮，前进/后退交替） ----------
  let wraps = groups.map((ids, col) => wrapStage(ids, subColumnCounts[col], metrics.rowGap));
  const yOf = new Map();
  function recomputeY() {
    for (let col = 0; col <= maxCol; col += 1) {
      const wrap = wraps[col];
      for (const id of groups[col]) {
        const info = wrap.rows.get(id) || { sub: 0, row: 0 };
        yOf.set(id, info.row * metrics.rowGap);
      }
    }
  }
  recomputeY();

  for (let roundIndex = 0; roundIndex < barycenterRounds; roundIndex += 1) {
    const forward = roundIndex % 2 === 0;
    const order = forward ? [...Array(maxCol + 1).keys()] : [...Array(maxCol + 1).keys()].reverse();
    for (const col of order) {
      const ids = groups[col];
      if (ids.length < 2) continue;
      const neighborKey = forward ? incoming : outgoing;
      const targets = new Map();
      for (const id of ids) {
        const neighbors = neighborKey.get(id) || [];
        if (!neighbors.length) continue;
        let total = 0;
        for (const neighborId of neighbors) total += yOf.get(neighborId) ?? 0;
        targets.set(id, total / neighbors.length);
      }
      if (!targets.size) continue;
      const indexed = ids.map((id, index) => ({ id, index, target: targets.get(id) }));
      indexed.sort((a, b) => {
        if (a.target === undefined && b.target === undefined) return a.index - b.index;
        if (a.target === undefined) return 1;
        if (b.target === undefined) return -1;
        if (Math.abs(a.target - b.target) > 0.5) return a.target - b.target;
        return a.index - b.index;
      });
      groups[col] = indexed.map((item) => item.id);
      wraps[col] = wrapStage(groups[col], subColumnCounts[col], metrics.rowGap);
      recomputeY();
    }
  }

  // ---------- 同层一维轻量力松弛 ----------
  const yValues = new Map();
  for (let col = 0; col <= maxCol; col += 1) {
    const wrap = wraps[col];
    for (const [subIndex, list] of wrap.subLists.entries()) {
      const offset = metrics.paddingY + ((wrap.maxRows - list.length) * metrics.rowGap) / 2;
      list.forEach((id, row) => yValues.set(id, offset + row * metrics.rowGap));
    }
    void col;
  }
  const anchor = new Map(yValues);
  const allNeighbors = new Map();
  for (const node of sorted) {
    const set = new Set([...(incoming.get(node.id) || []), ...(outgoing.get(node.id) || [])]);
    allNeighbors.set(node.id, [...set]);
  }
  const yOfCurrent = (id) => yValues.get(id) ?? metrics.paddingY;

  for (let iter = 0; iter < relaxIterations; iter += 1) {
    const next = new Map(yValues);
    for (let col = 0; col <= maxCol; col += 1) {
      const wrap = wraps[col];
      for (const list of wrap.subLists) {
        for (const id of list) {
          const neighbors = allNeighbors.get(id) || [];
          let desired = anchor.get(id);
          if (neighbors.length) {
            let total = 0;
            for (const neighborId of neighbors) total += yOfCurrent(neighborId);
            desired = total / neighbors.length;
          }
          const y = yOfCurrent(id);
          next.set(id, y + (desired - y) * 0.22 + (anchor.get(id) - y) * 0.06);
        }
        // 去漂移：把整列的净位移归零，避免弹簧力导致列持续下移
        let drift = 0;
        for (const id of list) drift += next.get(id) - anchor.get(id);
        drift /= Math.max(1, list.length);
        for (const id of list) next.set(id, next.get(id) - drift);
        // 保持列内顺序与最小间距
        for (let i = 1; i < list.length; i += 1) {
          const prev = next.get(list[i - 1]);
          if (next.get(list[i]) < prev + metrics.rowGap) next.set(list[i], prev + metrics.rowGap);
        }
        for (let i = list.length - 2; i >= 0; i -= 1) {
          const after = next.get(list[i + 1]);
          if (next.get(list[i]) > after - metrics.rowGap) next.set(list[i], after - metrics.rowGap);
        }
      }
    }
    for (const id of next.keys()) {
      if (next.get(id) < metrics.paddingY) next.set(id, metrics.paddingY);
    }
    for (const [id, y] of next) yValues.set(id, y);
  }

  // ---------- 归一化到画布坐标 ----------
  const stageMetrics = [];
  let globalHeight = 0;
  for (let col = 0; col <= maxCol; col += 1) {
    const ids = groups[col];
    const minY = Math.min(...ids.map((id) => yOfCurrent(id)));
    const maxY = Math.max(...ids.map((id) => yOfCurrent(id)));
    stageMetrics[col] = { minY, height: Math.max(0, maxY - minY) };
    globalHeight = Math.max(globalHeight, stageMetrics[col].height);
  }

  const positions = {};
  for (let col = 0; col <= maxCol; col += 1) {
    const wrap = wraps[col];
    const stage = stageMetrics[col];
    const verticalCenter = (globalHeight - stage.height) / 2;
    for (const [subIndex, list] of wrap.subLists.entries()) {
      list.forEach((id, row) => {
        const x = stageStart[col] + subIndex * metrics.colWidth;
        const y = yOfCurrent(id) - stage.minY + metrics.paddingY + verticalCenter;
        positions[id] = {
          x: round(x, 1),
          y: round(y, 1),
          order: groups[col].indexOf(id),
          column: col,
          sub: subIndex,
          row
        };
      });
    }
  }

  const width = totalWidth;
  const height = metrics.paddingY * 2 + globalHeight + metrics.nodeHeight;
  const columns = STAGES.slice(0, maxCol + 1).map((stage, index) => ({
    stage: stage.id,
    zh: stage.zh,
    index,
    x: stageStart[index],
    width: stageWidths[index],
    count: groups[index].length,
    subColumns: subColumnCounts[index],
    rows: wraps[index]?.maxRows || 0,
    nodes: groups[index]
  }));

  return {
    positions,
    width: round(width, 1),
    height: round(height, 1),
    columns,
    mode: 'layered',
    meta: {
      barycenterRounds,
      relaxIterations,
      maxRows,
      nodeCount: sorted.length,
      edgeCount: edges.length,
      nodeMapSize: nodeMap.size
    }
  };
}

/**
 * 力导向布局（Fruchterman-Reingold，300 次迭代，确定性）。
 * 初始位置来自分层布局，保证同样输入输出完全一致。
 */
export function layoutForce(nodes, edges, opts = {}) {
  const metrics = { ...LAYOUT_METRICS, ...(opts.metrics || {}) };
  const iterations = Math.max(1, opts.iterations ?? FORCE_ITERATIONS);
  if (!nodes.length) return { positions: {}, width: 0, height: 0, columns: [], mode: 'force' };

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const seed = mulberry32(opts.seed || 'chainlens-force');
  const base = layoutLayered(nodes, edges, { metrics, relaxIterations: 0, barycenterRounds: 4 });
  const padding = metrics.paddingX;
  const width = Math.max(640, base.width);
  const height = Math.max(480, base.height);
  const area = width * height;
  const k = Math.sqrt(area / Math.max(1, nodes.length)) * 0.72;

  const pos = new Map();
  for (const node of nodes) {
    const p = base.positions[node.id] || { x: padding, y: padding };
    pos.set(node.id, {
      x: p.x + metrics.nodeWidth / 2 + (seed() - 0.5) * 0.5,
      y: p.y + metrics.nodeHeight / 2 + (seed() - 0.5) * 0.5
    });
  }

  const edgePairs = [];
  for (const edge of edges) {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to) || edge.from === edge.to) continue;
    edgePairs.push([edge.from, edge.to]);
  }

  const ids = nodes.map((n) => n.id);
  const dispX = new Map(ids.map((id) => [id, 0]));
  const dispY = new Map(ids.map((id) => [id, 0]));

  for (let iter = 0; iter < iterations; iter += 1) {
    for (const id of ids) {
      dispX.set(id, 0);
      dispY.set(id, 0);
    }
    for (let i = 0; i < ids.length; i += 1) {
      const a = pos.get(ids[i]);
      for (let j = i + 1; j < ids.length; j += 1) {
        const b = pos.get(ids[j]);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.01) {
          dx = seed() - 0.5;
          dy = seed() - 0.5;
          dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        }
        const force = (k * k) / dist;
        const ux = dx / dist;
        const uy = dy / dist;
        dispX.set(ids[i], dispX.get(ids[i]) + ux * force);
        dispY.set(ids[i], dispY.get(ids[i]) + uy * force);
        dispX.set(ids[j], dispX.get(ids[j]) - ux * force);
        dispY.set(ids[j], dispY.get(ids[j]) - uy * force);
      }
    }
    for (const [from, to] of edgePairs) {
      const a = pos.get(from);
      const b = pos.get(to);
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      const ux = dx / dist;
      const uy = dy / dist;
      dispX.set(from, dispX.get(from) - ux * force);
      dispY.set(from, dispY.get(from) - uy * force);
      dispX.set(to, dispX.get(to) + ux * force);
      dispY.set(to, dispY.get(to) + uy * force);
    }
    const temperature = Math.max(0.5, (width / 8) * (1 - iter / iterations));
    for (const id of ids) {
      const dx = dispX.get(id);
      const dy = dispY.get(id);
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const limited = Math.min(len, temperature);
      const p = pos.get(id);
      p.x += (dx / len) * limited;
      p.y += (dy / len) * limited;
      p.x = Math.max(padding, Math.min(width - padding, p.x));
      p.y = Math.max(padding, Math.min(height - padding, p.y));
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const shiftX = padding - minX + metrics.nodeWidth / 2;
  const shiftY = padding - minY + metrics.nodeHeight / 2;
  const positions = {};
  for (const id of ids) {
    const p = pos.get(id);
    positions[id] = {
      x: round(p.x + shiftX - metrics.nodeWidth / 2, 1),
      y: round(p.y + shiftY - metrics.nodeHeight / 2, 1),
      order: 0,
      column: stageIndex(nodeMap.get(id))
    };
  }
  const spanX = maxX - minX + metrics.nodeWidth + padding * 2;
  const spanY = maxY - minY + metrics.nodeHeight + padding * 2;
  return {
    positions,
    width: round(Math.max(spanX, 640), 1),
    height: round(Math.max(spanY, 480), 1),
    columns: [],
    mode: 'force',
    meta: { iterations, k: round(k, 2), nodeCount: nodes.length, edgeCount: edgePairs.length }
  };
}

/** 按模式分发布局 */
export function layoutGraph(mode, nodes, edges, opts = {}) {
  return mode === 'force' ? layoutForce(nodes, edges, opts) : layoutLayered(nodes, edges, opts);
}

export const layoutApi = {
  LAYOUT_METRICS,
  layoutLayered,
  layoutForce,
  layoutGraph
};
