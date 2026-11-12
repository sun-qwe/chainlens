/**
 * 链路图视图：自研分层 / 力导向布局、缩放平移、节点拖拽、邻居聚焦、
 * 关键路径高亮、筛选重排、回放渐进显示与详情抽屉联动。
 */
import { NODE_TYPE_MAP } from '../constants.js';
import { filterChain, hasActiveFilters } from '../filtering.js';
import { layoutGraph, layoutLayered } from '../layout.js';
import { visibleState } from '../replay.js';
import {
  buildGraphMarkup,
  edgeClassList,
  edgeGeometry,
  fitLabel,
  nodeClassList
} from '../graph-render.js';
import { icon } from '../icons.js';
import { esc, clamp } from '../util.js';
import { fmtPct, relationZh, riskColor, stageZh, typeZh } from '../format.js';
import { showTooltip, moveTooltip, hideTooltip } from '../components/tooltip.js';

const EMPTY_VIEW_STATE = () => ({
  critical: false,
  criticalNodeIds: new Set(),
  criticalEdgeIds: new Set(),
  focusId: null,
  neighborIds: new Set(),
  replayNodes: null,
  replayEdges: null,
  currentNodes: new Set(),
  currentEdges: new Set(),
  currentEvent: null,
  pulseIds: new Set()
});

/** 深链 focus 指向的节点可能不在筛选结果里：把它与相关边补回可见集合，保证“聚焦”可复现 */
function ensureFocusVisible(ctx, filtered) {
  const focus = ctx.state.focus;
  if (!focus || !ctx.derived.nodeMap.has(focus)) return filtered;
  if (!filtered.nodeIds.has(focus)) filtered.nodeIds.add(focus);
  for (const edge of ctx.chain.edges) {
    if (edge.from !== focus && edge.to !== focus) continue;
    const otherId = edge.from === focus ? edge.to : edge.from;
    if (filtered.nodeIds.has(otherId)) filtered.edgeIds.add(edge.id);
  }
  return filtered;
}

/** 仅计算筛选 / 回放可见状态（不重排布局，供增量更新使用） */
function computeStateSnapshot(ctx, local) {
  const chain = ctx.chain;
  const filtered = ensureFocusVisible(ctx, filterChain(chain, ctx.state.filters));
  const replay = visibleState(chain, ctx.state.cursor);
  const focusId =
    ctx.state.focus && filtered.nodeIds.has(ctx.state.focus) && ctx.derived.nodeMap.has(ctx.state.focus)
      ? ctx.state.focus
      : null;
  const neighborIds = focusId ? ctx.derived.neighbors(focusId, 1) : new Set();
  const replayOn = !replay.complete;
  return {
    filtered,
    replay,
    viewState: {
      critical: Boolean(ctx.state.critical),
      criticalNodeIds: ctx.derived.criticalNodeIds,
      criticalEdgeIds: ctx.derived.criticalEdgeIds,
      focusId,
      neighborIds,
      replayNodes: replayOn ? replay.visibleNodes : null,
      replayEdges: replayOn ? replay.visibleEdges : null,
      currentNodes: new Set(replay.currentEvent?.node_ids || []),
      currentEdges: new Set(replay.currentEvent?.edge_ids || []),
      currentEvent: replay.currentEvent,
      pulseIds: new Set()
    }
  };
}

