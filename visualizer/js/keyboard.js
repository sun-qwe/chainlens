/**
 * 全局键盘快捷键：视图切换、播放、步进、适配、关键路径、Esc 关闭浮层。
 */
import { VIEWS } from './constants.js';
import { isTypingTarget } from './util.js';

function isInteractiveElement(target) {
  if (!target) return false;
  const tag = String(target.tagName || '').toLowerCase();
  return ['button', 'select', 'input', 'a', 'textarea'].includes(tag) || target.isContentEditable === true;
}

/**
 * @param {{
 *  state: object, actions: object, els: object,
 *  getActiveView: () => object|null,
 *  closeExportMenu: () => void, isExportMenuOpen: () => boolean,
 *  isImportOpen: () => boolean, closeImportModal: () => void
 * }} deps
 */
export function createKeyboardHandler(deps) {
  const { state, actions, els, getActiveView, closeExportMenu, isExportMenuOpen, isImportOpen, closeImportModal } = deps;

  return function onGlobalKeydown(event) {
    if (event.key === 'Escape') {
      if (isImportOpen()) {
        closeImportModal();
        return;
      }
      if (isExportMenuOpen()) {
        closeExportMenu();
        return;
      }
      if (state.drawer) {
        actions.closeDrawer();
        return;
      }
      return;
    }
    if (isTypingTarget(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === '/') {
      event.preventDefault();
      els.searchInput.focus();
      return;
    }
    const shortcutView = VIEWS.find((view) => view.shortcut === event.key);
    if (shortcutView) {
      event.preventDefault();
      actions.goto(shortcutView.id);
      return;
    }
    if (event.key === ' ') {
      if (isInteractiveElement(event.target)) return;
      if (state.view === 'graph' || state.view === 'timeline') {
        event.preventDefault();
        actions.togglePlay();
      }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (state.view !== 'graph' && state.view !== 'timeline') return;
      event.preventDefault();
      actions.step(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (event.key === 'f' || event.key === 'F') {
      if (state.view === 'graph') getActiveView()?.fit?.();
    } else if (event.key === 'c' || event.key === 'C') {
      if (state.view === 'graph') actions.toggleCritical();
    } else if (event.key === '?') {
      actions.goto('about');
    }
  };
}
