/**
 * ChainLens 应用入口：数据加载、路由深链、状态管理、视图切换、
 * 筛选栏、详情抽屉、回放条、导入 / 导出、快捷键与 bench 性能接口。
 */
import { FALLBACK_SCENARIO_ID, VIEWS } from './constants.js';
import { analyticsApi, getDerived, summarise } from './analytics.js';
import { layoutApi } from './layout.js';
import { parseChain } from './parser.js';
import { normalizeCursor, stepCursor } from './replay.js';
import { buildRoute, parseRoute } from './router.js';
import { emptyFilters, normalizeFilters } from './filtering.js';
import { DataStore } from './loader.js';
import { createGraphView } from './views/graph.js';
import { renderOverview } from './views/overview.js';
import { createTimelineView } from './views/timeline.js';
import { createAttackView } from './views/attack.js';
import { createFindingsView } from './views/findings.js';
import { buildReportMarkdown, buildReportModel, createReportView } from './views/report.js';
import { createAboutView } from './views/about.js';
import { openImportModal, closeImportModal, isImportOpen } from './components/import-modal.js';
import { hideTooltip } from './components/tooltip.js';
import { copyText } from './io.js';
import { icon } from './icons.js';
import { clamp, debounce, esc } from './util.js';
import { createShell } from './shell.js';
import { createReplayController } from './replay-controller.js';
import { createKeyboardHandler } from './keyboard.js';
import { createInteractions } from './interactions.js';
import { benchScenario } from './bench-perf.js';
import {
  exportEvidenceJson as writeEvidenceJson,
  exportFindingsCsv as writeFindingsCsv,
  exportReportJson as writeReportJson
} from './exports.js';

// ---------------------------------------------------------------------------
// 全局错误收集（便于截图 / 自动测试发现运行时异常）
// ---------------------------------------------------------------------------
window.__chainlensErrors = window.__chainlensErrors || [];
window.addEventListener('error', (event) => {
  window.__chainlensErrors.push({ type: 'error', message: event.message, source: event.filename, line: event.lineno });
});
window.addEventListener('unhandledrejection', (event) => {
  window.__chainlensErrors.push({ type: 'rejection', message: String(event.reason?.message || event.reason) });
});

// ---------------------------------------------------------------------------
// DOM 引用
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'),
  scenarioSelect: $('scenario-select'),
  scenarioBadge: $('scenario-badge'),
  viewTabs: $('view-tabs'),
  viewRoot: $('view-root'),
  main: $('main'),
  sidebarFilters: $('sidebar-filters'),
  searchInput: $('filter-search'),
  resetFilters: $('btn-reset-filters'),
  activeFilterCount: $('active-filter-count'),
  qualityCard: $('quality-card'),
  dataBanner: $('data-banner'),
  dataBannerText: $('data-banner-text'),
  bannerImport: $('banner-import'),
  bannerClose: $('banner-close'),
  drawer: $('drawer'),
  drawerKicker: $('drawer-kicker'),
  drawerTitle: $('drawer-title'),
  drawerBody: $('drawer-body'),
  drawerClose: $('btn-drawer-close'),
  replaybar: $('replaybar'),
  btnPlay: $('btn-play'),
  btnPrev: $('btn-prev'),
  btnNext: $('btn-next'),
  slider: $('replay-slider'),
  replayCurrent: $('replay-current'),
  replayCounter: $('replay-counter'),
  replayTime: $('replay-time'),
  replaySpeed: $('replay-speed'),
  btnImport: $('btn-import'),
  btnExport: $('btn-export'),
  exportMenu: $('export-menu'),
  btnHelp: $('btn-help'),
  toasts: $('toasts'),
  loading: $('loading-screen')
};

// ---------------------------------------------------------------------------
// 应用状态
// ---------------------------------------------------------------------------
const startedAt = performance.now();
let readyResolve;
const readyPromise = new Promise((resolve) => {
  readyResolve = resolve;
});
window.__chainlensReady = readyPromise;
window.__chainlensErrors = window.__chainlensErrors || [];