/** 计算布局所需的子集与可见状态 */
function computeModel(ctx, local) {
  const chain = ctx.chain;
  const filtered = ensureFocusVisible(ctx, filterChain(chain, ctx.state.filters));
  const nodes = chain.nodes.filter((node) => filtered.nodeIds.has(node.id));
  const edges = chain.edges.filter((edge) => filtered.edgeIds.has(edge.id));
  const layout = layoutGraph(local.mode, nodes, edges);
  for (const [id, pos] of local.fixes) {
    if (layout.positions[id]) layout.positions[id] = { ...layout.positions[id], x: pos.x, y: pos.y };
    else local.fixes.delete(id);
  }
  const replay = visibleState(chain, ctx.state.cursor);
  const focusId =
    ctx.state.focus && filtered.nodeIds.has(ctx.state.focus) && ctx.derived.nodeMap.has(ctx.state.focus)
      ? ctx.state.focus
      : null;
  const neighborIds = focusId ? ctx.derived.neighbors(focusId, 1) : new Set();
  const replayOn = !replay.complete;
  const viewState = {
    critical: Boolean(ctx.state.critical),
    criticalNodeIds: ctx.derived.criticalNodeIds,
    criticalEdgeIds: ctx.derived.criticalEdgeIds,
    focusId,
    neighborIds,
    replayNodes: replayOn ? replay.visibleNodes : null,
    replayEdges: replayOn ? replay.visibleEdges : null,
    currentNodes: new Set(replay.currentEvent?.node_ids || []),
    currentEdges: new Set(replay.currentEvent?.edge_ids || []),
    currentEvent: replay.currentEvent,
    pulseIds: new Set()
  };
  return { filtered, nodes, edges, layout, replay, viewState, focusId };
}

