/**
 * 通用工具函数。
 * 本文件被算法模块（parser/analytics/layout/replay）引用，顶层不得访问 DOM，
 * 保证可以在 Node 的 node:test 中直接 import。
 */

/** 数值夹取 */
export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** 四舍五入到指定小数位（默认 1 位） */
export function round(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

/** 数组求和（支持映射函数） */
export function sum(arr, fn = (v) => v) {
  let total = 0;
  for (const item of arr) total += Number(fn(item)) || 0;
  return total;
}

/** 去重（保留首次出现顺序） */
export function uniq(arr) {
  return [...new Set(arr)];
}

/** 按 key 分组，返回 Map<key, T[]> */
export function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/** 取最大值的元素，空数组返回 null */
export function maxBy(arr, fn = (v) => v) {
  let best = null;
  let bestValue = -Infinity;
  for (const item of arr) {
    const value = Number(fn(item));
    if (Number.isFinite(value) && value > bestValue) {
      best = item;
      bestValue = value;
    }
  }
  return best;
}

/** 按 key 计数，返回 Map<key, number> */
export function countBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

/** 字符串 HTML 转义（用于拼接 SVG / HTML 模板） */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 属性值转义（与 esc 相同，语义更清晰） */
export const escAttr = esc;

/** 拼接 class */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** 稳定字符串哈希（FNV-1a 变体），用于确定性种子 */
export function hashSeed(str) {
  let h = 2166136261;
  const text = String(str);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 确定性伪随机数生成器 */
export function mulberry32(seed) {
  let a = hashSeed(seed) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 防抖 */
export function debounce(fn, wait = 150) {
  let timer = null;
  function wrapped(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  }
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

/** 截断长文本，超出时加省略号 */
export function truncate(text, maxLen = 24) {
  const s = String(text ?? '');
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(1, maxLen - 1))}…`;
}

/** 转义正则表达式中的特殊字符 */
export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 让出主线程一帧（浏览器/Node 均可用） */
export function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}

/** 日期解析（无效返回 NaN） */
export function parseTs(ts) {
  const n = Date.parse(String(ts ?? ''));
  return Number.isFinite(n) ? n : NaN;
}

/** CSV 单元格转义 */
export function csvCell(value) {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 通用深拷贝（仅用于纯数据，不处理函数/DOM） */
export function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  const out = {};
  for (const key of Object.keys(value)) out[key] = deepClone(value[key]);
  return out;
}

/** 判断焦点是否在输入控件中（键盘快捷键用） */
export function isTypingTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable === true;
}
