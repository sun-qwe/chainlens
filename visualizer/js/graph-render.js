/**
 * 链路图 SVG 生成（字符串模板，便于性能与 bench 复用）。
 * 节点卡片、贝塞尔边、阶段列背景与箭头 marker 全部为自绘 SVG。
 */
import { DASHED_RELATIONS, NODE_TYPE_MAP, RELATION_MAP } from './constants.js';
import { esc } from './util.js';
import { relationZh, riskColor, stageZh } from './format.js';

export const GRAPH_CARD = { width: 150, height: 54 };
export const GRAPH_COLORS = {
  nodeFill: '#0d1626',
  nodeStroke: '#243454',
  label: '#e6edf7',
  sub: '#7d92b3',
  band: 'rgba(255,255,255,0.012)'
};

const round1 = (n) => Math.round(n * 10) / 10;

/** 按显示宽度截断标签（中文字符按 2 个宽度单位） */
export function fitLabel(text, maxUnits = 19) {
  let used = 0;
  let out = '';
  for (const ch of String(text ?? '')) {
    const width = /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
    if (used + width > maxUnits) return `${out}…`;
    used += width;
    out += ch;
  }
  return out;
}

/** 计算边路径与中点（card 左上角坐标） */
export function edgeGeometry(fromPos, toPos) {
  const W = GRAPH_CARD.width;
  const H = GRAPH_CARD.height;
  const a = { x: fromPos.x + W / 2, y: fromPos.y + H / 2 };
  const b = { x: toPos.x + W / 2, y: toPos.y + H / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let sx;
  let sy;
  let ex;
  let ey;
  let c1x;
  let c1y;
  let c2x;
  let c2y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const dir = dx >= 0 ? 1 : -1;
    sx = a.x + (dir * W) / 2;
    sy = a.y;
    ex = b.x - (dir * W) / 2;
    ey = b.y;
    const bend = Math.max(42, Math.min(160, Math.abs(ex - sx) * 0.42));
    c1x = sx + dir * bend;
    c1y = sy;
    c2x = ex - dir * bend;
    c2y = ey;
  } else {
    const dir = dy >= 0 ? 1 : -1;
    sx = a.x;
    sy = a.y + (dir * H) / 2;
    ex = b.x;
    ey = b.y - (dir * H) / 2;
    const bend = Math.max(34, Math.min(120, Math.abs(ey - sy) * 0.4));
    c1x = sx;
    c1y = sy + dir * bend;
    c2x = ex;
    c2y = ey - dir * bend;
  }
  return {
    d: `M${round1(sx)},${round1(sy)} C${round1(c1x)},${round1(c1y)} ${round1(c2x)},${round1(c2y)} ${round1(
      ex
    )},${round1(ey)}`,
    mid: { x: round1((sx + ex) / 2), y: round1((sy + ey) / 2) }
  };
}

/** 箭头 marker 定义（按关系着色 + 关键路径红色） */
export function buildGraphDefs() {
  const items = [...RELATION_MAP.values()]
    .map(
      (spec) =>
        `<marker id="arrow-${spec.id}" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${spec.color}"></path></marker>`
    )
    .join('');
  return `<defs>${items}<marker id="arrow-critical" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#ef4444"></path></marker></defs>`;
}

/** 节点 class 列表（markup 与增量更新共用） */
export function nodeClassList(node, viewState) {
  const classes = ['gnode', `nt-${node.type}`];
  const focusId = viewState.focusId;
  const neighborIds = viewState.neighborIds || new Set();
  const criticalIds = viewState.criticalNodeIds || new Set();
  const currentIds = viewState.currentNodes || new Set();
  const isCritical = Boolean(viewState.critical && criticalIds.has(node.id));
  if (isCritical) classes.push('is-critical');
  if (focusId && node.id === focusId) classes.push('is-focused');
  else if (focusId && neighborIds.has(node.id)) classes.push('is-neighbor');
  else if (focusId && !isCritical && !currentIds.has(node.id)) classes.push('is-dimmed');
  if (currentIds.has(node.id)) classes.push('is-current');
  if (viewState.replayNodes && !viewState.replayNodes.has(node.id)) classes.push('is-unrevealed');
  return classes.join(' ');
}

/** 边 class 列表 */
export function edgeClassList(edge, viewState) {
  const classes = ['edge-path', `rel-${edge.relation}`];
  const criticalIds = viewState.criticalEdgeIds || new Set();
  const currentIds = viewState.currentEdges || new Set();
  const focusId = viewState.focusId;
  const isCritical = Boolean(viewState.critical && criticalIds.has(edge.id));
  if (DASHED_RELATIONS.has(edge.relation)) classes.push('is-dashed');
  if (isCritical) classes.push('is-critical');
  if (currentIds.has(edge.id)) classes.push('is-current');
  if (focusId && !isCritical && !currentIds.has(edge.id)) {
    if (edge.from === focusId || edge.to === focusId) classes.push('is-highlight');
    else classes.push('is-dim');
  }
  if (viewState.replayEdges && !viewState.replayEdges.has(edge.id)) classes.push('is-hidden');
  return classes.join(' ');
}

