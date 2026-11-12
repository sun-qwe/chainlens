/**
 * 独立的探索链路数据检查器（Lead QA 用，不依赖插件/前端实现）。
 * 校验 JSONL 的结构、必填字段、seq/时间单调、ID 唯一、引用完整性、敏感字段。
 *
 * 用法：
 *   node tools/chain-check.mjs <file.jsonl> [--json]
 * 退出码：0 = 无错误；1 = 有错误。
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const STAGES = ["recon", "validation", "initial_access", "privilege_escalation", "lateral_movement", "collection", "reporting"];
const NODE_TYPES = ["target", "host", "service", "webapp", "endpoint", "vulnerability", "credential", "session", "data", "finding"];
const RELATIONS = ["resolves_to", "exposes", "runs_on", "routes_to", "has_vuln", "exploits", "grants", "pivots_to", "accesses", "evidences", "belongs_to"];
const RESULTS = ["success", "failure", "partial", "info"];
const EVIDENCE_TYPES = ["screenshot", "http", "config", "log", "file", "credential", "note"];
const ID_RE = /^[a-z][a-z0-9-]{1,63}$/;
const SECRET_KEY_RE = /^(password|passwd|pwd|token|cookie|authorization|secret|api[_-]?key|private[_-]?key)$/i;

export function checkRecords(lines, options = {}) {
  const errors = [];
  const warnings = [];
  const records = [];
  let seq = 0;
  let prevTs = -Infinity;
  const ids = new Map();
  const nodes = new Map();
  const edges = new Map();
  const events = [];
  const evidences = [];

  const err = (i, msg) => errors.push({ line: i + 1, level: "error", msg });
  const warn = (i, msg) => warnings.push({ line: i + 1, level: "warning", msg });

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    let r;
    try {
      r = JSON.parse(raw);
    } catch (e) {
      err(i, `JSON 解析失败: ${e.message}`);
      continue;
    }
    records.push(r);
    const where = `第 ${i + 1} 行(${r.kind || "?"}/${r.id || "-"})`;
    if (r.schema !== "dsh-pentest/chain@1") err(i, `${where}: schema 必须为 dsh-pentest/chain@1`);
    if (!Number.isInteger(r.seq) || r.seq < 1) err(i, `${where}: seq 必须是 >=1 的整数`);
    else if (r.seq !== ++seq) err(i, `${where}: seq 应为 ${seq}，实际 ${r.seq}（严格递增且从 1 开始）`);
    if (typeof r.ts !== "string" || Number.isNaN(Date.parse(r.ts))) err(i, `${where}: ts 不是合法 ISO 时间`);
    else {
      const t = Date.parse(r.ts);
      if (r.kind !== "meta" && t < prevTs) warn(i, `${where}: ts 早于上一条记录（时间倒序）`);
      prevTs = Math.max(prevTs, t);
    }
    if (!["meta", "node", "edge", "event", "evidence", "note"].includes(r.kind)) {
      err(i, `${where}: kind 非法`);
      continue;
    }
    if (r.kind === "meta") {
      const e = r.engagement || {};
      if (!/^ENG-[A-Z0-9-]{2,40}$/.test(e.id || "")) err(i, `${where}: engagement.id 非法`);
      if (!e.name || !e.mode || !Array.isArray(e.scope) || !e.scope.length) err(i, `${where}: engagement 缺少 name/mode/scope`);
      if (!e.authorization || !e.authorization.basis) err(i, `${where}: 缺少授权依据 authorization.basis`);
      if (!e.operator || !e.started_at) err(i, `${where}: 缺少 operator/started_at`);
      if (!r.tool || !r.tool.name) err(i, `${where}: 缺少 tool.name`);
      continue;
    }
    if (!ID_RE.test(r.id || "")) err(i, `${where}: id 不匹配 ${ID_RE}`);
    if (ids.has(r.id)) err(i, `${where}: id 重复（首次出现在第 ${ids.get(r.id)} 行）`);
    else ids.set(r.id, i + 1);
    if (r.kind === "node") {
      if (!NODE_TYPES.includes(r.type)) err(i, `${where}: node.type 非法`);
      if (!STAGES.includes(r.stage)) err(i, `${where}: node.stage 非法`);
      if (!r.label) err(i, `${where}: node.label 为空`);
      if (r.risk !== undefined && (typeof r.risk !== "number" || r.risk < 0 || r.risk > 10)) err(i, `${where}: risk 越界`);
      if (r.confidence !== undefined && (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1)) err(i, `${where}: confidence 越界`);
      if (nodes.has(r.id)) err(i, `${where}: 节点 id 重复`);
      nodes.set(r.id, r);
    } else if (r.kind === "edge") {
      if (!RELATIONS.includes(r.relation)) err(i, `${where}: relation 非法`);
      if (!STAGES.includes(r.stage)) err(i, `${where}: edge.stage 非法`);
      if (!r.from || !r.to) err(i, `${where}: 缺少 from/to`);
      if (r.from === r.to) warn(i, `${where}: 自环边`);
      edges.set(r.id, r);
    } else if (r.kind === "event") {
      if (!STAGES.includes(r.stage)) err(i, `${where}: event.stage 非法`);
      if (!RESULTS.includes(r.result)) err(i, `${where}: result 非法`);
      if (!r.summary || r.summary.length < 2) err(i, `${where}: summary 为空`);
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(r.action || "")) err(i, `${where}: action 非法`);
      events.push(r);
    } else if (r.kind === "evidence") {
      if (!EVIDENCE_TYPES.includes(r.type)) err(i, `${where}: evidence.type 非法`);
      if (!r.title) err(i, `${where}: evidence.title 为空`);
      evidences.push(r);
    } else if (r.kind === "note") {
      if (!r.content) err(i, `${where}: note.content 为空`);
    }
    // 敏感字段检测
    const walk = (v, path) => {
      if (!v || typeof v !== "object") return;
      for (const [k, val] of Object.entries(v)) {
        if (SECRET_KEY_RE.test(k) && typeof val === "string" && val && val !== "[REDACTED]") {
          if (!["account", "user", "username"].includes(k)) warn(i, `${where}: 敏感字段 ${path}${k} 未脱敏`);
        }
        walk(val, `${path}${k}.`);
      }
    };
    walk(r, "");
    if (r.kind === "node" && r.type === "credential" && r.props && r.props.value && r.props.value !== "[REDACTED]") {
      warn(i, `${where}: credential.props.value 未脱敏`);
    }
  }

  // 引用完整性
  for (const [id, e] of edges) {
    if (!nodes.has(e.from)) errors.push({ line: 0, level: "error", msg: `边 ${id} 的 from 节点 ${e.from} 不存在` });
    if (!nodes.has(e.to)) errors.push({ line: 0, level: "error", msg: `边 ${id} 的 to 节点 ${e.to} 不存在` });
  }
  for (const ev of events) {
    for (const n of ev.node_ids || []) if (!nodes.has(n)) warnings.push({ line: 0, level: "warning", msg: `事件 ${ev.id} 引用不存在的节点 ${n}` });
    for (const e of ev.edge_ids || []) if (!edges.has(e)) warnings.push({ line: 0, level: "warning", msg: `事件 ${ev.id} 引用不存在的边 ${e}` });
  }
  for (const evd of evidences) if (evd.node_id && !nodes.has(evd.node_id)) warnings.push({ line: 0, level: "warning", msg: `证据 ${evd.id} 引用不存在的节点 ${evd.node_id}` });

  const stats = {
    records: records.length,
    nodes: nodes.size,
    edges: edges.size,
    events: events.length,
    evidence: evidences.length,
    stages: new Set(events.map((e) => e.stage)).size,
    vulns: [...nodes.values()].filter((n) => n.type === "vulnerability" || n.type === "finding").length,
    first_ts: records.find((r) => r.kind !== "meta")?.ts || null,
    last_ts: records.length ? records[records.length - 1].ts : null,
    bytes: Buffer.byteLength(lines.join("\n"), "utf8")
  };
  if (errors.length === 0 && !records.some((r) => r.kind === "meta")) errors.push({ line: 0, level: "error", msg: "缺少 meta 记录" });
  return { errors, warnings, stats, records };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("用法: node tools/chain-check.mjs <file.jsonl> [--json]");
    process.exit(2);
  }
  const text = readFileSync(file, "utf8");
  const result = checkRecords(text.split(/\r?\n/));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ file, ...result, records: undefined }, null, 2));
  } else {
    console.log(`文件: ${file}`);
    console.log(`统计: ${JSON.stringify(result.stats)}`);
    for (const e of result.errors) console.log(`[ERROR] 行${e.line || "-"}: ${e.msg}`);
    for (const w of result.warnings) console.log(`[WARN ] 行${w.line || "-"}: ${w.msg}`);
    console.log(`结果: errors=${result.errors.length} warnings=${result.warnings.length}`);
  }
  process.exit(result.errors.length ? 1 : 0);
}