const state = {
  view: 'overview',
  scenarioId: null,
  cursor: null,
  critical: false,
  zoom: null,
  fit: false,
  focus: null,
  drawer: null,
  filters: emptyFilters(),
  tab: 'findings',
  attackCell: null,
  playing: false,
  speed: 1,
  loading: true,
  firstScreenMs: null
};

let store = null;
let chain = null;
let derived = null;
let scenario = null;
let initReport = null;
let scenarioList = [];
let activeView = null;
let currentRouteData = null;
let bannerDismissed = false;

const ctx = {
  get chain() {
    return chain;
  },
  get derived() {
    return derived;
  },
  get scenario() {
    return scenario;
  },
  get store() {
    return store;
  },
  state,
  actions: null
};

const shell = createShell({
  els,
  state,
  ctx,
  getChain: () => chain,
  getDerived: () => derived,
  getScenario: () => scenario,
  getScenarioList: () => scenarioList,
  getInitReport: () => initReport,
  isBannerDismissed: () => bannerDismissed
});

// ---------------------------------------------------------------------------
// 通用：Toast / 状态快照 / URL
// ---------------------------------------------------------------------------
function toast(message, type = 'info', duration = 3200) {
  if (!els.toasts) return;
  const iconName = type === 'success' ? 'check' : type === 'error' ? 'warning' : type === 'warn' ? 'warning' : 'info';
  const el = document.createElement('div');
  el.className = `toast is-${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(iconName)}<span>${esc(message)}</span>`;
  els.toasts.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  }, duration);
}

function snapshotState() {
  window.__chainlensState = {
    ready: Boolean(chain) && !state.loading,
    loading: state.loading,
    view: state.view,
    scenarioId: state.scenarioId,
    scenarioName: scenario?.name || '',
    source: scenario?.source || 'fallback',
    cursor: state.cursor,
    totalEvents: chain?.events.length || 0,
    complete: state.cursor === null || state.cursor >= (chain?.events.length || 0),
    critical: state.critical,
    zoom: state.zoom,
    fit: state.fit,
    focus: state.focus,
    drawer: state.drawer,
    playing: state.playing,
    filters: JSON.parse(JSON.stringify(state.filters)),
    tab: state.tab,
    attackCell: state.attackCell,
    quality: derived?.quality.score ?? null,
    nodes: chain?.nodes.length || 0,
    edges: chain?.edges.length || 0,
    events: chain?.events.length || 0,
    errors: window.__chainlensErrors.length,
    firstScreenMs: state.firstScreenMs
  };
  document.documentElement.dataset.chainlensReady = window.__chainlensState.ready ? '1' : '0';
  document.body.dataset.view = state.view;
}

function syncUrl() {
  if (!chain) return;
  const hash = buildRoute({
    view: state.view,
    scenarioId: state.scenarioId,
    cursor: state.cursor,
    critical: state.critical,
    zoom: state.zoom,
    fit: state.fit,
    focus: state.focus,
    filters: state.filters,
    tab: state.tab,
    tactic: state.attackCell?.tactic || null,
    technique: state.attackCell?.technique || null,
    data: currentRouteData || null
  });
  if (location.hash !== hash) {
    history.replaceState(null, '', hash);
  }
}

function buildLink(overrides = {}) {
  const hash = buildRoute({
    view: state.view,
    scenarioId: state.scenarioId,
    cursor: state.cursor,
    critical: state.critical,
    zoom: state.zoom,
    fit: state.fit,
    focus: state.focus,
    filters: state.filters,
    tab: state.tab,
    tactic: state.attackCell?.tactic || null,
    technique: state.attackCell?.technique || null,
    data: currentRouteData || null,
    ...overrides
  });
  return `${location.origin}${location.pathname}${location.search}${hash}`;
}