/** 生成链路图视图（挂载 / 更新 / 销毁） */
export function createGraphView(ctx) {
  const local = {
    mode: 'layered',
    zoom: 1,
    pan: { x: 0, y: 0 },
    fixes: new Map(),
    positions: {},
    layout: null,
    filtered: { nodeIds: new Set(), edgeIds: new Set() },
    replay: null,
    viewState: null,
    signature: '',
    nodeEls: new Map(),
    edgeEls: new Map(),
    drag: null,
    panning: null,
    pulseTimer: null,
    viewSyncTimer: null,
    viewSignature: '',
    lastCursorEventId: null,
    fitted: false,
    root: null,
    canvas: null,
    svg: null,
    emptyEl: null,
    statEl: null,
    viewportEl: null,
    toolbarEl: null,
    subEl: null,
    observer: null,
    lastCanvasWidth: 0,
    chain: null
  };

  const nodesVisible = () => {
    const total = local.filtered.nodeIds.size;
    if (!local.replay) return total;
    if (local.replay.complete) return total;
    let count = 0;
    for (const id of local.filtered.nodeIds) if (local.replay.visibleNodes.has(id)) count += 1;
    return count;
  };

  const edgesVisible = () => {
    const total = local.filtered.edgeIds.size;
    if (!local.replay) return total;
    if (local.replay.complete) return total;
    let count = 0;
    for (const id of local.filtered.edgeIds) if (local.replay.visibleEdges.has(id)) count += 1;
    return count;
  };

  function template() {
    return `<div class="view view--graph">
      <div class="view-header view-header--compact">
        <div>
          <div class="view-title">${icon('layers')}链路图</div>
          <div class="view-sub" data-role="sub">阶段约束分层 · 重心排序 · 轻量力松弛</div>
        </div>
        <div class="view-actions">
          <button class="btn btn-sm" type="button" data-graph-action="clear-filters" data-role="clear-filters" hidden>${icon(
            'filter'
          )}清除筛选</button>
        </div>
      </div>
      <div class="graph-toolbar" data-role="toolbar">
        <div class="toolbar-group" role="group" aria-label="布局模式">
          <button class="btn is-active" type="button" data-graph-action="mode-layered" title="分层视图（阶段约束）">${icon(
            'layers'
          )}<span>分层</span></button>
          <button class="btn" type="button" data-graph-action="mode-force" title="力导向视图（Fruchterman-Reingold）">${icon(
            'force'
          )}<span>力导向</span></button>
        </div>
        <div class="toolbar-group" role="group" aria-label="缩放">
          <button class="btn btn-icon" type="button" data-graph-action="zoom-out" aria-label="缩小">${icon('minus')}</button>
          <button class="btn btn-icon" type="button" data-graph-action="zoom-in" aria-label="放大">${icon('plus')}</button>
          <button class="btn" type="button" data-graph-action="fit" title="适配屏幕（F）">${icon('fit')}<span>适配</span></button>
          <button class="btn btn-icon" type="button" data-graph-action="reset" aria-label="重置视图" title="重置视图">${icon(
            'reset'
          )}</button>
        </div>
        <button class="btn" type="button" data-graph-action="toggle-critical" data-role="critical" title="关键路径高亮（C）">${icon(
          'critical'
        )}<span>关键路径</span></button>
        <div class="toolbar-spacer"></div>
        <div class="graph-stat" data-role="stat">—</div>
      </div>
      <div class="graph-canvas" data-role="canvas">
        <svg class="graph-svg" data-role="svg" role="img" aria-label="探索链路图"></svg>
        <div class="graph-legend">
          <span><i style="--c:#ef4444"></i>关键路径</span>
          <span><i style="--c:#fbbf24"></i>授权/凭据</span>
          <span><i style="--c:#22d3ee"></i>暴露/运行</span>
          <span><i class="dash" style="--c:#94a3b8"></i>佐证/归属</span>
          <span>滚轮缩放 · 拖拽平移 · 节点可拖动（双击释放）</span>
        </div>
        <div class="graph-empty" data-role="empty" hidden></div>
      </div>
    </div>`;
  }

  function localPoint(event) {
    const rect = local.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function applyTransform() {
    if (!local.viewportEl) return;
    local.viewportEl.setAttribute(
      'transform',
      `translate(${local.pan.x.toFixed(2)},${local.pan.y.toFixed(2)}) scale(${local.zoom.toFixed(4)})`
    );
  }

  function updateStat() {
    if (!local.statEl) return;
    const chain = ctx.chain;
    const totalNodes = chain.nodes.length;
    const totalEdges = chain.edges.length;
    const cursorText = local.replay && !local.replay.complete ? ` · 回放 ${local.replay.cursor}/${local.replay.total}` : '';
    const filterText = hasActiveFilters(ctx.state.filters) ? ' · 已筛选' : '';
    local.statEl.innerHTML = `可见 <b>${nodesVisible()}</b> / ${totalNodes} 节点 · 关系 <b>${edgesVisible()}</b> / ${totalEdges} · 缩放 <b>${Math.round(
      local.zoom * 100
    )}%</b>${cursorText}${filterText}`;
  }

  function updateToolbar() {
    const root = local.root;
    if (!root) return;
    const layered = root.querySelector('[data-graph-action="mode-layered"]');
    const force = root.querySelector('[data-graph-action="mode-force"]');
    if (layered) layered.classList.toggle('is-active', local.mode === 'layered');
    if (force) force.classList.toggle('is-active', local.mode === 'force');
    const critical = root.querySelector('[data-role="critical"]');
    if (critical) critical.classList.toggle('is-active', Boolean(ctx.state.critical));
    const clear = root.querySelector('[data-role="clear-filters"]');
    if (clear) clear.hidden = !hasActiveFilters(ctx.state.filters);
    if (local.subEl) {
      local.subEl.textContent =
        local.mode === 'layered'
          ? '阶段约束分层 · 重心排序（≥4 轮） · 轻量力松弛'
          : 'Fruchterman-Reingold 力导向 · 300 次迭代 · 固定种子确定性';
    }
    updateStat();
  }

  function updateEmpty() {
    if (!local.emptyEl) return;
    const empty = local.filtered.nodeIds.size === 0;
    local.emptyEl.hidden = !empty;
    if (empty) {
      local.emptyEl.innerHTML = `<div>${icon('filter')}</div><strong>没有符合筛选条件的节点</strong><span class="faint">调整左侧筛选或搜索条件后重试</span><button class="btn btn-sm" type="button" data-graph-action="clear-filters">清除筛选</button>`;
    }
  }

  function buildEdgeEls() {
    local.edgeEls.clear();
    for (const group of local.svg.querySelectorAll('.edge-group')) {
      local.edgeEls.set(group.dataset.edgeId, { group, path: group.querySelector('.edge-path') });
    }
  }

  function buildNodeEls() {
    local.nodeEls.clear();
    for (const el of local.svg.querySelectorAll('.gnode')) local.nodeEls.set(el.dataset.nodeId, el);
  }

  function renderAll(options = {}) {
    if (!local.svg) return;
    const chain = ctx.chain;
    const model = computeModel(ctx, local);
    local.chain = chain;
    local.filtered = model.filtered;
    local.layout = model.layout;
    local.positions = model.layout.positions;
    local.replay = model.replay;
    local.viewState = model.viewState;
    local.lastCursorEventId = model.replay.currentEvent?.id || null;
    const showEdgeLabels = chain.edges.length <= 600;
    local.svg.innerHTML = buildGraphMarkup(chain, {
      positions: local.positions,
      bounds: model.layout,
      columns: model.layout.columns,
      nodeIds: model.filtered.nodeIds,
      edgeIds: model.filtered.edgeIds,
      viewState: model.viewState,
      showBands: local.mode === 'layered',
      showEdgeLabels
    });
    local.viewportEl = local.svg.querySelector('.graph-viewport');
    buildNodeEls();
    buildEdgeEls();
    local.signature = `${JSON.stringify(ctx.state.filters)}|${local.mode}`;
    local.viewSignature = `${ctx.state.zoom ?? ''}|${ctx.state.fit ? 1 : 0}`;
    applyTransform();
    updateToolbar();
    updateEmpty();
    if (options.initial || !local.fitted) {
      local.fitted = true;
      requestAnimationFrame(() => applyInitialView());
    } else if (options.fit) {
      requestAnimationFrame(() => fitView());
    }
  }

  function applyStateOnly() {
    if (!local.svg || !local.viewState) return;
    const snapshot = computeStateSnapshot(ctx, local);
    local.filtered = snapshot.filtered;
    local.replay = snapshot.replay;
    local.viewState = snapshot.viewState;
    for (const [id, el] of local.nodeEls) {
      const node = ctx.derived.nodeMap.get(id);
      if (!node) continue;
      el.setAttribute('class', nodeClassList(node, local.viewState));
    }
    for (const [id, refs] of local.edgeEls) {
      const edge = ctx.derived.edgeMap.get(id);
      if (!edge) continue;
      refs.path.setAttribute('class', edgeClassList(edge, local.viewState));
      const marker =
        local.viewState.critical && local.viewState.criticalEdgeIds.has(id) ? 'arrow-critical' : `arrow-${edge.relation}`;
      refs.path.setAttribute('marker-end', `url(#${marker})`);
    }
    updateToolbar();
    updateEmpty();
    const currentId = local.replay.currentEvent?.id || null;
    if (currentId && currentId !== local.lastCursorEventId) {
      pulseCurrentEvent();
      local.lastCursorEventId = currentId;
    }
  }

  function pulseCurrentEvent() {
    const ids = [...(local.replay.currentEvent?.node_ids || [])];
    if (!ids.length) return;
    if (local.pulseTimer) clearTimeout(local.pulseTimer);
    for (const id of ids) {
      const el = local.nodeEls.get(id);
      if (!el) continue;
      el.classList.remove('is-pulse');
      void el.getBoundingClientRect();
      el.classList.add('is-pulse');
    }
    local.pulseTimer = setTimeout(() => {
      for (const id of ids) local.nodeEls.get(id)?.classList.remove('is-pulse');
      local.pulseTimer = null;
    }, 1600);
  }

  function fitView(record = false) {
    if (!local.canvas || !local.layout || !local.root) return;
    const width = local.canvas.clientWidth;
    const height = local.canvas.clientHeight;
    if (!width || !height) {
      setTimeout(() => fitView(record), 80);
      return;
    }
    const padX = 28;
    const padY = 24;
    const scale = Math.min(
      (width - padX * 2) / Math.max(1, local.layout.width),
      (height - padY * 2) / Math.max(1, local.layout.height)
    );
    local.zoom = clamp(Math.min(scale, 2.5), 0.3, 2.5);
    local.pan = {
      x: (width - local.layout.width * local.zoom) / 2,
      y: (height - local.layout.height * local.zoom) / 2
    };
    applyTransform();
    updateStat();
    // 仅用户在工具栏点击“适配”时写入深链 fit=1，保证截图可复现完整画面
    if (record) ctx.actions.syncGraphView?.({ zoom: null, fit: true });
  }

  /**
   * 默认视图：优先保证可读字号（缩放不低于 0.7），内容超出画布时允许拖拽平移；
   * 显式深链 zoom / fit 参数优先。
   */
  function applyInitialView() {
    if (!local.canvas || !local.layout || !local.root) return;
    const width = local.canvas.clientWidth;
    const height = local.canvas.clientHeight;
    if (!width || !height) {
      setTimeout(() => applyInitialView(), 80);
      return;
    }
    const padX = 28;
    const padY = 22;
    const fullScale = Math.min(
      (width - padX * 2) / Math.max(1, local.layout.width),
      (height - padY * 2) / Math.max(1, local.layout.height)
    );
    const nodeCount = local.filtered.nodeIds.size;
    let scale;
    if (ctx.state.zoom !== null && ctx.state.zoom !== undefined && Number.isFinite(Number(ctx.state.zoom))) {
      scale = clamp(Number(ctx.state.zoom), 0.3, 2.5);
    } else if (ctx.state.fit) {
      scale = clamp(fullScale, 0.3, 2.5);
    } else {
      scale = clamp(Math.max(fullScale, 0.7), 0.3, nodeCount <= 120 ? 1.7 : 1.25);
    }
    local.zoom = scale;
    local.lastCanvasWidth = width;
    const contentWidth = local.layout.width * scale;
    const contentHeight = local.layout.height * scale;
    local.pan = {
      x: contentWidth > width - 12 ? 16 : (width - contentWidth) / 2,
      y: contentHeight <= height - 12 ? (height - contentHeight) / 2 : 16
    };
    applyTransform();
    updateStat();
  }

  function zoomAt(point, factor) {
    const next = clamp(local.zoom * factor, 0.3, 2.5);
    if (Math.abs(next - local.zoom) < 0.0001) return;
    const worldX = (point.x - local.pan.x) / local.zoom;
    const worldY = (point.y - local.pan.y) / local.zoom;
    local.zoom = next;
    local.pan = { x: point.x - worldX * next, y: point.y - worldY * next };
    applyTransform();
    updateStat();
    queueViewSync();
  }

  /** 缩放结束后把 zoom 写入深链，便于论文截图复现 */
  function queueViewSync() {
    if (local.viewSyncTimer) clearTimeout(local.viewSyncTimer);
    local.viewSyncTimer = setTimeout(() => {
      local.viewSyncTimer = null;
      if (!local.root) return;
      ctx.actions.syncGraphView?.({ zoom: local.zoom, fit: false });
      local.viewSignature = `${local.zoom}|0`;
    }, 260);
  }

  function selectNode(id) {
    if (!id) return;
    ctx.actions.selectNode(id);
  }

  function updateIncidentEdges(nodeId) {
    const chain = ctx.chain;
    for (const edge of chain.edges) {
      if (edge.from !== nodeId && edge.to !== nodeId) continue;
      const refs = local.edgeEls.get(edge.id);
      if (!refs) continue;
      const from = local.positions[edge.from];
      const to = local.positions[edge.to];
      if (!from || !to) continue;
      refs.path.setAttribute('d', edgeGeometry(from, to).d);
    }
  }

  function onToolbarClick(event) {
    const button = event.target.closest('[data-graph-action]');
    if (!button) return;
    const action = button.dataset.graphAction;
    if (action === 'mode-layered' || action === 'mode-force') {
      const mode = action === 'mode-force' ? 'force' : 'layered';
      if (mode === local.mode) return;
      local.mode = mode;
      renderAll({ fit: true });
    } else if (action === 'zoom-in') {
      const rect = local.canvas.getBoundingClientRect();
      zoomAt({ x: rect.width / 2, y: rect.height / 2 }, 1.22);
    } else if (action === 'zoom-out') {
      const rect = local.canvas.getBoundingClientRect();
      zoomAt({ x: rect.width / 2, y: rect.height / 2 }, 1 / 1.22);
    } else if (action === 'fit') {
      fitView(true);
    } else if (action === 'reset') {
      local.fixes.clear();
      local.mode = 'layered';
      local.zoom = 1;
      local.pan = { x: 0, y: 0 };
      ctx.actions.syncGraphView?.({ zoom: null, fit: false });
      renderAll({ initial: true });
    } else if (action === 'toggle-critical') {
      ctx.actions.toggleCritical();
    } else if (action === 'clear-filters') {
      ctx.actions.resetFilters();
    }
  }

  function onWheel(event) {
    event.preventDefault();
    const point = localPoint(event);
    const factor = Math.exp(-event.deltaY * 0.0016);
    zoomAt(point, factor);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    hideTooltip();
    const point = localPoint(event);
    const nodeEl = event.target.closest?.('.gnode');
    const edgeEl = event.target.closest?.('.edge-group');
    if (nodeEl) {
      const id = nodeEl.dataset.nodeId;
      local.drag = {
        type: 'node',
        id,
        el: nodeEl,
        startPoint: point,
        startPos: local.positions[id] ? { ...local.positions[id] } : null,
        moved: false
      };
      try {
        local.svg.setPointerCapture(event.pointerId);
      } catch {
        /* 忽略 */
      }
      event.preventDefault();
      return;
    }
    if (edgeEl) {
      local.drag = { type: 'edge', id: edgeEl.dataset.edgeId, startPoint: point, moved: false };
      return;
    }
    local.panning = { start: point, panStart: { ...local.pan }, moved: false };
    local.canvas.classList.add('is-panning');
    try {
      local.svg.setPointerCapture(event.pointerId);
    } catch {
      /* 忽略 */
    }
  }

  function onPointerMove(event) {
    const point = localPoint(event);
    if (local.drag?.type === 'node' && local.drag.startPos) {
      const dx = (point.x - local.drag.startPoint.x) / local.zoom;
      const dy = (point.y - local.drag.startPoint.y) / local.zoom;
      if (Math.abs(point.x - local.drag.startPoint.x) + Math.abs(point.y - local.drag.startPoint.y) > 3) {
        local.drag.moved = true;
      }
      if (local.drag.moved) {
        const next = { x: local.drag.startPos.x + dx, y: local.drag.startPos.y + dy };
        local.positions[local.drag.id] = next;
        local.fixes.set(local.drag.id, next);
        local.drag.el.setAttribute('transform', `translate(${next.x.toFixed(1)},${next.y.toFixed(1)})`);
        updateIncidentEdges(local.drag.id);
      }
      return;
    }
    if (local.drag?.type === 'edge') {
      if (Math.abs(point.x - local.drag.startPoint.x) + Math.abs(point.y - local.drag.startPoint.y) > 4) {
        local.drag.moved = true;
      }
      return;
    }
    if (local.panning) {
      const dx = point.x - local.panning.start.x;
      const dy = point.y - local.panning.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) local.panning.moved = true;
      local.pan = { x: local.panning.panStart.x + dx, y: local.panning.panStart.y + dy };
      applyTransform();
    }
  }

  function onPointerUp(event) {
    const drag = local.drag;
    const panning = local.panning;
    local.drag = null;
    local.panning = null;
    local.canvas.classList.remove('is-panning');
    try {
      local.svg.releasePointerCapture(event.pointerId);
    } catch {
      /* 忽略 */
    }
    if (drag?.type === 'node' && !drag.moved) selectNode(drag.id);
    else if (drag?.type === 'edge' && !drag.moved) {
      ctx.actions.openDrawer({ kind: 'edge', id: drag.id });
    } else if (panning && !panning.moved) {
      ctx.actions.clearSelection();
    }
  }

  function onNodeKeydown(event) {
    if (event.key !== 'Enter') return;
    const nodeEl = event.target.closest?.('.gnode');
    if (!nodeEl) return;
    event.preventDefault();
    selectNode(nodeEl.dataset.nodeId);
  }

  function nodeTooltipHtml(node) {
    const spec = NODE_TYPE_MAP.get(node.type) || { zh: node.type, color: '#64748b' };
    const props = node.props || {};
    const extras = [];
    if (props.ip) extras.push(`IP ${esc(props.ip)}`);
    if (props.url) extras.push(esc(String(props.url).slice(0, 48)));
    if (props.port) extras.push(`端口 ${esc(props.port)}`);
    if (props.severity) extras.push(`严重度 ${esc(props.severity)}`);
    return `<strong>${esc(node.label)}</strong>
      <div class="tt-meta">${esc(spec.zh)} · ${esc(stageZh(node.stage))} · <span style="font-family:var(--font-mono)">${esc(
        node.id
      )}</span></div>
      <div class="tt-row"><span class="dot" style="background:${riskColor(node.risk)}"></span>风险 ${Number(node.risk).toFixed(
        1
      )} / 10 · 置信度 ${fmtPct(node.confidence, 0)}</div>
      ${extras.length ? `<div class="tt-row">${extras.join(' · ')}</div>` : ''}`;
  }

  function edgeTooltipHtml(edge) {
    const from = ctx.derived.nodeMap.get(edge.from);
    const to = ctx.derived.nodeMap.get(edge.to);
    return `<strong>${esc(relationZh(edge.relation))}</strong>
      <div class="tt-meta">${esc(from?.label || edge.from)} → ${esc(to?.label || edge.to)}</div>
      <div class="tt-row">阶段 ${esc(stageZh(edge.stage))} · 权重 ${Number(edge.weight).toFixed(2)}</div>`;
  }

  function onPointerOver(event) {
    const nodeEl = event.target.closest?.('.gnode');
    if (nodeEl) {
      const node = ctx.derived.nodeMap.get(nodeEl.dataset.nodeId);
      if (node) showTooltip(nodeTooltipHtml(node), event.clientX, event.clientY);
      return;
    }
    const edgeEl = event.target.closest?.('.edge-group');
    if (edgeEl) {
      const edge = ctx.derived.edgeMap.get(edgeEl.dataset.edgeId);
      if (edge) showTooltip(edgeTooltipHtml(edge), event.clientX, event.clientY);
    }
  }

  function onHoverMove(event) {
    if (event.buttons) return;
    moveTooltip(event.clientX, event.clientY);
  }

  function onPointerOut(event) {
    if (!local.canvas.contains(event.relatedTarget)) hideTooltip();
  }

  function onDoubleClick(event) {
    const nodeEl = event.target.closest?.('.gnode');
    if (!nodeEl) return;
    event.preventDefault();
    local.fixes.delete(nodeEl.dataset.nodeId);
    renderAll({ fit: false });
  }

  function mount(root) {
    local.root = root;
    root.innerHTML = template();
    local.canvas = root.querySelector('[data-role="canvas"]');
    local.svg = root.querySelector('[data-role="svg"]');
    local.emptyEl = root.querySelector('[data-role="empty"]');
    local.statEl = root.querySelector('[data-role="stat"]');
    local.subEl = root.querySelector('[data-role="sub"]');
    local.lastCanvasWidth = local.canvas.clientWidth || 0;
    root.querySelector('[data-role="toolbar"]').addEventListener('click', onToolbarClick);
    local.svg.addEventListener('wheel', onWheel, { passive: false });
    local.svg.addEventListener('pointerdown', onPointerDown);
    local.svg.addEventListener('pointermove', onPointerMove);
    local.svg.addEventListener('pointerup', onPointerUp);
    local.svg.addEventListener('pointercancel', onPointerUp);
    local.svg.addEventListener('pointerover', onPointerOver);
    local.svg.addEventListener('pointermove', onHoverMove);
    local.svg.addEventListener('pointerout', onPointerOut);
    local.svg.addEventListener('dblclick', onDoubleClick);
    local.svg.addEventListener('keydown', onNodeKeydown);
    local.canvas.addEventListener('click', (event) => {
      const clear = event.target.closest('[data-graph-action="clear-filters"]');
      if (clear) ctx.actions.resetFilters();
    });
    // 详情抽屉打开 / 窗口缩放时画布宽度变化：保持图形中心不跳变
    if (typeof ResizeObserver === 'function') {
      local.observer = new ResizeObserver(() => {
        if (!local.canvas) return;
        const width = local.canvas.clientWidth;
        if (!width) return;
        if (!local.lastCanvasWidth) {
          local.lastCanvasWidth = width;
          return;
        }
        if (width !== local.lastCanvasWidth) {
          local.pan.x += (width - local.lastCanvasWidth) / 2;
          local.lastCanvasWidth = width;
          applyTransform();
        }
      });
      local.observer.observe(local.canvas);
    }
    renderAll({ initial: true });
  }

  function update() {
    const root = local.root;
    if (!root) return;
    if (ctx.chain !== local.chain) {
      renderAll({ initial: true });
      return;
    }
    const viewSignature = `${ctx.state.zoom ?? ''}|${ctx.state.fit ? 1 : 0}`;
    if (viewSignature !== local.viewSignature) {
      local.viewSignature = viewSignature;
      applyInitialView();
      return;
    }
    const signature = `${JSON.stringify(ctx.state.filters)}|${local.mode}`;
    if (signature !== local.signature) {
      renderAll({ fit: true });
      return;
    }
    applyStateOnly();
  }

  function destroy() {
    if (local.pulseTimer) clearTimeout(local.pulseTimer);
    if (local.viewSyncTimer) clearTimeout(local.viewSyncTimer);
    local.observer?.disconnect();
    local.observer = null;
    hideTooltip();
    local.nodeEls.clear();
    local.edgeEls.clear();
    local.root = null;
  }

  return { mount, update, destroy, fit: () => fitView(true), getState: () => local };
}

/** 供 window.ChainLens.bench 使用：在隐藏容器里按相同标记渲染一次 */
export function renderGraphPreview(container, chain, layout) {
  const filtered = filterChain(chain, {});
  const layoutInfo = layout || layoutLayered(chain.nodes, chain.edges);
  const viewState = EMPTY_VIEW_STATE();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'graph-svg');
  svg.setAttribute('width', '1600');
  svg.setAttribute('height', '1000');
  svg.innerHTML = buildGraphMarkup(chain, {
    positions: layoutInfo.positions,
    bounds: layoutInfo,
    columns: layoutInfo.columns,
    nodeIds: filtered.nodeIds,
    edgeIds: filtered.edgeIds,
    viewState,
    showBands: true,
    showEdgeLabels: chain.edges.length <= 600
  });
  container.textContent = '';
  container.appendChild(svg);
  return { nodeCount: chain.nodes.length, edgeCount: chain.edges.length };
}
