/**
 * 回放控制器：播放 / 暂停 / 步进 / 定位，节奏基于事件间隔的归一化映射。
 * 与 DOM 解耦，通过注入的渲染回调更新界面。
 */
import { clamp } from './util.js';

/**
 * @param {{
 *  state: object, els: object, getChain: () => object, getDerived: () => object,
 *  syncUrl: () => void, snapshotState: () => void,
 *  updateActiveView: () => void, updateReplayBar: () => void, gotoView: (view:string) => void
 * }} deps
 */
export function createReplayController(deps) {
  const { state, getChain, getDerived, syncUrl, snapshotState, updateActiveView, updateReplayBar, gotoView } = deps;
  let playTimer = null;

  function clearPlayTimer() {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
  }

  function pause(options = {}) {
    if (!state.playing && !playTimer) {
      if (options.silent !== true) updateReplayBar();
      return;
    }
    state.playing = false;
    clearPlayTimer();
    updateReplayBar();
    if (options.sync !== false) syncUrl();
    snapshotState();
  }

  function schedulePlayback() {
    clearPlayTimer();
    const chain = getChain();
    if (!state.playing || !chain) return;
    const total = chain.events.length;
    if ((state.cursor ?? 0) >= total) {
      state.playing = false;
      updateReplayBar();
      syncUrl();
      snapshotState();
      return;
    }
    const index = state.cursor ?? 0;
    const base = getDerived().playback[index]?.baseDelayMs || 700;
    const delay = Math.round(base / Math.max(0.25, state.speed));
    playTimer = setTimeout(() => {
      state.cursor = (state.cursor ?? 0) + 1;
      updateActiveView();
      updateReplayBar();
      snapshotState();
      schedulePlayback();
    }, delay);
  }

  function play() {
    const chain = getChain();
    if (!chain || !chain.events.length) return;
    if (state.view !== 'graph' && state.view !== 'timeline') gotoView('timeline');
    if (state.cursor === null || state.cursor >= chain.events.length) state.cursor = 0;
    state.playing = true;
    updateActiveView();
    updateReplayBar();
    schedulePlayback();
  }

  function togglePlay() {
    if (state.playing) pause();
    else play();
  }

  function seek(value, options = {}) {
    const chain = getChain();
    if (!chain) return;
    const total = chain.events.length;
    const next = clamp(Math.floor(Number(value) || 0), 0, total);
    state.cursor = next >= total ? null : next;
    if (options.pause !== false) pause({ sync: false, silent: true });
    updateActiveView();
    updateReplayBar();
    snapshotState();
    if (options.sync !== false) syncUrl();
  }

  return { clearPlayTimer, pause, play, togglePlay, seek, schedulePlayback };
}
