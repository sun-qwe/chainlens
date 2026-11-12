/**
 * 数据解析 / 归一化 / 语义校验（规格 3、5.5 节）。
 * 纯模块：不依赖 DOM，可在 node:test 中直接 import。
 *
 * 输入：JSONL 文本 / JSON 数组 / 记录对象数组
 * 输出：{ meta, nodes, edges, events, evidences, notes, warnings, errors, fatal, stats, ... }
 * 约定：
 *  - fatal：阻断性错误（空文件、非法 JSON、缺 meta、无节点）
 *  - errors：单条记录被拒绝或字段非法（会从对应集合中剔除或保留但标注）
 *  - warnings：可继续展示的软问题（坏行、重复引用、时间倒序、敏感字段等）
 */
import {
  EVIDENCE_TYPE_IDS,
  NODE_TYPE_IDS,
  RELATION_IDS,
  RESULT_IDS,
  SCHEMA_ID,
  SENSITIVE_KEY_PATTERN,
  STAGE_IDS
} from './constants.js';
import { clamp, parseTs, round } from './util.js';

const ID_RE = /^[a-z][a-z0-9-]{1,63}$/;
const ACTION_RE = /^[a-z][a-z0-9_]{1,63}$/;
const TACTIC_RE = /^TA\d{4}$/;
const TECHNIQUE_RE = /^T\d{4}(\.\d{3})?$/;
const ENG_ID_RE = /^ENG-[A-Z0-9-]{2,40}$/;
const KINDS = new Set(['meta', 'node', 'edge', 'event', 'evidence', 'note']);
const SOURCES = new Set(['plugin', 'simulation', 'import']);
const MAX_ISSUES = 200;

function issue(code, message, extra = {}) {
  return { code, message, ...extra };
}

function pushIssue(list, item) {
  if (list.length < MAX_ISSUES) list.push(item);
}

function pushFatal(list, item) {
  list.push(item);
}

/** 校验公共字段（source/actor/tags/seq），返回是否可继续 */
function validateCommon(rec, line, result) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
    pushIssue(result.errors, issue('not-object', `第 ${line} 行不是 JSON 对象，已跳过`, { line }));
    return false;
  }
  if (rec.schema !== SCHEMA_ID) {
    pushIssue(result.errors, issue('schema', `第 ${line} 行 schema 必须为 "${SCHEMA_ID}"，已跳过`, { line }));
    return false;
  }
  if (!KINDS.has(rec.kind)) {
    pushIssue(result.errors, issue('kind', `第 ${line} 行 kind 非法：${String(rec.kind)}，已跳过`, { line }));
    return false;
  }
  if (!Number.isFinite(parseTs(rec.ts))) {
    pushIssue(result.errors, issue('ts', `第 ${line} 行 ts 不是合法 ISO 8601 时间，已跳过`, { line }));
    return false;
  }
  if (!Number.isInteger(rec.seq) || rec.seq < 1) {
    pushIssue(result.warnings, issue('seq', `第 ${line} 行 seq 应为 ≥1 的整数（当前 ${String(rec.seq)}）`, { line }));
  }
  if (rec.source !== undefined && !SOURCES.has(rec.source)) {
    pushIssue(result.warnings, issue('source', `第 ${line} 行 source 取值非规范枚举，已忽略`, { line }));
  }
  if (rec.actor !== undefined && typeof rec.actor !== 'string') {
    pushIssue(result.warnings, issue('actor', `第 ${line} 行 actor 应为字符串，已忽略`, { line }));
  }
  if (rec.tags !== undefined) {
    const tags = rec.tags;
    const bad =
      !Array.isArray(tags) ||
      tags.length > 10 ||
      tags.some((t) => typeof t !== 'string' || t.length < 1 || t.length > 32);
    if (bad) pushIssue(result.warnings, issue('tags', `第 ${line} 行 tags 不符合约束（≤10 个、每个 ≤32 字符）`, { line }));
  }
  return true;
}

function normalizeAttck(attck, where, warnings) {
  if (attck === undefined || attck === null) return undefined;
  if (typeof attck !== 'object' || Array.isArray(attck)) {
    pushIssue(warnings, issue('attck', `${where} 的 attck 不是对象，已忽略`));
    return undefined;
  }
  if (!TACTIC_RE.test(String(attck.tactic || '')) || !TECHNIQUE_RE.test(String(attck.technique || ''))) {
    pushIssue(warnings, issue('attck', `${where} 的 attck.tactic/technique 格式非法，已忽略`));
    return undefined;
  }
  const name = typeof attck.name === 'string' ? attck.name.slice(0, 128) : undefined;
  return { tactic: attck.tactic, technique: attck.technique, ...(name ? { name } : {}) };
}