// ---------------------------------------------------------------------------
// 视图挂载
// ---------------------------------------------------------------------------
function mountActiveView() {
  if (activeView?.destroy) activeView.destroy();
  activeView = null;
  els.viewRoot.innerHTML = '';
  if (state.view === 'graph') activeView = createGraphView(ctx);
  else if (state.view === 'timeline') activeView = createTimelineView(ctx);
  else if (state.view === 'attack') activeView = createAttackView(ctx);
  else if (state.view === 'findings') activeView = createFindingsView(ctx);
  else if (state.view === 'report') activeView = createReportView(ctx);
  else if (state.view === 'about') activeView = createAboutView(ctx);
  else
    activeView = {
      mount: (root) => renderOverview(root, ctx),
      update: () => {},
      destroy: () => {}
    };
  activeView.mount(els.viewRoot);
  els.main.scrollTop = 0;
}

function updateActiveView() {
  if (activeView?.update) activeView.update();
  else if (activeView?.mount) activeView.mount(els.viewRoot);
}

// ---------------------------------------------------------------------------
// 状态提交
// ---------------------------------------------------------------------------
function commit(options = {}) {
  if (options.viewUpdate !== false) updateActiveView();
  shell.updateSidebarState();
  shell.updateReplayBar();
  shell.updateDrawer();
  shell.updateTabs();
  shell.updateTopbarScenarioOnly();
  if (options.url !== false) syncUrl();
  snapshotState();
}

// ---------------------------------------------------------------------------
// 数据切换 / 导入
// ---------------------------------------------------------------------------
function applyLoadedChain(loadedChain, descriptor, options = {}) {
  const resetFilters = options.resetFilters !== false;
  const mount = options.mount !== false;
  chain = loadedChain;
  derived = getDerived(chain);
  scenario = descriptor;
  state.scenarioId = descriptor.id;
  state.cursor = null;
  state.critical = false;
  state.zoom = null;
  state.fit = false;
  state.focus = null;
  state.drawer = null;
  state.attackCell = null;
  if (resetFilters) {
    state.filters = emptyFilters();
    state.tab = 'findings';
    els.searchInput.value = '';
  }
  scenarioList = store.getScenarios();
  shell.renderScenarioOptions();
  shell.renderSidebar();
  if (mount) {
    mountActiveView();
    shell.updateReplayBar();
    shell.updateDrawer();
    shell.updateTabs();
  }
  snapshotState();
}

async function switchScenario(id, options = {}) {
  if (!store || !id) return;
  const descriptor = store.getScenario(id);
  if (!descriptor) {
    toast(`场景不存在：${id}`, 'error');
    return;
  }
  if (id === state.scenarioId && chain && !options.force) return;
  replay.pause({ sync: false });
  els.scenarioSelect.disabled = true;
  try {
    const loaded = await store.loadScenario(id);
    applyLoadedChain(loaded, store.getScenario(id), { resetFilters: options.resetFilters !== false });
    initReport = { ...(initReport || {}), scenarioError: null };
    shell.updateBanner();
    if (options.silent !== true) toast(`已切换到「${store.getScenario(id).name}」`, 'success');
    if (options.applyRoute) {
      applyRouteExtras(options.applyRoute);
    }
    syncUrl();
    shell.updateTopbar();
  } catch (error) {
    toast(`场景加载失败：${error.message}`, 'error', 5000);
    els.scenarioSelect.value = state.scenarioId || FALLBACK_SCENARIO_ID;
  } finally {
    els.scenarioSelect.disabled = false;
  }
}

function importChain(importedChain, fileName) {
  if (!store) return;
  replay.pause({ sync: false });
  const descriptor = store.addImported(importedChain, fileName);
  applyLoadedChain(importedChain, descriptor, true);
  initReport = { ...(initReport || {}), scenarioError: null };
  shell.updateBanner();
  syncUrl();
  shell.updateTopbar();
  const warnings = importedChain.warnings.length;
  toast(
    `已载入自定义场景「${descriptor.name}」：${importedChain.stats.acceptedRecords} 条记录${
      warnings ? `，${warnings} 个警告` : ''
    }`,
    warnings ? 'warn' : 'success',
    4500
  );
}

