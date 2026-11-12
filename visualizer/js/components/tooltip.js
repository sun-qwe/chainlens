/**
 * 全局单例 Tooltip（节点 / 边 / 时间线事件 / ATT&CK 单元格共用）。
 */
let tooltipEl = null;
let hideTimer = null;
let currentHtml = '';

function ensureEl() {
  if (tooltipEl && tooltipEl.isConnected) return tooltipEl;
  tooltipEl = document.getElementById('tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'tooltip';
    tooltipEl.className = 'tooltip';
    tooltipEl.hidden = true;
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function position(x, y) {
  const el = ensureEl();
  const padding = 14;
  const width = el.offsetWidth || 240;
  const height = el.offsetHeight || 64;
  let left = x + padding;
  let top = y + padding;
  if (left + width > window.innerWidth - 8) left = x - width - padding;
  if (top + height > window.innerHeight - 8) top = y - height - padding;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}

/** 显示 tooltip（html 为已转义的 HTML 片段） */
export function showTooltip(html, x, y) {
  const el = ensureEl();
  if (html !== currentHtml) {
    el.innerHTML = html;
    currentHtml = html;
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  el.hidden = false;
  position(x, y);
}

/** 跟随鼠标移动 */
export function moveTooltip(x, y) {
  if (!tooltipEl || tooltipEl.hidden) return;
  position(x, y);
}

/** 隐藏 tooltip */
export function hideTooltip() {
  if (!tooltipEl) return;
  hideTimer = setTimeout(() => {
    tooltipEl.hidden = true;
    currentHtml = '';
  }, 40);
}

export function tooltipElRef() {
  return ensureEl();
}