function normalizeProps(props, where, warnings) {
  if (props === undefined || props === null) return {};
  if (typeof props !== 'object' || Array.isArray(props)) {
    pushIssue(warnings, issue('props', `${where} 的 props 应为对象，已重置为空对象`));
    return {};
  }
  return props;
}

function normalizeIdsField(value, where, warnings) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    pushIssue(warnings, issue('refs', `${where} 的引用字段应为数组，已忽略`));
    return [];
  }
  const ids = [];
  for (const item of value) {
    if (typeof item === 'string' && ID_RE.test(item)) ids.push(item);
    else pushIssue(warnings, issue('refs', `${where} 含非法引用 id：${String(item)}`));
  }
  return [...new Set(ids)];
}

function readRisk(rec, where, warnings, fallback = 0) {
  if (rec.risk === undefined) return fallback;
  const n = Number(rec.risk);
  if (!Number.isFinite(n)) {
    pushIssue(warnings, issue('risk', `${where} 的 risk 不是数字，按 0 处理`));
    return fallback;
  }
  if (n < 0 || n > 10) {
    pushIssue(warnings, issue('risk', `${where} 的 risk 超出 0–10，已夹取`));
    return round(clamp(n, 0, 10), 1);
  }
  return round(n, 1);
}

function readConfidence(rec, where, warnings) {
  if (rec.confidence === undefined) return 1;
  const n = Number(rec.confidence);
  if (!Number.isFinite(n)) {
    pushIssue(warnings, issue('confidence', `${where} 的 confidence 不是数字，按 1 处理`));
    return 1;
  }
  if (n < 0 || n > 1) {
    pushIssue(warnings, issue('confidence', `${where} 的 confidence 超出 0–1，已夹取`));
    return round(clamp(n, 0, 1), 2);
  }
  return round(n, 2);
}

function commonFields(rec) {
  return {
    seq: Number.isInteger(rec.seq) ? rec.seq : null,
    ts: rec.ts,
    source: SOURCES.has(rec.source) ? rec.source : undefined,
    actor: typeof rec.actor === 'string' ? rec.actor : undefined,
    tags: Array.isArray(rec.tags) ? rec.tags.filter((t) => typeof t === 'string') : [],
    raw: rec
  };
}

function parseNode(rec, line, result) {
  const where = `第 ${line} 行 node`;
  if (!ID_RE.test(String(rec.id || ''))) {
    pushIssue(result.errors, issue('node-id', `${where} 的 id 不符合 ^[a-z][a-z0-9-]{1,63}$，已跳过`, { line }));
    return null;
  }
  if (!NODE_TYPE_IDS.includes(rec.type)) {
    pushIssue(result.errors, issue('node-type', `${where} 的 type 非法：${String(rec.type)}，已跳过`, { line }));
    return null;
  }
  if (typeof rec.label !== 'string' || rec.label.trim().length < 1) {
    pushIssue(result.errors, issue('node-label', `${where} 缺少 label，已跳过`, { line }));
    return null;
  }
  if (!STAGE_IDS.includes(rec.stage)) {
    pushIssue(result.errors, issue('node-stage', `${where} 的 stage 非法：${String(rec.stage)}，已跳过`, { line }));
    return null;
  }
  return {
    ...commonFields(rec),
    kind: 'node',
    id: rec.id,
    type: rec.type,
    label: rec.label.trim().slice(0, 120),
    stage: rec.stage,
    risk: readRisk(rec, where, result.warnings),
    confidence: readConfidence(rec, where, result.warnings),
    props: normalizeProps(rec.props, where, result.warnings),
    attck: normalizeAttck(rec.attck, where, result.warnings),
    tsMs: parseTs(rec.ts)
  };
}