// ---------------------------------------------------------------------------
// 路由
// ---------------------------------------------------------------------------
function applyRouteExtras(route) {
  if (route.cursor !== null) state.cursor = normalizeCursor(chain, route.cursor);
  else state.cursor = null;
  state.critical = Boolean(route.critical);
  state.zoom = route.zoom ?? null;
  state.fit = Boolean(route.fit);
  if (route.filters) state.filters = normalizeFilters(route.filters);
  if (route.tab) state.tab = route.tab;
  if (route.tactic && route.technique) state.attackCell = { tactic: route.tactic, technique: route.technique };
  else state.attackCell = null;
  if (route.focus && derived.nodeMap.has(route.focus)) {
    state.focus = route.focus;
    state.drawer = { kind: 'node', id: route.focus };
  } else {
    state.focus = null;
    state.drawer = null;
  }
  if (route.scenarioId && route.scenarioId !== state.scenarioId) {
    // 场景切换由 applyRoute 处理
  }
  els.searchInput.value = state.filters.q || '';
  shell.updateSidebarState();
}

async function applyRoute(route) {
  if (!chain) return;
  els.searchInput.value = route.filters.q || '';
  if (route.scenarioId && route.scenarioId !== state.scenarioId) {
    const currentData = route.data;
    currentRouteData = currentData || null;
    await switchScenario(route.scenarioId, { applyRoute: route, silent: true, resetFilters: false });
    if (route.data) currentRouteData = route.data;
    state.view = route.view;
    mountActiveView();
    commit();
    return;
  }
  if (route.data) currentRouteData = route.data;
  const viewChanged = route.view !== state.view;
  state.view = route.view;
  applyRouteExtras(route);
  if (viewChanged) {
    mountActiveView();
  } else {
    updateActiveView();
  }
  commit();
}

// ---------------------------------------------------------------------------
// 导出与深链
// ---------------------------------------------------------------------------
function exportFindingsCsv() {
  if (!derived) return;
  const count = writeFindingsCsv(derived.findings, scenario?.name);
  toast(`已导出 ${count} 项风险发现`, 'success');
}

function exportEvidenceJson() {
  if (!derived) return;
  const count = writeEvidenceJson(derived.evidenceList, scenario?.name);
  toast(`已导出 ${count} 条证据`, 'success');
}

function exportReportJson() {
  if (!derived) return;
  writeReportJson(ctx, scenario?.name);
  toast('报告 JSON 已导出', 'success');
}

async function copyCurrentLink(overrides = {}) {
  syncUrl();
  const ok = await copyText(buildLink(overrides));
  toast(ok ? '深链已复制到剪贴板' : '复制失败，请检查剪贴板权限', ok ? 'success' : 'error');
}

function closeExportMenu() {
  els.exportMenu.hidden = true;
  els.btnExport.setAttribute('aria-expanded', 'false');
}

function toggleExportMenu() {
  const hidden = !els.exportMenu.hidden;
  els.exportMenu.hidden = hidden;
  els.btnExport.setAttribute('aria-expanded', String(!hidden));
}

async function handleExport(kind) {
  if (!chain) return;
  if (kind === 'findings') exportFindingsCsv();
  else if (kind === 'evidence') exportEvidenceJson();
  else if (kind === 'report') exportReportJson();
  else if (kind === 'link') await copyCurrentLink();
  closeExportMenu();
}

