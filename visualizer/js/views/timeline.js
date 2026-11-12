/**
 * 时间线视图：7 条阶段泳道、事件落点、时间缩放/平移、回放游标、
 * hover 事件卡、点击定位详情；上方统计阶段耗时 / 成功率 / 最长静默。
 */
import { KEY_ACTIONS, RESULT_MAP, STAGES } from '../constants.js';
import { filterChain } from '../filtering.js';
import { visibleState } from '../replay.js';
import { icon } from '../icons.js';
import { clamp, esc } from '../util.js';
import {
  fmtClock,
  fmtClockSec,
  fmtDuration,
  fmtDurationShort,
  fmtPct,
  riskColor,
  stageZh
} from '../format.js';
import { showTooltip, moveTooltip, hideTooltip } from '../components/tooltip.js';

const LANE_LABEL_WIDTH = 92;
const TOP_PAD = 34;
const BOTTOM_PAD = 26;
const DOMAIN_PADDING_RATIO = 0.04;

function buildStats(derived) {
  const success = derived.successRate;
  const silence = derived.longestSilence;
  const slowest = derived.stageStats.slice().sort((a, b) => b.durationMs - a.durationMs)[0];
  const reached = derived.stageStats.filter((s) => s.reached);
  const maxDuration = Math.max(1, ...reached.map((s) => s.durationMs));
  const miniBars = derived.stageStats
    .map(
      (stage) =>
        `<span class="tl-mini-bar" title="${esc(stage.zh)}：${stage.events} 事件 / ${fmtDuration(
          stage.durationMs
        )}" style="--c:${stage.color};height:${Math.max(3, (stage.durationMs / maxDuration) * 24).toFixed(
          0
        )}px"></span>`
    )
    .join('');
  return `<div class="timeline-stats">
    <div class="panel tl-stat">
      <div class="tl-stat-label">${icon('clock')}事件跨度</div>
      <div class="tl-stat-value">${esc(fmtDuration(derived.durationMs))}</div>
      <div class="tl-stat-sub">${esc(
        derived.stageStats.find((s) => s.firstTs !== null)?.firstTs
          ? `${fmtClock(derived.stageStats.find((s) => s.firstTs !== null).firstTs)} → ${fmtClock(
              derived.stageStats
                .filter((s) => s.lastTs !== null)
                .slice(-1)[0]?.lastTs
            )}`
          : '—'
      )}</div>
    </div>
    <div class="panel tl-stat">
      <div class="tl-stat-label">${icon('check')}事件成功率</div>
      <div class="tl-stat-value" style="color:var(--green)">${fmtPct(success.ratio)}<small>${success.success}/${success.considered}</small></div>
      <div class="tl-stat-sub">失败 ${success.failure} · 部分 ${success.partial} · 信息 ${success.info}</div>
    </div>
    <div class="panel tl-stat">
      <div class="tl-stat-label">${icon('warning')}最长静默间隔</div>
      <div class="tl-stat-value">${esc(fmtDuration(silence.gapMs))}</div>
      <div class="tl-stat-sub">${esc(
        silence.from ? `${fmtClock(silence.from)} → ${fmtClock(silence.to)}` : '事件不足两个'
      )}</div>
    </div>
    <div class="panel tl-stat">
      <div class="tl-stat-label">${icon('layers')}阶段耗时</div>
      <div class="tl-stat-value" style="font-size:15px">${esc(slowest?.zh || '—')}<small>${esc(
    fmtDurationShort(slowest?.durationMs || 0)
  )}</small></div>
      <div class="tl-mini-bars" aria-hidden="true">${miniBars}</div>
    </div>
  </div>`;
}

/** 时间范围映射 */
function makeScale(domain, plotLeft, plotWidth) {
  return {
    toX: (ts) => plotLeft + ((ts - domain.start) / Math.max(1, domain.end - domain.start)) * plotWidth,
    toTime: (x) => domain.start + ((x - plotLeft) / Math.max(1, plotWidth)) * (domain.end - domain.start)
  };
}