function parseEdge(rec, line, result) {
  const where = `第 ${line} 行 edge`;
  if (!ID_RE.test(String(rec.id || ''))) {
    pushIssue(result.errors, issue('edge-id', `${where} 的 id 非法，已跳过`, { line }));
    return null;
  }
  if (!ID_RE.test(String(rec.from || '')) || !ID_RE.test(String(rec.to || ''))) {
    pushIssue(result.errors, issue('edge-refs', `${where} 的 from/to 非法，已跳过`, { line }));
    return null;
  }
  if (!RELATION_IDS.includes(rec.relation)) {
    pushIssue(result.errors, issue('edge-relation', `${where} 的 relation 非法：${String(rec.relation)}，已跳过`, { line }));
    return null;
  }
  if (!STAGE_IDS.includes(rec.stage)) {
    pushIssue(result.errors, issue('edge-stage', `${where} 的 stage 非法，已跳过`, { line }));
    return null;
  }
  let weight = 1;
  if (rec.weight !== undefined) {
    const w = Number(rec.weight);
    if (!Number.isFinite(w) || w < 0 || w > 1) {
      pushIssue(result.warnings, issue('edge-weight', `${where} 的 weight 非法，按 1 处理`));
    } else {
      weight = round(w, 2);
    }
  }
  return {
    ...commonFields(rec),
    kind: 'edge',
    id: rec.id,
    from: rec.from,
    to: rec.to,
    relation: rec.relation,
    stage: rec.stage,
    weight,
    props: normalizeProps(rec.props, where, result.warnings),
    attck: normalizeAttck(rec.attck, where, result.warnings),
    tsMs: parseTs(rec.ts)
  };
}

function parseEvent(rec, line, result) {
  const where = `第 ${line} 行 event`;
  if (!ID_RE.test(String(rec.id || ''))) {
    pushIssue(result.errors, issue('event-id', `${where} 的 id 非法，已跳过`, { line }));
    return null;
  }
  if (!STAGE_IDS.includes(rec.stage)) {
    pushIssue(result.errors, issue('event-stage', `${where} 的 stage 非法，已跳过`, { line }));
    return null;
  }
  if (!ACTION_RE.test(String(rec.action || ''))) {
    pushIssue(result.errors, issue('event-action', `${where} 的 action 不符合 snake_case，已跳过`, { line }));
    return null;
  }
  if (typeof rec.summary !== 'string' || rec.summary.trim().length < 2) {
    pushIssue(result.errors, issue('event-summary', `${where} 缺少 summary，已跳过`, { line }));
    return null;
  }
  if (!RESULT_IDS.includes(rec.result)) {
    pushIssue(result.errors, issue('event-result', `${where} 的 result 非法：${String(rec.result)}，已跳过`, { line }));
    return null;
  }
  let durationMs;
  if (rec.duration_ms !== undefined) {
    if (!Number.isInteger(rec.duration_ms) || rec.duration_ms < 0) {
      pushIssue(result.warnings, issue('event-duration', `${where} 的 duration_ms 非法，已忽略`));
    } else {
      durationMs = rec.duration_ms;
    }
  }
  return {
    ...commonFields(rec),
    kind: 'event',
    id: rec.id,
    stage: rec.stage,
    action: rec.action,
    summary: rec.summary.trim().slice(0, 500),
    result: rec.result,
    risk: readRisk(rec, where, result.warnings),
    node_ids: normalizeIdsField(rec.node_ids, where, result.warnings),
    edge_ids: normalizeIdsField(rec.edge_ids, where, result.warnings),
    detail: typeof rec.detail === 'string' ? rec.detail.slice(0, 2000) : '',
    duration_ms: durationMs,
    attck: normalizeAttck(rec.attck, where, result.warnings),
    tsMs: parseTs(rec.ts)
  };
}

function parseEvidence(rec, line, result) {
  const where = `第 ${line} 行 evidence`;
  if (!ID_RE.test(String(rec.id || ''))) {
    pushIssue(result.errors, issue('evidence-id', `${where} 的 id 非法，已跳过`, { line }));
    return null;
  }
  if (!EVIDENCE_TYPE_IDS.includes(rec.type)) {
    pushIssue(result.errors, issue('evidence-type', `${where} 的 type 非法，已跳过`, { line }));
    return null;
  }
  if (typeof rec.title !== 'string' || rec.title.trim().length < 1) {
    pushIssue(result.errors, issue('evidence-title', `${where} 缺少 title，已跳过`, { line }));
    return null;
  }
  let nodeId;
  if (rec.node_id !== undefined) {
    if (ID_RE.test(String(rec.node_id))) nodeId = rec.node_id;
    else pushIssue(result.warnings, issue('evidence-node', `${where} 的 node_id 非法，已忽略`));
  }
  return {
    ...commonFields(rec),
    kind: 'evidence',
    id: rec.id,
    type: rec.type,
    title: rec.title.trim().slice(0, 160),
    node_id: nodeId,
    summary: typeof rec.summary === 'string' ? rec.summary.slice(0, 1000) : '',
    hash: typeof rec.hash === 'string' ? rec.hash : '',
    path: typeof rec.path === 'string' ? rec.path : '',
    sensitive: rec.sensitive === true,
    props: normalizeProps(rec.props, where, result.warnings),
    tsMs: parseTs(rec.ts)
  };
}