/** 阶段列背景（每阶段可能包含多个子列） */
export function buildStageBands(columns, bounds) {
  if (!columns || !columns.length) return '';
  const height = Math.max(160, bounds.height || 0);
  const parts = columns
    .map((column, index) => {
      const bandX = column.x - 20;
      const bandWidth = column.width + 40;
      const isEven = index % 2 === 0;
      return `<g class="stage-band" data-stage="${esc(column.stage)}">
        <rect class="stage-band-rect" x="${round1(bandX)}" y="0" width="${round1(bandWidth)}" height="${round1(
        height
      )}" rx="14" ${isEven ? '' : 'opacity="0.62"'}></rect>
        <text class="stage-band-label" x="${round1(bandX + 10)}" y="26">${esc(column.zh)}</text>
        <text class="stage-band-count" x="${round1(bandX + bandWidth - 10)}" y="26" text-anchor="end">${column.count} 节点${
        column.subColumns > 1 ? ` · ${column.subColumns} 列` : ''
      }</text>
        <line class="stage-band-line" x1="${round1(bandX + 2)}" y1="52" x2="${round1(
        bandX + bandWidth - 2
      )}" y2="52"></line>
      </g>`;
    })
    .join('');
  return parts;
}

function nodeMarkup(node, pos, viewState) {
  const W = GRAPH_CARD.width;
  const H = GRAPH_CARD.height;
  const spec = NODE_TYPE_MAP.get(node.type) || { color: '#64748b', zh: node.type, icon: 'cube' };
  const risk = Number(node.risk) || 0;
  const riskW = Math.max(0, Math.min(1, risk / 10)) * (W - 22);
  const riskTone = riskColor(risk);
  const label = fitLabel(node.label, 17);
  const meta = `${spec.zh} · ${stageZh(node.stage)}`;
  const title = `${node.label}（${spec.zh} / ${stageZh(node.stage)}）风险 ${risk.toFixed(1)}`;
  const classes = `${nodeClassList(node, viewState)}${viewState.pulseIds?.has(node.id) ? ' is-pulse' : ''}`;
  return `<g class="${classes}" data-node-id="${esc(node.id)}" data-node-type="${esc(
    node.type
  )}" transform="translate(${round1(pos.x)},${round1(pos.y)})" tabindex="0" role="button" aria-label="${esc(
    title
  )}" style="--nt-color:${spec.color};--risk-color:${riskTone}">
    <circle class="node-halo" cx="${W / 2}" cy="${H / 2}" r="${W / 2 + 10}"></circle>
    <rect class="node-card" x="0" y="0" width="${W}" height="${H}" rx="10"></rect>
    <rect class="node-accent" x="0" y="10" width="2.6" height="${H - 20}" rx="1.3"></rect>
    <g class="node-icon" transform="translate(10,9)"><use href="#i-${spec.icon}" width="16" height="16"></use></g>
    <text class="node-label" x="32" y="22">${esc(label)}</text>
    <text class="node-type-text" x="32" y="37">${esc(meta)}</text>
    <rect class="node-risk-bg" x="11" y="${H - 9}" width="${W - 22}" height="3" rx="1.5"></rect>
    <rect class="node-risk-fill" x="11" y="${H - 9}" width="${round1(riskW)}" height="3" rx="1.5"></rect>
    <title>${esc(title)}</title>
  </g>`;
}

/**
 * 生成完整 SVG 内部标记。
 * @param {object} chain 归一化链路
 * @param {object} model {positions,bounds,columns,nodeIds,edgeIds,viewState,showBands,showEdgeLabels}
 */
export function buildGraphMarkup(chain, model) {
  const { positions, bounds, columns, nodeIds, edgeIds, viewState, showBands = true, showEdgeLabels = true } = model;
  const edgeParts = [];
  for (const edge of chain.edges) {
    if (!edgeIds.has(edge.id)) continue;
    const fromPos = positions[edge.from];
    const toPos = positions[edge.to];
    if (!fromPos || !toPos) continue;
    const geometry = edgeGeometry(fromPos, toPos);
    const classes = edgeClassList(edge, viewState);
    const marker =
      viewState.critical && viewState.criticalEdgeIds?.has(edge.id) ? 'arrow-critical' : `arrow-${edge.relation}`;
    const relZh = relationZh(edge.relation);
    const title = `${relZh}（${edge.from} → ${edge.to}）`;
    edgeParts.push(
      `<g class="edge-group" data-edge-id="${esc(edge.id)}" data-relation="${esc(edge.relation)}" data-from="${esc(
        edge.from
      )}" data-to="${esc(edge.to)}"><path class="${classes}" d="${geometry.d}" marker-end="url(#${marker})"><title>${esc(
        title
      )}</title></path>${
        showEdgeLabels
          ? `<text class="edge-label" x="${geometry.mid.x}" y="${geometry.mid.y}">${esc(relZh)}</text>`
          : ''
      }</g>`
    );
  }

  const nodeParts = [];
  for (const node of chain.nodes) {
    if (!nodeIds.has(node.id)) continue;
    const pos = positions[node.id];
    if (!pos) continue;
    nodeParts.push(nodeMarkup(node, pos, viewState));
  }

  const bandMarkup = showBands ? buildStageBands(columns, bounds) : '';
  const width = Math.max(600, bounds.width || 0);
  const height = Math.max(360, bounds.height || 0);
  return `<g class="graph-viewport" transform="translate(0,0) scale(1)" style="--graph-w:${width};--graph-h:${height}">
    ${buildGraphDefs()}
    <g class="stage-layer">${bandMarkup}</g>
    <g class="edge-layer">${edgeParts.join('')}</g>
    <g class="node-layer">${nodeParts.join('')}</g>
  </g>`;
}