// ---------------------------------------------------------------------------
// 动作集合
// ---------------------------------------------------------------------------
const actions = {
  toast,
  selectNode(id) {
    if (!derived?.nodeMap.has(id)) return;
    state.focus = id;
    state.drawer = { kind: 'node', id };
    commit();
  },
  openDrawer({ kind = 'node', id }) {
    if (!id) return;
    state.drawer = { kind, id };
    if (kind === 'node' && derived.nodeMap.has(id)) state.focus = id;
    commit();
  },
  closeDrawer() {
    state.drawer = null;
    state.focus = null;
    commit();
  },
  clearSelection() {
    state.drawer = null;
    state.focus = null;
    commit();
  },
  goto(view, patch = {}) {
    if (!VIEWS.some((item) => item.id === view) && view !== 'about') return;
    const viewChanged = view !== state.view;
    if (viewChanged) replay.pause({ sync: false });
    state.view = view;
    if (patch.critical !== undefined) state.critical = Boolean(patch.critical);
    if (patch.focus !== undefined) {
      state.focus = patch.focus && derived.nodeMap.has(patch.focus) ? patch.focus : null;
    }
    if (patch.tab) state.tab = patch.tab;
    if (patch.cursor !== undefined) state.cursor = normalizeCursor(chain, patch.cursor);
    if (patch.attackCell !== undefined) state.attackCell = patch.attackCell;
    if (patch.filters) state.filters = normalizeFilters(patch.filters);
    if (viewChanged) mountActiveView();
    else updateActiveView();
    commit();
  },
  toggleCritical() {
    state.critical = !state.critical;
    updateActiveView();
    shell.updateReplayBar();
    syncUrl();
    snapshotState();
  },
  /** 链路图缩放/适配状态同步到 URL（zoom/fit 深链参数） */
  syncGraphView(viewport = {}) {
    if (viewport.zoom !== undefined && viewport.zoom !== null) {
      state.zoom = Math.round(clamp(Number(viewport.zoom), 0.3, 2.5) * 100) / 100;
    } else if (viewport.zoom === null) {
      state.zoom = null;
    }
    if (viewport.fit !== undefined) state.fit = Boolean(viewport.fit);
    syncUrl();
    snapshotState();
  },
  setCursor(value, options = {}) {
    replay.seek(value, options);
  },
  step(delta) {
    if (!chain) return;
    replay.pause({ sync: false, silent: true });
    const next = stepCursor(chain, state.cursor, delta);
    state.cursor = next >= chain.events.length ? null : next;
    updateActiveView();
    shell.updateReplayBar();
    snapshotState();
    syncUrl();
  },
  play: () => replay.play(),
  pause: (options) => replay.pause(options),
  togglePlay: () => replay.togglePlay(),
  setSpeed(speed) {
    const value = Number(speed);
    if (!Number.isFinite(value) || value <= 0) return;
    state.speed = value;
    shell.updateReplayBar();
    if (state.playing) replay.schedulePlayback();
  },
  resetFilters() {
    state.filters = emptyFilters();
    els.searchInput.value = '';
    updateActiveView();
    commit();
  },
  setFilters(filters) {
    state.filters = normalizeFilters(filters);
    updateActiveView();
    commit();
  },
  setTab(tab) {
    state.tab = tab === 'evidence' ? 'evidence' : 'findings';
    updateActiveView();
    commit();
  },
  setAttackCell(cell) {
    state.attackCell = cell
      ? { tactic: cell.tactic, technique: cell.technique, name: cell.name || '' }
      : null;
    updateActiveView();
    commit();
  },
  switchScenario(id) {
    switchScenario(id);
  },
  openImport() {
    openImportModal({ onImport: importChain, toast });
  },
  async runBench() {
    const result = await benchScenario(store, state.scenarioId);
    toast(
      result.error
        ? `bench 失败：${result.error}`
        : `bench：解析 ${result.parseMs}ms · 布局 ${result.layoutMs}ms · 渲染 ${result.renderMs}ms`,
      result.error ? 'error' : 'success',
      4500
    );
    return result;
  },
  copyDeepLink(overrides = {}) {
    return copyCurrentLink(overrides);
  }
};
ctx.actions = actions;

const replay = createReplayController({
  state,
  getChain: () => chain,
  getDerived: () => derived,
  syncUrl,
  snapshotState,
  updateActiveView,
  updateReplayBar: shell.updateReplayBar,
  gotoView: (view) => actions.goto(view)
});

const interactions = createInteractions({
  getChain: () => chain,
  getDerived: () => derived,
  actions,
  toast,
  handleExport
});

const keyboardHandler = createKeyboardHandler({
  state,
  actions,
  els,
  getActiveView: () => activeView,
  closeExportMenu,
  isExportMenuOpen: () => !els.exportMenu.hidden,
  isImportOpen,
  closeImportModal
});