function parseNote(rec, line, result) {
  const where = `第 ${line} 行 note`;
  if (!ID_RE.test(String(rec.id || ''))) {
    pushIssue(result.errors, issue('note-id', `${where} 的 id 非法，已跳过`, { line }));
    return null;
  }
  if (typeof rec.content !== 'string' || rec.content.trim().length < 1) {
    pushIssue(result.errors, issue('note-content', `${where} 缺少 content，已跳过`, { line }));
    return null;
  }
  return {
    ...commonFields(rec),
    kind: 'note',
    id: rec.id,
    content: rec.content.trim().slice(0, 2000),
    node_ids: normalizeIdsField(rec.node_ids, where, result.warnings),
    tsMs: parseTs(rec.ts)
  };
}

function validateMeta(rec, result) {
  const eng = rec.engagement;
  if (!eng || typeof eng !== 'object' || Array.isArray(eng)) {
    pushIssue(result.errors, issue('meta-engagement', 'meta.engagement 缺失或不是对象'));
    return null;
  }
  const checks = [];
  if (typeof eng.id !== 'string' || !ENG_ID_RE.test(eng.id)) checks.push('engagement.id 需匹配 ENG-XXXX');
  if (typeof eng.name !== 'string' || eng.name.length < 2) checks.push('engagement.name 缺失');
  if (!['simulation', 'authorized'].includes(eng.mode)) checks.push('engagement.mode 必须为 simulation/authorized');
  if (!Array.isArray(eng.scope) || eng.scope.length < 1) checks.push('engagement.scope 至少 1 项');
  if (!eng.authorization || typeof eng.authorization.basis !== 'string' || eng.authorization.basis.length < 4)
    checks.push('engagement.authorization.basis 必填');
  if (typeof eng.operator !== 'string' || eng.operator.length < 1) checks.push('engagement.operator 缺失');
  if (!Number.isFinite(parseTs(eng.started_at))) checks.push('engagement.started_at 非法');
  if (eng.ended_at !== undefined && eng.ended_at !== null && !Number.isFinite(parseTs(eng.ended_at)))
    checks.push('engagement.ended_at 非法');
  if (checks.length) {
    pushIssue(
      result.errors,
      issue('meta-fields', `meta.engagement 存在 ${checks.length} 处字段问题：${checks.join('；')}`)
    );
  }
  if (!rec.tool || typeof rec.tool !== 'object') {
    pushIssue(result.errors, issue('meta-tool', 'meta.tool 缺失'));
  }
  return {
    raw: rec,
    engagement: eng,
    tool: rec.tool || {},
    scenario: typeof rec.scenario === 'string' ? rec.scenario : '',
    ts: rec.ts,
    tsMs: parseTs(rec.ts)
  };
}

/** 递归扫描敏感字段，返回发现的路径列表 */
function scanSensitiveFields(value, path, found, depth = 0) {
  if (found.length >= 12 || depth > 6 || value === null || typeof value !== 'object') return;
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  for (const [key, child] of entries) {
    const nextPath = path ? `${path}.${key}` : key;
    if (SENSITIVE_KEY_PATTERN.test(key) && typeof child === 'string' && child.trim() && child !== '[REDACTED]') {
      found.push(nextPath);
      continue;
    }
    scanSensitiveFields(child, nextPath, found, depth + 1);
  }
}

