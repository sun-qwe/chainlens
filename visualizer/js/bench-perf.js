/**
 * 性能实验接口：解析耗时 / 布局耗时 / 首屏渲染耗时 / 内存占用（规格 5.7）。
 * 通过隐藏容器渲染一次完整 SVG；结果写入 window.__chainlensBench，可重复调用。
 */
import { layoutLayered } from './layout.js';
import { parseChain } from './parser.js';
import { renderGraphPreview } from './views/graph.js';

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * @param {object} store DataStore 实例
 * @param {string} scenarioId 场景 id
 */
export async function benchScenario(store, scenarioId) {
  if (!store) throw new Error('数据层尚未初始化');
  try {
    const fetchStart = performance.now();
    const raw = await store.getRaw(scenarioId);
    const fetchMs = performance.now() - fetchStart;
    const parseStart = performance.now();
    const parsed = parseChain(raw, { source: 'bench', name: scenarioId });
    const parseMs = performance.now() - parseStart;
    const layoutStart = performance.now();
    const layout = layoutLayered(parsed.nodes, parsed.edges);
    const layoutMs = performance.now() - layoutStart;
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;left:-20000px;top:0;width:1600px;height:1000px;overflow:hidden;pointer-events:none;opacity:0;';
    document.body.appendChild(host);
    const renderStart = performance.now();
    renderGraphPreview(host, parsed, layout);
    const renderMs = performance.now() - renderStart;
    const renderedNodes = host.querySelectorAll('.gnode').length;
    host.remove();
    const memory = performance.memory
      ? {
          usedMB: round2(performance.memory.usedJSHeapSize / 1048576),
          totalMB: round2(performance.memory.totalJSHeapSize / 1048576)
        }
      : null;
    const result = {
      scenarioId,
      records: parsed.stats.acceptedRecords,
      nodes: parsed.stats.nodes,
      edges: parsed.stats.edges,
      events: parsed.stats.events,
      fetchMs: round2(fetchMs),
      parseMs: round2(parseMs),
      layoutMs: round2(layoutMs),
      renderMs: round2(renderMs),
      firstScreenMs: round2(fetchMs + parseMs + layoutMs + renderMs),
      renderedNodes,
      memory,
      at: new Date().toISOString()
    };
    window.__chainlensBench = window.__chainlensBench || {};
    window.__chainlensBench[scenarioId] = result;
    return result;
  } catch (error) {
    return { scenarioId, error: error.message };
  }
}