// ---------------------------------------------------------------------------
// 抽屉内动作 / 全局点击委托
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 事件绑定
// ---------------------------------------------------------------------------
function bindUI() {
  els.viewTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-view]');
    if (!tab) return;
    actions.goto(tab.dataset.view);
  });

  els.scenarioSelect.addEventListener('change', () => {
    switchScenario(els.scenarioSelect.value);
  });

  els.searchInput.addEventListener(
    'input',
    debounce(() => {
      state.filters = { ...state.filters, q: els.searchInput.value.trim() };
      updateActiveView();
      commit();
    }, 160)
  );

  els.sidebarFilters.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-filter-group]');
    if (!input) return;
    const group = input.dataset.filterGroup;
    const values = new Set(state.filters[group] || []);
    if (input.checked) values.add(input.value);
    else values.delete(input.value);
    state.filters = { ...state.filters, [group]: [...values] };
    updateActiveView();
    commit();
  });

  els.resetFilters.addEventListener('click', () => actions.resetFilters());

  els.viewRoot.addEventListener('click', (event) => {
    if (interactions.handleCommonClick(event)) return;
    const tabBtn = event.target.closest?.('[data-tab]');
    if (tabBtn) actions.setTab(tabBtn.dataset.tab);
  });
  els.viewRoot.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const target = event.target.closest?.('[data-goto], [data-open-node], [data-open-event], [data-open-evidence]');
    if (target) {
      event.preventDefault();
      interactions.handleCommonClick(event);
    }
  });

  els.drawerBody.addEventListener('click', (event) => {
    if (interactions.handleCommonClick(event)) return;
    const actionBtn = event.target.closest?.('[data-drawer-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.drawerAction;
    if (action === 'timeline-node') interactions.timelineLocateNode(actionBtn.dataset.nodeId);
    else if (action === 'timeline-event') actions.goto('timeline', { cursor: Number(actionBtn.dataset.cursor) });
    else if (action === 'copy-node-link') copyCurrentLink({ view: 'graph', focus: actionBtn.dataset.nodeId });
    else if (action === 'copy-event-link')
      copyCurrentLink({ view: 'timeline', cursor: Number(actionBtn.dataset.cursor), focus: null });
    else if (action === 'copy-evidence-id') {
      copyText(actionBtn.dataset.evidenceId).then((ok) =>
        toast(ok ? '证据 ID 已复制' : '复制失败', ok ? 'success' : 'error')
      );
    }
  });

  els.drawerClose.addEventListener('click', () => actions.closeDrawer());

  els.btnPlay.addEventListener('click', () => actions.togglePlay());
  els.btnPrev.addEventListener('click', () => actions.step(-1));
  els.btnNext.addEventListener('click', () => actions.step(1));
  els.slider.addEventListener('input', () => {
    replay.seek(Number(els.slider.value), { sync: false, pause: true });
  });
  els.slider.addEventListener('change', () => {
    replay.seek(Number(els.slider.value), { sync: true, pause: true });
  });
  els.replaySpeed.addEventListener('change', () => actions.setSpeed(els.replaySpeed.value));

  els.btnImport.addEventListener('click', () => actions.openImport());
  els.bannerImport.addEventListener('click', () => actions.openImport());
  els.bannerClose.addEventListener('click', () => {
    bannerDismissed = true;
    els.dataBanner.hidden = true;
  });
  els.btnHelp.addEventListener('click', () => actions.goto('about'));

  els.btnExport.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleExportMenu();
  });
  els.exportMenu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-export]');
    if (!item) return;
    handleExport(item.dataset.export);
  });
  document.addEventListener('click', (event) => {
    if (!els.exportMenu.hidden && !event.target.closest('.menu-wrap')) closeExportMenu();
  });

  els.main.addEventListener('scroll', hideTooltip, { passive: true });

  window.addEventListener('hashchange', () => {
    const route = parseRoute(location.hash);
    applyRoute(route).catch((error) => {
      console.warn('[ChainLens] 路由应用失败', error);
      toast('深链应用失败，请检查参数', 'error');
    });
  });

  document.addEventListener('keydown', keyboardHandler);
  window.addEventListener('beforeunload', () => replay.clearPlayTimer());
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
function showFatalError(message) {
  els.viewRoot.innerHTML = `<div class="view"><div class="empty-state" style="margin-top:8vh">
    ${icon('warning')}<strong>无法加载链路数据</strong><span>${esc(message)}</span>
    <div style="margin-top:10px"><button class="btn btn-primary" type="button" id="fatal-import">${icon(
      'import'
    )}导入 JSONL 数据</button></div>
  </div></div>`;
  document.getElementById('fatal-import')?.addEventListener('click', () => actions.openImport());
  els.app.classList.remove('is-loading');
  els.loading.classList.add('is-hidden');
  state.loading = false;
  snapshotState();
}

