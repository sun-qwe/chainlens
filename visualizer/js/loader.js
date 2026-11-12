/**
 * 数据加载：manifest 场景清单 → 场景 JSONL → 归一化；失败时加载内置兜底数据。
 * 只访问同源 ../data/ 下的文件，不发任何外部请求。
 */
import { FALLBACK_SCENARIO, FALLBACK_SCENARIO_ID, createFallbackRecords, fallbackJsonl } from './fallback-data.js';
import { parseChain } from './parser.js';

const MANIFEST_TIMEOUT = 4000;
const SCENARIO_TIMEOUT = 15000;

/** 带超时的 fetch 文本 */
async function fetchText(url, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json, text/plain; charset=utf-8, */*' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`${label}读取超时（${timeoutMs}ms）`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isScenarioDescriptor(value) {
  return value && typeof value === 'object' && typeof value.id === 'string' && value.id && typeof value.name === 'string';
}

export class DataStore {
  constructor(options = {}) {
    this.baseUrl = new URL(options.dataBase || '../data/', document.baseURI);
    this.scenarios = [];
    this.manifest = null;
    this.manifestAvailable = false;
    this.manifestError = null;
    this.chainCache = new Map();
    this.rawCache = new Map();
    this.activeId = null;
    this.importCounter = 0;
    this.lastLoad = null;
  }

  /** 初始化：读取 manifest，确定默认场景；任何失败都回退到内置数据 */
  async init(options = {}) {
    let requestedId = options.scenarioId || null;
    const report = {
      manifestAvailable: false,
      manifestError: null,
      scenarioError: null,
      source: 'fallback',
      requestedId
    };

    // 离线自检：?offline=1 强制使用内置演示数据，不请求 manifest
    if (options.forceFallback) {
      this.manifestError = '离线模式（?offline=1）';
      report.manifestError = this.manifestError;
      this.scenarios = [{ ...FALLBACK_SCENARIO }];
      const chain = await this.loadScenario(FALLBACK_SCENARIO_ID);
      report.source = 'fallback';
      this.lastLoad = { scenario: this.getScenario(FALLBACK_SCENARIO_ID), chain };
      return { ...report, scenarios: this.getScenarios(), activeId: this.activeId, chain };
    }

    // 开发/联调：允许 ?data=../data/fixtures/mini.jsonl 直接指定文件
    if (options.dataPath) {
      try {
        const url = new URL(options.dataPath, document.baseURI);
        const raw = await fetchText(url, SCENARIO_TIMEOUT, '数据文件');
        const chain = parseChain(raw, { source: 'dev', name: decodeURIComponent(url.pathname.split('/').pop() || '自定义数据') });
        const descriptor = {
          id: 'dev-data',
          name: chain.meta?.engagement?.name || '自定义数据文件',
          file: null,
          builtin: false,
          custom: true,
          source: 'dev',
          description: `通过 ?data= 加载：${options.dataPath}`
        };
        this.scenarios = [descriptor, { ...FALLBACK_SCENARIO }];
        this.chainCache.set(descriptor.id, chain);
        this.rawCache.set(descriptor.id, raw);
        this.activeId = descriptor.id;
        this.lastLoad = { scenario: descriptor, chain };
        report.source = 'dev';
        return { ...report, scenarios: this.getScenarios(), activeId: this.activeId, chain };
      } catch (error) {
        report.scenarioError = `指定数据文件加载失败：${error.message}`;
      }
    }

    try {
      const raw = await fetchText(new URL('manifest.json', this.baseUrl), MANIFEST_TIMEOUT, '数据集清单');
      const manifest = JSON.parse(raw);
      if (!manifest || !Array.isArray(manifest.scenarios) || !manifest.scenarios.length) {
        throw new Error('manifest.scenarios 为空或格式不正确');
      }
      const scenarios = manifest.scenarios.filter(isScenarioDescriptor).map((item, index) => ({
        ...item,
        order: index,
        source: 'manifest',
        builtin: false
      }));
      if (!scenarios.length) throw new Error('manifest 中没有合法的场景条目');
      this.manifest = manifest;
      this.manifestAvailable = true;
      this.scenarios = scenarios;
      report.manifestAvailable = true;
      report.source = 'manifest';
    } catch (error) {
      this.manifestError = error.message;
      report.manifestError = error.message;
    }

    // 兜底场景始终在列表最后
    this.scenarios.push({ ...FALLBACK_SCENARIO });

    const preferred =
      (requestedId && this.scenarios.find((s) => s.id === requestedId)) ||
      this.scenarios.find((s) => s.id !== FALLBACK_SCENARIO_ID) ||
      this.scenarios[0];

    try {
      const chain = await this.loadScenario(preferred.id);
      report.source = preferred.id === FALLBACK_SCENARIO_ID ? 'fallback' : report.source;
      this.lastLoad = { scenario: this.getScenario(preferred.id), chain };
      return { ...report, scenarios: this.getScenarios(), activeId: this.activeId, chain };
    } catch (error) {
      report.scenarioError = `${preferred.name} 加载失败：${error.message}`;
      const chain = await this.loadScenario(FALLBACK_SCENARIO_ID);
      report.source = 'fallback';
      this.lastLoad = { scenario: this.getScenario(FALLBACK_SCENARIO_ID), chain };
      return { ...report, scenarios: this.getScenarios(), activeId: this.activeId, chain };
    }
  }

  /** 场景描述列表（附带内置兜底与已导入场景） */
  getScenarios() {
    return this.scenarios.map((scenario) => {
      const chain = this.chainCache.get(scenario.id);
      return {
        ...scenario,
        actualStats: chain ? chain.stats : null
      };
    });
  }

  getScenario(id) {
    return this.scenarios.find((s) => s.id === id) || null;
  }

  getActiveScenario() {
    return this.getScenario(this.activeId);
  }

  /** 加载指定场景（带缓存）；失败抛错 */
  async loadScenario(id) {
    if (this.chainCache.has(id)) {
      this.activeId = id;
      return this.chainCache.get(id);
    }
    const scenario = this.getScenario(id);
    if (!scenario) throw new Error(`未知场景：${id}`);

    if (scenario.builtin || scenario.id === FALLBACK_SCENARIO_ID) {
      const records = createFallbackRecords();
      const chain = parseChain(records, { source: 'fallback', name: scenario.name });
      this.chainCache.set(id, chain);
      this.rawCache.set(id, fallbackJsonl());
      this.activeId = id;
      return chain;
    }

    if (!scenario.file) throw new Error('场景缺少 file 字段');
    const url = new URL(scenario.file, this.baseUrl);
    const raw = await fetchText(url, SCENARIO_TIMEOUT, '场景数据');
    const chain = parseChain(raw, { source: scenario.id, name: scenario.name });
    if (chain.fatal.length) {
      const reason = chain.fatal.map((issue) => issue.message).join('；');
      const error = new Error(reason || '数据校验失败');
      error.chain = chain;
      throw error;
    }
    this.chainCache.set(id, chain);
    this.rawCache.set(id, raw);
    this.activeId = id;
    return chain;
  }

  /** 注册导入的自定义场景（仅内存，不写磁盘） */
  addImported(chain, fileName) {
    this.importCounter += 1;
    const id = `custom-${this.importCounter}`;
    const name = chain.meta?.engagement?.name || fileName || '自定义场景';
    const descriptor = {
      id,
      name,
      file: null,
      builtin: false,
      custom: true,
      source: 'import',
      description: `导入文件：${fileName || '未命名'}（记录 ${chain.stats.acceptedRecords} 条，跳过 ${chain.stats.skippedLines} 行）`,
      importedAt: new Date().toISOString()
    };
    this.scenarios = this.scenarios.filter((s) => s.id !== id);
    // 插到兜底场景之前
    const fallbackIndex = this.scenarios.findIndex((s) => s.id === FALLBACK_SCENARIO_ID);
    if (fallbackIndex >= 0) this.scenarios.splice(fallbackIndex, 0, descriptor);
    else this.scenarios.push(descriptor);
    this.chainCache.set(id, chain);
    this.activeId = id;
    return descriptor;
  }

  /** 获取原始文本（bench 用）；内置场景返回 JSONL 文本 */
  async getRaw(id) {
    if (this.rawCache.has(id)) return this.rawCache.get(id);
    const scenario = this.getScenario(id);
    if (!scenario) throw new Error(`未知场景：${id}`);
    if (scenario.builtin || scenario.id === FALLBACK_SCENARIO_ID) {
      const raw = fallbackJsonl();
      this.rawCache.set(id, raw);
      return raw;
    }
    if (!scenario.file) throw new Error('该场景没有可读取的源文件（导入场景）');
    const raw = await fetchText(new URL(scenario.file, this.baseUrl), SCENARIO_TIMEOUT, '场景数据');
    this.rawCache.set(id, raw);
    return raw;
  }

  /** 清除缓存（重新读取数据时使用） */
  clearCache() {
    this.chainCache.clear();
    this.rawCache.clear();
  }
}

export { fetchText, MANIFEST_TIMEOUT, SCENARIO_TIMEOUT };
