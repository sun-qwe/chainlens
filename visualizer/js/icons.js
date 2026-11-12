/**
 * 内联 SVG 图标辅助：图标 sprite 定义在 index.html 中，不加载任何外部资源。
 */
import { NODE_TYPE_MAP } from './constants.js';

/** 生成 <svg><use href="#i-xxx"></use></svg> */
export function icon(name, className = '') {
  return `<svg class="icon${className ? ` ${className}` : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

/** 节点类型图标 */
export function typeIcon(type, className = '') {
  const spec = NODE_TYPE_MAP.get(type);
  return icon(spec?.icon || 'cube', className);
}

/** 视图图标 */
export function viewIcon(viewId) {
  const map = {
    overview: 'target',
    graph: 'layers',
    timeline: 'clock',
    attack: 'shield',
    findings: 'alert',
    report: 'report',
    about: 'help'
  };
  return icon(map[viewId] || 'grid');
}