function hideLoading() {
  els.app.classList.remove('is-loading');
  els.loading.classList.add('is-hidden');
  state.loading = false;
}

async function boot() {
  shell.renderTabs();
  bindUI();
  const route = parseRoute(location.hash || '');
  currentRouteData = route.data;
  store = new DataStore();
  state.loading = true;
  let init;
  try {
    const bootParams = new URLSearchParams(location.search);
    init = await store.init({
      scenarioId: route.scenarioId || null,
      dataPath: route.data || null,
      forceFallback: bootParams.get('offline') === '1' || bootParams.get('fallback') === '1'
    });
  } catch (error) {
    showFatalError(error.message || String(error));
    readyResolve();
    return;
  }
  initReport = init;
  if (!init.chain) {
    showFatalError('数据层没有返回可用的链路数据');
    readyResolve();
    return;
  }
  applyLoadedChain(init.chain, store.getScenario(init.activeId), { mount: false });
  state.view = route.view || 'overview';
  if (route.scenarioId && route.data) currentRouteData = route.data;
  applyRouteExtras(route);
  state.loading = false;
  mountActiveView();
  shell.renderScenarioOptions();
  shell.updateBanner();
  shell.updateTabs();
  shell.updateReplayBar();
  shell.updateDrawer();
  shell.updateSidebarState();
  syncUrl();
  hideLoading();
  state.firstScreenMs = Math.round(performance.now() - startedAt);
  snapshotState();
  if (
    location.hash !==
    buildRoute({
      view: state.view,
      scenarioId: state.scenarioId,
      cursor: state.cursor,
      critical: state.critical,
      zoom: state.zoom,
      fit: state.fit,
      focus: state.focus,
      filters: state.filters,
      tab: state.tab,
      tactic: state.attackCell?.tactic || null,
      technique: state.attackCell?.technique || null,
      data: currentRouteData
    })
  ) {
    syncUrl();
  }
  readyResolve();
  // 自检入口：?selftest=1
  const params = new URLSearchParams(location.search);
  if (params.get('selftest') === '1') {
    const summary = summarise(chain);
    const report = {
      at: new Date().toISOString(),
      scenario: state.scenarioId,
      summary,
      firstScreenMs: state.firstScreenMs,
      layoutMs: null,
      errors: window.__chainlensErrors.length,
      view: state.view
    };
    console.info('[ChainLens selftest]', JSON.stringify(report, null, 2));
    window.__chainlensSelftest = report;
  }
}

// 暴露 window.ChainLens（规格 5.1 / 5.7）
const ChainLens = {
  version: '1.0.0',
  get app() {
    return {
      state,
      actions,
      get scenario() {
        return scenario;
      },
      get ready() {
        return readyPromise;
      },
      store
    };
  },
  get data() {
    return chain;
  },
  get derived() {
    return derived;
  },
  analytics: analyticsApi,
  layout: layoutApi,
  parser: { parseChain },
  bench: (scenarioId) => benchScenario(store, scenarioId || state.scenarioId),
  actions,
  report: { buildReportModel, buildReportMarkdown },
  ready: readyPromise
};
window.ChainLens = ChainLens;
window.__chainlensState = { ready: false, loading: true };

boot().catch((error) => {
  console.warn('[ChainLens] 启动失败', error);
  showFatalError(error.message || String(error));
  readyResolve();
});