function buildLanes(derived, domain, width, height) {
  const laneHeight = Math.max(38, (height - TOP_PAD - BOTTOM_PAD) / STAGES.length);
  const plotWidth = Math.max(80, width - LANE_LABEL_WIDTH - 24);
  const plotLeft = LANE_LABEL_WIDTH + 6;
  const scale = makeScale(domain, plotLeft, plotWidth);
  const lanes = [];
  const tickCount = width > 1100 ? 8 : width > 800 ? 6 : 4;
  const ticks = [];
  for (let i = 0; i <= tickCount; i += 1) {
    const ts = domain.start + ((domain.end - domain.start) * i) / tickCount;
    const x = scale.toX(ts);
    ticks.push(
      `<line class="tl-tick-line" x1="${x.toFixed(1)}" y1="${TOP_PAD - 8}" x2="${x.toFixed(1)}" y2="${(
        TOP_PAD +
        laneHeight * STAGES.length
      ).toFixed(1)}"></line>
       <text class="tl-tick-label" x="${x.toFixed(1)}" y="${TOP_PAD - 14}" text-anchor="${
        i === 0 ? 'start' : i === tickCount ? 'end' : 'middle'
      }">${fmtClock(ts)}</text>`
    );
  }
  STAGES.forEach((stage, index) => {
    const y = TOP_PAD + index * laneHeight;
    const stats = derived.stageStats.find((s) => s.stage === stage.id);
    lanes.push(
      `<g class="tl-lane" data-stage="${stage.id}">
        <rect class="tl-lane-bg${index % 2 ? ' is-alt' : ''}" x="0" y="${y.toFixed(1)}" width="${width}" height="${laneHeight.toFixed(
          1
        )}"></rect>
        <line class="tl-lane-line" x1="0" y1="${y.toFixed(1)}" x2="${width}" y2="${y.toFixed(1)}"></line>
        <text class="tl-lane-label" x="16" y="${(y + laneHeight / 2 - 2).toFixed(1)}">${esc(stage.zh)}</text>
        <text class="tl-lane-sub" x="16" y="${(y + laneHeight / 2 + 12).toFixed(1)}">${stats?.events || 0} 事件 · ${esc(
          fmtDurationShort(stats?.durationMs || 0)
        )}</text>
        <line class="tl-lane-line" x1="${LANE_LABEL_WIDTH}" y1="${(y + laneHeight).toFixed(1)}" x2="${width}" y2="${(
          y + laneHeight
        ).toFixed(1)}" opacity="0.35"></line>
      </g>`
    );
  });
  return { laneHeight, plotLeft, plotWidth, scale, ticks, lanes };
}

function eventMarkup(event, index, laneIndex, laneHeight, scale, replay) {
  const x = scale.toX(event.tsMs);
  const y = TOP_PAD + laneIndex * laneHeight + laneHeight / 2;
  const jitter = ((index % 3) - 1) * Math.min(8, laneHeight * 0.16);
  const result = RESULT_MAP.get(event.result) || { color: '#64748b' };
  const key = KEY_ACTIONS.has(event.action) || (event.result === 'success' && event.risk >= 7);
  const radius = key ? 6.4 : 4.2;
  const beyond = replay && !replay.complete && index >= (replay.cursor ?? replay.total);
  const current = replay && !replay.complete && replay.cursor > 0 && index === replay.cursor - 1;
  const classes = ['tl-event'];
  if (beyond) classes.push('is-dimmed');
  if (current) classes.push('is-current');
  const ring = key
    ? `<circle class="tl-ring" cx="${x.toFixed(1)}" cy="${(y + jitter).toFixed(1)}" r="${(radius + 4).toFixed(1)}"></circle>`
    : '';
  return `<g class="${classes.join(' ')}" data-event-id="${esc(event.id)}" data-event-index="${index}" data-stage="${
    event.stage
  }" style="--c:${result.color}" transform="translate(0,0)">
    <title>${esc(event.summary)}</title>
    ${ring}
    <circle class="tl-dot" cx="${x.toFixed(1)}" cy="${(y + jitter).toFixed(1)}" r="${radius}"></circle>
  </g>`;
}

function cursorPosition(chain, replay, domain, scale) {
  const current = replay?.currentEvent;
  let ts = domain.start;
  if (replay?.complete) ts = chain.events[chain.events.length - 1]?.tsMs ?? domain.end;
  else if (current) ts = current.tsMs;
  const x = clamp(scale.toX(ts), 0, scale.toX(domain.end));
  const label = current ? fmtClockSec(current.ts) : replay?.complete ? '结束' : '开始';
  return { x, label };
}