/** 引用完整性检查（聚合成一条 warning，避免刷分） */
function checkReferences(result) {
  const nodeIds = new Set(result.nodes.map((n) => n.id));
  const edgeIds = new Set(result.edges.map((e) => e.id));
  const eventIds = new Set(result.events.map((e) => e.id));
  const evidenceIds = new Set(result.evidences.map((e) => e.id));

  const missingEdgeRefs = result.edges.filter((e) => !nodeIds.has(e.from) || !nodeIds.has(e.to));
  if (missingEdgeRefs.length) {
    pushIssue(
      result.warnings,
      issue(
        'dangling-edge',
        `${missingEdgeRefs.length} 条关系引用了不存在的节点，链路图中将隐藏`,
        { count: missingEdgeRefs.length, ids: missingEdgeRefs.slice(0, 8).map((e) => e.id) }
      )
    );
  }

  const evMissingNodes = [];
  const evMissingEdges = [];
  for (const e of result.events) {
    for (const id of e.node_ids) if (!nodeIds.has(id)) evMissingNodes.push(`${e.id}:${id}`);
    for (const id of e.edge_ids) if (!edgeIds.has(id)) evMissingEdges.push(`${e.id}:${id}`);
  }
  if (evMissingNodes.length) {
    pushIssue(result.warnings, issue('event-node-refs', `${evMissingNodes.length} 处事件→节点引用不存在`, {
      count: evMissingNodes.length,
      ids: evMissingNodes.slice(0, 8)
    }));
  }
  if (evMissingEdges.length) {
    pushIssue(result.warnings, issue('event-edge-refs', `${evMissingEdges.length} 处事件→关系引用不存在`, {
      count: evMissingEdges.length,
      ids: evMissingEdges.slice(0, 8)
    }));
  }
  const evdMissing = result.evidences.filter((e) => e.node_id && !nodeIds.has(e.node_id));
  if (evdMissing.length) {
    pushIssue(result.warnings, issue('evidence-refs', `${evdMissing.length} 条证据关联的节点不存在`, {
      count: evdMissing.length,
      ids: evdMissing.slice(0, 8).map((e) => e.id)
    }));
  }
  const noteMissing = [];
  for (const n of result.notes) for (const id of n.node_ids) if (!nodeIds.has(id)) noteMissing.push(`${n.id}:${id}`);
  if (noteMissing.length) {
    pushIssue(result.warnings, issue('note-refs', `${noteMissing.length} 处批注→节点引用不存在`, {
      count: noteMissing.length,
      ids: noteMissing.slice(0, 8)
    }));
  }

  // 引用存在但指向错误类型时也给一条提示
  const duplicateEvidenceLinks = result.evidences.length && evidenceIds.size !== result.evidences.length;
  if (duplicateEvidenceLinks) {
    pushIssue(result.warnings, issue('evidence-dup', '证据 id 存在重复，已保留首条'));
  }
  if (eventIds.size !== result.events.length) {
    pushIssue(result.warnings, issue('event-dup', '事件 id 存在重复，已保留首条'));
  }
}

/** 时间单调性 / seq 递增 / 起始时间检查 */
function checkOrdering(result) {
  const records = result.records;
  let lastSeq = -Infinity;
  let seqBreaks = 0;
  const seqSamples = [];
  let lastTs = -Infinity;
  let tsBreaks = 0;
  const tsSamples = [];
  let firstNonMetaTs = Infinity;

  for (const rec of records) {
    if (Number.isInteger(rec.seq)) {
      if (rec.seq < lastSeq) {
        seqBreaks += 1;
        if (seqSamples.length < 5) seqSamples.push(`seq ${rec.seq} < 上一条 ${lastSeq}`);
      }
      lastSeq = Math.max(lastSeq, rec.seq);
    }
    if (rec.kind !== 'meta') {
      const n = parseTs(rec.ts);
      if (Number.isFinite(n)) {
        firstNonMetaTs = Math.min(firstNonMetaTs, n);
        if (n < lastTs) {
          tsBreaks += 1;
          if (tsSamples.length < 5) tsSamples.push(`${rec.ts} < 上一条`);
        }
        lastTs = Math.max(lastTs, n);
      }
    }
  }
  if (seqBreaks) {
    pushIssue(result.warnings, issue('seq-order', `seq 有 ${seqBreaks} 处非递增（规格要求严格递增）`, {
      count: seqBreaks,
      ids: seqSamples
    }));
  }
  if (tsBreaks) {
    pushIssue(result.warnings, issue('ts-order', `时间戳有 ${tsBreaks} 处倒序（规格要求非递减）`, {
      count: tsBreaks,
      ids: tsSamples
    }));
  }
  if (result.meta?.engagement?.started_at && Number.isFinite(firstNonMetaTs)) {
    const start = parseTs(result.meta.engagement.started_at);
    if (Number.isFinite(start) && firstNonMetaTs < start) {
      pushIssue(result.warnings, issue('start-time', '存在早于 engagement.started_at 的记录'));
    }
  }
  const firstSeq = result.records.find((r) => Number.isInteger(r.seq))?.seq;
  if (firstSeq !== undefined && firstSeq !== 1) {
    pushIssue(result.warnings, issue('seq-start', `首条记录 seq=${firstSeq}，规格建议从 1 开始`));
  }
}

