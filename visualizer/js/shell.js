/**
 * 应用外壳渲染：顶栏 Tab、场景选择器、数据来源提示条、筛选侧栏、
 * 详情抽屉、回放条与质量卡。由 app.js 注入状态读取器，便于维护与拆分。
 */
import { RESULTS, SEVERITIES, STAGES, VIEWS } from './constants.js';
import { buildDrawerContent } from './components/drawer.js';
import { activeFilterCount } from './filtering.js';
import { viewIcon } from './icons.js';
import { esc } from './util.js';
import { fmtClockSec, stageZh } from './format.js';

/**
 * @param {{
 *  els: object, state: object, ctx: object,
 *  getChain: () => object, getDerived: () => object, getScenario: () => object,
 *  getScenarioList: () => object[], getInitReport: () => object,
 *  isBannerDismissed: () => boolean
 * }} deps
 */
export function createShell(deps) {
  const { els, state, ctx, getChain, getDerived, getScenario, getScenarioList, getInitReport, isBannerDismissed } = deps;

  function renderTabs() {
    els.viewTabs.innerHTML = VIEWS.map(
      (view) =>
        `<button class="view-tab" type="button" role="tab" data-view="${view.id}" aria-selected="${
          state.view === view.id
        }" aria-label="${esc(view.zh)}"><span>${viewIcon(view.id)}</span><span class="view-tab-label">${esc(
          view.zh
        )}</span><kbd>${view.shortcut}</kbd></button>`
    ).join('');
  }

  function updateTabs() {
    for (const tab of els.viewTabs.querySelectorAll('[data-view]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
    }
  }

  function renderScenarioOptions() {
    const scenarioList = getScenarioList();
    const options = scenarioList
      .map(
        (item) =>
          `<option value="${esc(item.id)}"${item.id === state.scenarioId ? ' selected' : ''}>${esc(item.name)}${
            item.builtin ? '（内置）' : item.custom ? '（导入）' : ''
          }</option>`
      )
      .join('');
    els.scenarioSelect.innerHTML = options;
    const current = scenarioList.find((item) => item.id === state.scenarioId);
    const badge = els.scenarioBadge;
    if (!badge) return;
    const source = current?.source || (current?.builtin ? 'fallback' : 'manifest');
    const label = current?.builtin ? 'FALLBACK' : current?.custom ? 'IMPORT' : source === 'dev' ? 'DEV' : 'MANIFEST';
    badge.textContent = label;
    badge.classList.toggle('is-live', label === 'MANIFEST');
    badge.classList.toggle('is-fallback', label === 'FALLBACK' || label === 'DEV');
  }

  function updateBanner() {
    const report = getInitReport();
    if (!report) return;
    let message = '';
    if (!report.manifestAvailable && !isBannerDismissed()) {
      message = `未检测到 data/manifest.json${report.manifestError ? `（${report.manifestError}）` : ''}，当前使用内置演示数据。可点击“导入 JSONL”加载自己的链路。`;
    } else if (report.scenarioError && !isBannerDismissed()) {
      message = `${report.scenarioError}。已回退到内置演示数据。`;
    }
    if (message) {
      els.dataBannerText.textContent = message;
      els.dataBanner.hidden = false;
    } else {
      els.dataBanner.hidden = true;
    }
  }

  function qualityCardMarkup() {
    const chain = getChain();
    const quality = getDerived().quality;
    const radius = 15.5;
    const circumference = 2 * Math.PI * radius;
    const length = (quality.score / 100) * circumference;
    const color =
      quality.score >= 90 ? '#10b981' : quality.score >= 75 ? '#22d3ee' : quality.score >= 55 ? '#f59e0b' : '#ef4444';
    return `<div class="quality-ring"><svg viewBox="0 0 38 38" aria-hidden="true"><circle class="q-bg" cx="19" cy="19" r="${radius}"></circle><circle class="q-fill" cx="19" cy="19" r="${radius}" style="stroke:${color};stroke-dasharray:${length.toFixed(
      1
    )} ${circumference.toFixed(1)}"></circle></svg><span class="q-value">${quality.score}</span></div>
      <div class="quality-meta"><div class="quality-title"><span>数据质量</span><span style="color:${color};font-weight:600">${esc(
      quality.label
    )}</span></div><div class="quality-sub">${quality.errors} 错误 · ${quality.warnings} 警告 · ${esc(
      String(chain.stats.acceptedRecords)
    )} 条记录</div></div>`;
  }

  function renderSidebar() {
    const chain = getChain();
    const derived = getDerived();
    if (!chain || !derived) return;
    const stageOptions = STAGES.map((stage) => {
      const counts = derived.stageCounts.find((item) => item.id === stage.id);
      return { id: stage.id, zh: stage.zh, color: stage.color, count: counts?.nodes || 0 };
    });
    const typeOptions = derived.nodeTypeCounts
      .filter((type) => type.count > 0)
      .map((type) => ({ id: type.id, zh: type.zh, color: type.color, count: type.count }));
    const severityOptions = SEVERITIES.map((severity) => ({
      id: severity.id,
      zh: severity.zh,
      color: severity.color,
      count: derived.severityCounts.find((item) => item.id === severity.id)?.count || 0
    }));
    const resultOptions = RESULTS.map((result) => ({
      id: result.id,
      zh: result.zh,
      color: result.color,
      count: chain.events.filter((event) => event.result === result.id).length
    }));

    const section = (title, group, options) => `<div class="filter-section" data-group="${group}">
      <div class="filter-section-head"><span class="filter-section-title">${esc(title)}</span></div>
      <div class="filter-list">${options
        .map(
          (option) =>
            `<label class="filter-option"><input type="checkbox" data-filter-group="${group}" value="${esc(
              option.id
            )}"><span class="filter-check"></span><span class="filter-swatch" style="--c:${option.color}"></span><span class="filter-label">${esc(
              option.zh
            )}</span><span class="filter-count">${option.count}</span></label>`
        )
        .join('')}</div>
    </div>`;

    els.sidebarFilters.innerHTML =
      section('阶段', 'stages', stageOptions) +
      section('节点类型', 'types', typeOptions) +
      section('严重度', 'severities', severityOptions) +
      section('事件结果', 'results', resultOptions);
    els.qualityCard.innerHTML = qualityCardMarkup();
    updateSidebarState();
  }

  function updateSidebarState() {
    if (!state.filters) return;
    if (els.searchInput.value !== state.filters.q && document.activeElement !== els.searchInput) {
      els.searchInput.value = state.filters.q;
    }
    for (const input of els.sidebarFilters.querySelectorAll('input[data-filter-group]')) {
      const group = input.dataset.filterGroup;
      input.checked = (state.filters[group] || []).includes(input.value);
    }
    const count = activeFilterCount(state.filters);
    els.activeFilterCount.hidden = count === 0;
    els.activeFilterCount.textContent = String(count);
  }

  function updateDrawer() {
    if (!getChain()) return;
    const content = buildDrawerContent(ctx);
    if (!content) {
      els.drawer.hidden = true;
      els.app.classList.remove('drawer-open');
      if (state.drawer) {
        state.drawer = null;
        state.focus = null;
      }
      return;
    }
    els.drawer.hidden = false;
    els.app.classList.add('drawer-open');
    els.drawerKicker.innerHTML = content.kicker;
    els.drawerTitle.innerHTML = content.title;
    els.drawerBody.innerHTML = content.html;
    els.drawerBody.scrollTop = 0;
  }

  function updateReplayBar() {
    const chain = getChain();
    const visible = state.view === 'graph' || state.view === 'timeline';
    els.replaybar.hidden = !visible;
    els.app.classList.toggle('has-replay', visible);
    if (!visible || !chain) return;
    const total = chain.events.length;
    const cursor = state.cursor === null ? total : Math.min(state.cursor, total);
    els.slider.max = String(total);
    els.slider.value = String(cursor);
    const ratio = total ? (cursor / total) * 100 : 0;
    els.slider.style.setProperty('--progress', `${ratio}%`);
    els.replayCounter.textContent = `${cursor} / ${total}`;
    const current = cursor > 0 ? chain.events[cursor - 1] : null;
    if (!current) {
      els.replayCurrent.textContent = total ? '回放尚未开始' : '当前场景没有事件';
    } else {
      els.replayCurrent.textContent = `${fmtClockSec(current.ts)} · ${stageZh(current.stage)} · ${current.summary}`;
    }
    els.replayTime.textContent = current ? fmtClockSec(current.ts) : '—';
    els.btnPrev.disabled = cursor <= 0;
    els.btnNext.disabled = cursor >= total;
    const playing = state.playing;
    els.btnPlay.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${playing ? 'pause' : 'play'}"></use></svg>`;
    els.btnPlay.setAttribute('aria-label', playing ? '暂停回放（Space）' : '播放回放（Space）');
    els.replaySpeed.value = String(state.speed);
  }

  function updateTopbar() {
    renderScenarioOptions();
    updateTabs();
    const chain = getChain();
    const scenario = getScenario();
    document.title = chain ? `${scenario?.name || 'ChainLens'} · ChainLens` : 'ChainLens · 探索链路可视化';
  }

  function updateTopbarScenarioOnly() {
    const scenarioList = getScenarioList();
    if (!scenarioList.length) return;
    const current = scenarioList.find((item) => item.id === state.scenarioId);
    if (current) els.scenarioSelect.value = current.id;
  }

  return {
    renderTabs,
    updateTabs,
    renderScenarioOptions,
    updateBanner,
    qualityCardMarkup,
    renderSidebar,
    updateSidebarState,
    updateDrawer,
    updateReplayBar,
    updateTopbar,
    updateTopbarScenarioOnly
  };
}