function cursorMarkup(chain, replay, domain, scale, laneHeight) {
  const { x, label } = cursorPosition(chain, replay, domain, scale);
  const top = TOP_PAD - 4;
  const bottom = TOP_PAD + laneHeight * STAGES.length;
  return `<g class="tl-cursor" data-role="cursor">
    <line class="tl-cursor-line" x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${bottom}"></line>
    <circle class="tl-cursor-head" cx="${x.toFixed(1)}" cy="${top}" r="3.4"></circle>
    <text class="tl-current-label" x="${(x + 6).toFixed(1)}" y="${(top - 6).toFixed(1)}">${esc(label)}</text>
  </g>`;
}

export function createTimelineView(ctx) {
  const local = {
    root: null,
    canvas: null,
    svg: null,
    domain: null,
    width: 0,
    height: 0,
    laneHeight: 48,
    scale: null,
    filtered: null,
    replay: null,
    signature: '',
    drag: null,
    eventEls: new Map(),
    observer: null,
    panFrame: null,
    chain: null
  };

  /** 平移时用 rAF 合并重绘，避免每个 pointermove 都重建 SVG */
  function scheduleRender() {
    if (local.panFrame) return;
    local.panFrame = requestAnimationFrame(() => {
      local.panFrame = null;
      renderAll({ stats: false });
    });
  }

  function eventsRange() {
    const events = ctx.chain.events;
    if (!events.length) return null;
    const first = events[0].tsMs;
    const last = events[events.length - 1].tsMs;
    const span = Math.max(60000, last - first);
    return {
      start: first - span * DOMAIN_PADDING_RATIO,
      end: last + span * DOMAIN_PADDING_RATIO,
      fullStart: first,
      fullEnd: last
    };
  }

  function resetDomain() {
    const range = eventsRange();
    local.domain = range ? { start: range.start, end: range.end } : null;
  }

  function zoomDomain(factor, focusX) {
    if (!local.domain || !local.scale) return;
    const focusTime = local.scale.toTime(focusX);
    const range = eventsRange();
    const minSpan = Math.max(60000, (range ? range.end - range.start : 0) * 0.06);
    const currentSpan = local.domain.end - local.domain.start;
    const nextSpan = clamp(currentSpan * factor, minSpan, (range ? range.end - range.start : currentSpan) * 1.05);
    const ratio = (focusTime - local.domain.start) / Math.max(1, currentSpan);
    local.domain = {
      start: focusTime - nextSpan * ratio,
      end: focusTime + nextSpan * (1 - ratio)
    };
    renderAll();
  }

  function template() {
    return `<div class="view view--timeline">
      <div class="view-header view-header--compact">
        <div>
          <div class="view-title">${icon('clock')}时间线</div>
          <div class="view-sub">7 条阶段泳道 · 滚轮缩放时间范围 · 拖拽平移 · 点击事件查看详情</div>
        </div>
        <div class="view-actions">
          <div class="toolbar-group" role="group" aria-label="时间缩放">
            <button class="btn btn-icon" type="button" data-tl-action="zoom-out" aria-label="缩小时间范围">${icon('minus')}</button>
            <button class="btn btn-icon" type="button" data-tl-action="zoom-in" aria-label="放大时间范围">${icon('plus')}</button>
            <button class="btn" type="button" data-tl-action="reset">${icon('fit')}<span>重置</span></button>
          </div>
        </div>
      </div>
      <div data-role="stats"></div>
      <div class="timeline-canvas" data-role="canvas">
        <svg class="timeline-svg" data-role="svg" role="img" aria-label="事件时间线"></svg>
      </div>
    </div>`;
  }

  function renderAll(options = {}) {
    if (!local.svg || !local.canvas) return;
    const chain = ctx.chain;
    local.chain = chain;
    local.filtered = filterChain(chain, ctx.state.filters);
    local.replay = visibleState(chain, ctx.state.cursor);
    const filteredEvents = chain.events.filter((event) => local.filtered.eventIds.has(event.id));
    const derived = ctx.derived;
    if (options.stats !== false) {
      const statsEl = local.root.querySelector('[data-role="stats"]');
      statsEl.innerHTML = buildStats(derived);
    }
    local.width = Math.max(320, local.canvas.clientWidth);
    local.height = Math.max(220, local.canvas.clientHeight);
    if (!local.domain) resetDomain();
    if (!local.domain || !chain.events.length) {
      local.svg.innerHTML = `<foreignObject x="0" y="0" width="${local.width}" height="${local.height}"><div xmlns="http://www.w3.org/1999/xhtml" class="empty-state tl-empty">${icon(
        'clock'
      )}<strong>暂无事件</strong><span>当前数据集没有 event 记录</span></div></foreignObject>`;
      return;
    }
    const lanes = buildLanes(derived, local.domain, local.width, local.height);
    local.laneHeight = lanes.laneHeight;
    local.scale = lanes.scale;
    const eventMarkupList = [];
    const laneIndexByStage = new Map(STAGES.map((stage, index) => [stage.id, index]));
    chain.events.forEach((event, index) => {
      if (!local.filtered.eventIds.has(event.id)) return;
      const laneIndex = laneIndexByStage.get(event.stage) ?? 0;
      eventMarkupList.push(eventMarkup(event, index, laneIndex, lanes.laneHeight, lanes.scale, local.replay));
    });
    local.svg.setAttribute('viewBox', `0 0 ${local.width} ${local.height}`);
    local.svg.innerHTML = `<g class="tl-ticks">${lanes.ticks.join('')}</g>
      <g class="tl-lanes">${lanes.lanes.join('')}</g>
      <g class="tl-events" data-count="${filteredEvents.length}">${eventMarkupList.join('')}</g>
      ${cursorMarkup(chain, local.replay, local.domain, lanes.scale, lanes.laneHeight)}`;
    local.eventEls.clear();
    for (const el of local.svg.querySelectorAll('.tl-event')) local.eventEls.set(el.dataset.eventId, el);
    local.signature = JSON.stringify(ctx.state.filters);
    applyStateOnly();
  }

  function applyStateOnly() {
    if (!local.svg || !local.scale || !local.domain) return;
    const chain = ctx.chain;
    local.replay = visibleState(chain, ctx.state.cursor);
    const laneHeight = local.laneHeight;
    for (const [id, el] of local.eventEls) {
      const index = Number(el.dataset.eventIndex);
      const beyond = !local.replay.complete && index >= local.replay.cursor;
      const current = !local.replay.complete && local.replay.cursor > 0 && index === local.replay.cursor - 1;
      el.classList.toggle('is-dimmed', beyond);
      el.classList.toggle('is-current', current);
    }
    const cursor = local.svg.querySelector('[data-role="cursor"]');
    if (cursor) {
      const { x, label } = cursorPosition(chain, local.replay, local.domain, local.scale);
      const top = TOP_PAD - 4;
      const bottom = TOP_PAD + laneHeight * STAGES.length;
      const line = cursor.querySelector('.tl-cursor-line');
      if (line) {
        line.setAttribute('x1', x.toFixed(1));
        line.setAttribute('x2', x.toFixed(1));
        line.setAttribute('y1', String(top));
        line.setAttribute('y2', String(bottom));
      }
      const head = cursor.querySelector('.tl-cursor-head');
      if (head) {
        head.setAttribute('cx', x.toFixed(1));
        head.setAttribute('cy', String(top));
      }
      const text = cursor.querySelector('.tl-current-label');
      if (text) {
        text.setAttribute('x', (x + 6).toFixed(1));
        text.setAttribute('y', String(top - 6));
        text.textContent = label;
      }
    }
  }

  function onToolbarClick(event) {
    const button = event.target.closest('[data-tl-action]');
    if (!button) return;
    const action = button.dataset.tlAction;
    const rect = local.canvas.getBoundingClientRect();
    if (action === 'zoom-in') zoomDomain(1 / 1.35, rect.width * 0.5);
    else if (action === 'zoom-out') zoomDomain(1.35, rect.width * 0.5);
    else if (action === 'reset') {
      resetDomain();
      renderAll();
    }
  }

  function onWheel(event) {
    event.preventDefault();
    const rect = local.canvas.getBoundingClientRect();
    zoomDomain(Math.exp(event.deltaY * 0.0018), event.clientX - rect.left);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const eventEl = event.target.closest?.('.tl-event');
    if (eventEl) return;
    const rect = local.canvas.getBoundingClientRect();
    local.drag = { startX: event.clientX - rect.left, start: { ...local.domain }, moved: false };
    local.svg.setPointerCapture?.(event.pointerId);
    hideTooltip();
  }

  function onPointerMove(event) {
    if (!local.drag) return;
    const rect = local.canvas.getBoundingClientRect();
    const dx = event.clientX - rect.left - local.drag.startX;
    if (Math.abs(dx) > 3) local.drag.moved = true;
    if (!local.drag.moved || !local.scale) return;
    const plotWidth = Math.max(80, local.width - LANE_LABEL_WIDTH - 24);
    const deltaTime = (dx / plotWidth) * (local.drag.start.end - local.drag.start.start);
    local.domain = { start: local.drag.start.start - deltaTime, end: local.drag.start.end - deltaTime };
    scheduleRender();
  }

  function onPointerUp(event) {
    local.drag = null;
    try {
      local.svg.releasePointerCapture(event.pointerId);
    } catch {
      /* 忽略 */
    }
  }

  function onDoubleClick() {
    resetDomain();
    renderAll();
  }

  function onClick(event) {
    const eventEl = event.target.closest?.('.tl-event');
    if (!eventEl) return;
    const id = eventEl.dataset.eventId;
    const index = Number(eventEl.dataset.eventIndex);
    ctx.actions.setCursor(index + 1);
    ctx.actions.openDrawer({ kind: 'event', id });
  }

  function eventTooltipHtml(event) {
    const result = RESULT_MAP.get(event.result) || { zh: event.result, color: '#64748b' };
    return `<strong>${esc(event.summary)}</strong>
      <div class="tt-meta">${esc(fmtClockSec(event.ts))} · ${esc(stageZh(event.stage))} · ${esc(
        event.action
      )}</div>
      <div class="tt-row"><span class="dot" style="background:${result.color}"></span>${esc(
        result.zh
      )} · 风险 ${Number(event.risk).toFixed(1)} · <span style="font-family:var(--font-mono)">${esc(event.id)}</span></div>`;
  }

  function onPointerOver(event) {
    const eventEl = event.target.closest?.('.tl-event');
    if (!eventEl) return;
    const eventObj = ctx.chain.events.find((e) => e.id === eventEl.dataset.eventId);
    if (eventObj) showTooltip(eventTooltipHtml(eventObj), event.clientX, event.clientY);
  }

  function onHoverMove(event) {
    if (event.buttons) return;
    moveTooltip(event.clientX, event.clientY);
  }

  function onPointerOut(event) {
    if (!local.canvas.contains(event.relatedTarget)) hideTooltip();
  }

  function mount(root) {
    local.root = root;
    root.innerHTML = template();
    local.canvas = root.querySelector('[data-role="canvas"]');
    local.svg = root.querySelector('[data-role="svg"]');
    resetDomain();
    local.replay = visibleState(ctx.chain, ctx.state.cursor);
    root.querySelector('.view-actions').addEventListener('click', onToolbarClick);
    local.svg.addEventListener('wheel', onWheel, { passive: false });
    local.svg.addEventListener('pointerdown', onPointerDown);
    local.svg.addEventListener('pointermove', onPointerMove);
    local.svg.addEventListener('pointerup', onPointerUp);
    local.svg.addEventListener('pointercancel', onPointerUp);
    local.svg.addEventListener('click', onClick);
    local.svg.addEventListener('dblclick', onDoubleClick);
    local.svg.addEventListener('pointerover', onPointerOver);
    local.svg.addEventListener('pointermove', onHoverMove);
    local.svg.addEventListener('pointerout', onPointerOut);
    if (typeof ResizeObserver === 'function') {
      local.observer = new ResizeObserver(() => {
        if (!local.root || !local.canvas) return;
        if (local.canvas.clientWidth !== local.width || local.canvas.clientHeight !== local.height) renderAll();
      });
      local.observer.observe(local.canvas);
    }
    renderAll();
  }

  function update() {
    if (!local.root) return;
    if (ctx.chain !== local.chain) {
      resetDomain();
      local.replay = visibleState(ctx.chain, ctx.state.cursor);
      renderAll();
      return;
    }
    const signature = JSON.stringify(ctx.state.filters);
    if (signature !== local.signature) {
      renderAll();
      return;
    }
    applyStateOnly();
  }

  function destroy() {
    local.observer?.disconnect();
    local.observer = null;
    if (local.panFrame) cancelAnimationFrame(local.panFrame);
    local.panFrame = null;
    hideTooltip();
    local.eventEls.clear();
    local.root = null;
  }

  return { mount, update, destroy };
}

export { buildStats as _buildTimelineStats };