/** 坏行 / 整体 JSON 解析 */
function extractRecords(input) {
  const out = { items: [], rawCount: 0, format: 'jsonl', errors: [], fatal: [], skippedLines: 0 };
  if (Array.isArray(input)) {
    out.format = 'json-array';
    out.rawCount = input.length;
    out.items = input.map((record, i) => ({ record, line: i + 1 }));
    return out;
  }
  if (typeof input !== 'string') {
    pushFatal(out.fatal, issue('input-type', '输入不是字符串或数组，无法解析'));
    return out;
  }
  const text = input.replace(/^\uFEFF/, '').trim();
  if (!text) {
    pushFatal(out.fatal, issue('empty', '数据为空：未读取到任何记录'));
    return out;
  }
  if (text[0] === '[') {
    out.format = 'json-array';
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        pushFatal(out.fatal, issue('json', 'JSON 顶层不是数组'));
        return out;
      }
      out.rawCount = parsed.length;
      out.items = parsed.map((record, i) => ({ record, line: i + 1 }));
    } catch (err) {
      pushFatal(out.fatal, issue('json', `JSON 解析失败：${err.message}`));
    }
    return out;
  }
  // 兼容整体是单个 JSON 对象（带换行）的情况：若整段可以解析为对象，当作单条记录
  if (text[0] === '{') {
    try {
      const whole = JSON.parse(text);
      if (whole && typeof whole === 'object' && !Array.isArray(whole)) {
        out.format = 'json-object';
        out.rawCount = 1;
        out.items = [{ record: whole, line: 1 }];
        return out;
      }
    } catch {
      // 继续按 JSONL 逐行解析
    }
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) continue;
    out.rawCount += 1;
    try {
      out.items.push({ record: JSON.parse(raw), line: i + 1 });
    } catch (err) {
      out.skippedLines += 1;
      pushIssue(
        out.errors,
        issue('bad-json', `第 ${i + 1} 行 JSON 解析失败，已跳过：${String(err.message).slice(0, 120)}`, {
          line: i + 1
        })
      );
    }
  }
  return out;
}

/**
 * 解析并归一化探索链路。
 * @param {string|Array|Object[]} input JSONL 文本 / JSON 数组 / 记录数组
 * @param {{source?:string, name?:string}} [opts]
 */
export function parseChain(input, opts = {}) {
  const result = {
    meta: null,
    nodes: [],
    edges: [],
    events: [],
    evidences: [],
    notes: [],
    records: [],
    errors: [],
    warnings: [],
    fatal: [],
    skippedLines: 0,
    rawCount: 0,
    sourceFormat: 'jsonl',
    source: opts.source || 'unknown',
    name: opts.name || '',
    ok: false
  };
  try {
    const extracted = extractRecords(input);
    result.sourceFormat = extracted.format;
    result.rawCount = extracted.rawCount;
    result.skippedLines = extracted.skippedLines;
    result.errors.push(...extracted.errors);
    result.fatal.push(...extracted.fatal);
    if (result.fatal.length) return finalize(result);

    const seen = {
      node: new Set(),
      edge: new Set(),
      event: new Set(),
      evidence: new Set(),
      note: new Set()
    };
    let metaSeen = false;
    let firstValidKind = null;

    for (const { record, line } of extracted.items) {
      if (!validateCommon(record, line, result)) continue;
      if (record.kind !== 'meta') {
        firstValidKind = firstValidKind || record.kind;
        result.records.push(record);
      }
      if (record.kind === 'meta') {
        if (metaSeen) {
          pushIssue(result.warnings, issue('meta-extra', `第 ${line} 行存在多余 meta，已忽略`));
          continue;
        }
        metaSeen = true;
        result.records.push(record);
        result.meta = validateMeta(record, result);
        continue;
      }
      if (record.kind === 'node') {
        const node = parseNode(record, line, result);
        if (!node) continue;
        if (seen.node.has(node.id)) {
          pushIssue(result.errors, issue('duplicate-id', `节点 id 重复：${node.id}，已跳过后一条`, { line }));
          continue;
        }
        seen.node.add(node.id);
        result.nodes.push(node);
      } else if (record.kind === 'edge') {
        const edge = parseEdge(record, line, result);
        if (!edge) continue;
        if (seen.edge.has(edge.id)) {
          pushIssue(result.errors, issue('duplicate-id', `关系 id 重复：${edge.id}，已跳过后一条`, { line }));
          continue;
        }
        seen.edge.add(edge.id);
        result.edges.push(edge);
      } else if (record.kind === 'event') {
        const event = parseEvent(record, line, result);
        if (!event) continue;
        if (seen.event.has(event.id)) {
          pushIssue(result.errors, issue('duplicate-id', `事件 id 重复：${event.id}，已跳过后一条`, { line }));
          continue;
        }
        seen.event.add(event.id);
        result.events.push(event);
      } else if (record.kind === 'evidence') {
        const evidence = parseEvidence(record, line, result);
        if (!evidence) continue;
        if (seen.evidence.has(evidence.id)) {
          pushIssue(result.errors, issue('duplicate-id', `证据 id 重复：${evidence.id}，已跳过后一条`, { line }));
          continue;
        }
        seen.evidence.add(evidence.id);
        result.evidences.push(evidence);
      } else if (record.kind === 'note') {
        const note = parseNote(record, line, result);
        if (!note) continue;
        if (seen.note.has(note.id)) {
          pushIssue(result.errors, issue('duplicate-id', `批注 id 重复：${note.id}，已跳过后一条`, { line }));
          continue;
        }
        seen.note.add(note.id);
        result.notes.push(note);
      }
    }

    if (!metaSeen) {
      pushFatal(
        result.fatal,
        issue('missing-meta', '缺少 meta 记录：首条记录必须为 kind:"meta" 的场景元数据')
      );
    } else if (firstValidKind !== null) {
      const firstRecord = extracted.items.find((it) => it.record && typeof it.record === 'object');
      if (firstRecord && firstRecord.record.kind !== 'meta') {
        pushIssue(result.warnings, issue('meta-order', '首条有效记录不是 meta（规格要求 meta 必须是首行）'));
      }
    }

    if (!result.nodes.length) {
      pushFatal(result.fatal, issue('no-nodes', '数据中没有可用的 node 记录，无法构建链路图'));
    }

    checkReferences(result);
    checkOrdering(result);

    // 敏感字段检测（递归 props）
    const sensitivePaths = [];
    for (const node of result.nodes) scanSensitiveFields(node.props, `${node.id}.props`, sensitivePaths);
    for (const edge of result.edges) scanSensitiveFields(edge.props, `${edge.id}.props`, sensitivePaths);
    for (const evd of result.evidences) scanSensitiveFields(evd.props, `${evd.id}.props`, sensitivePaths);
    if (sensitivePaths.length) {
      pushIssue(
        result.warnings,
        issue(
          'sensitive-value',
          `检测到 ${sensitivePaths.length} 处疑似未脱敏敏感字段（前端会按敏感信息处理，建议插件端脱敏）`,
          { count: sensitivePaths.length, ids: sensitivePaths.slice(0, 8) }
        )
      );
    }

    // 稳定排序：时间优先，seq 次之
    const byTime = (a, b) => a.tsMs - b.tsMs || (a.seq ?? 0) - (b.seq ?? 0);
    result.nodes.sort(byTime);
    result.edges.sort(byTime);
    result.events.sort(byTime);
    result.evidences.sort(byTime);
    result.notes.sort(byTime);
  } catch (err) {
    pushFatal(result.fatal, issue('unexpected', `解析过程出现异常：${err?.message || err}`));
  }
  return finalize(result);
}

function finalize(result) {
  result.ok = result.fatal.length === 0 && result.nodes.length > 0;
  result.stats = {
    rawRecords: result.rawCount,
    acceptedRecords: result.records.length,
    skippedLines: result.skippedLines,
    nodes: result.nodes.length,
    edges: result.edges.length,
    events: result.events.length,
    evidences: result.evidences.length,
    notes: result.notes.length,
    errors: result.errors.length,
    warnings: result.warnings.length
  };
  return result;
}

/** 供测试/工具使用：把记录数组序列化为 JSONL */
export function toJsonl(records) {
  return records.map((r) => JSON.stringify(r)).join('\n');
}
