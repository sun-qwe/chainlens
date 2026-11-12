/**
 * 生成最小合法探索链路样例 data/fixtures/mini.jsonl
 * 用途：可视化端早期联调、文档示例、论文数据格式示例。
 * 运行：node tools/make-fixture.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SCHEMA = "dsh-pentest/chain@1";
const base = new Date("2026-11-01T09:00:00+08:00");
const ts = (min) => {
  const local = new Date(base.getTime() + min * 60_000 + 8 * 3600_000);
  return local.toISOString().slice(0, 19) + "+08:00";
};

const items = [];
function add(kind, tMin, data) {
  items.push({ kind, t: tMin, data });
}

add("meta", 0, {
  engagement: {
    id: "ENG-2026-101",
    name: "星海大学实训靶场 Web 链路（样例集）",
    mode: "simulation",
    scope: ["10.20.10.0/24", "lab.starhai.test"],
    authorization: {
      basis: "《网络安全实训靶场使用授权书》（编号 LAB-2026-101）",
      expires_at: "2026-12-31T23:59:59+08:00"
    },
    operator: "孙博奥",
    team: ["红队 A 组"],
    started_at: ts(0),
    ended_at: null,
    description: "最小样例数据：覆盖全部节点类型、关系类型、事件阶段与证据类型，仅用于开发联调。"
  },
  tool: { name: "dsh-pentest", version: "0.1.0" },
  scenario: "campus-lab"
});

const nodes = [
  [2, "target-001", "target", "星海大学实训靶场", "recon", 3.0, { industry: "教育", domain: "lab.starhai.test" }, null],
  [5, "host-001", "host", "WEB-DMZ-01", "recon", 5.5, { ip: "10.20.10.15", os: "Ubuntu 22.04", exposure: "dmz", critical: true }, { tactic: "TA0007", technique: "T1046", name: "Network Service Discovery" }],
  [6, "svc-001", "service", "HTTPS / 443", "recon", 4.0, { port: 443, protocol: "tcp", product: "nginx", version: "1.24.0" }, null],
  [8, "webapp-001", "webapp", "教学实验平台", "recon", 5.0, { url: "https://lab.starhai.test", tech: ["Spring Boot", "Vue 3"], auth: "账号密码 + 短信" }, null],
  [12, "ep-001", "endpoint", "GET /api/v2/export", "validation", 6.0, { method: "GET", path: "/api/v2/export", auth_required: false }, { tactic: "TA0007", technique: "T1083", name: "File and Directory Discovery" }],
  [20, "vuln-001", "vulnerability", "导出接口未授权访问", "validation", 7.5, { severity: "high", cvss: 7.5, cve: "SIM-2026-0001", category: "A01 访问控制失效", status: "confirmed", recommendation: "为导出接口补充服务端鉴权与租户隔离校验。" }, { tactic: "TA0001", technique: "T1190", name: "Exploit Public-Facing Application" }],
  [26, "vuln-002", "vulnerability", "管理后台弱口令", "validation", 9.1, { severity: "critical", cvss: 9.1, cve: "SIM-2026-0002", category: "A07 身份认证失效", status: "confirmed", recommendation: "强制复杂口令、启用 MFA，并限制管理入口来源。" }, { tactic: "TA0006", technique: "T1110", name: "Brute Force" }],
  [31, "cred-001", "credential", "教师账号 t.chen", "initial_access", 8.0, { account: "t.chen", kind: "password", privilege: "teacher", source: "弱口令验证", value: "[REDACTED]" }, { tactic: "TA0006", technique: "T1078", name: "Valid Accounts" }],
  [34, "sess-001", "session", "教师后台会话", "initial_access", 8.5, { user: "t.chen", privilege: "teacher", host_id: "host-001", valid_until: ts(120) }, { tactic: "TA0001", technique: "T1078", name: "Valid Accounts" }],
  [40, "host-002", "host", "OA-INTRANET-02", "lateral_movement", 6.5, { ip: "10.20.20.31", os: "Windows Server 2019", exposure: "intranet", critical: true }, { tactic: "TA0008", technique: "T1021", name: "Remote Services" }],
  [42, "svc-002", "service", "HTTP / 8080", "lateral_movement", 5.0, { port: 8080, protocol: "tcp", product: "Apache Tomcat", version: "9.0.78" }, null],
  [44, "webapp-002", "webapp", "OA 办公系统", "lateral_movement", 6.0, { url: "http://10.20.20.31:8080/oa", tech: ["Java", "Shiro"], auth: "统一身份认证" }, null],
  [50, "vuln-003", "vulnerability", "普通用户越权访问管理员接口", "lateral_movement", 6.8, { severity: "high", cvss: 6.8, cve: "SIM-2026-0003", category: "A01 访问控制失效", status: "confirmed", recommendation: "基于角色的服务端鉴权，补充越权测试用例。" }, { tactic: "TA0004", technique: "T1548", name: "Abuse Elevation Control Mechanism" }],
  [55, "sess-002", "session", "OA 普通用户会话", "lateral_movement", 6.0, { user: "u.zhang", privilege: "employee", host_id: "host-002", valid_until: ts(180) }, { tactic: "TA0008", technique: "T1021", name: "Remote Services" }],
  [60, "data-001", "data", "学生成绩导出数据集", "collection", 8.0, { kind: "db", classification: "confidential", path: "/api/v2/export?scope=grade" }, { tactic: "TA0009", technique: "T1213", name: "Data from Information Repositories" }],
  [65, "finding-001", "finding", "敏感数据未授权导出（综合发现）", "reporting", 9.0, { severity: "critical", title: "未授权导出学生成绩数据", impact: "可批量获取学生身份信息与成绩，违反数据最小化原则。", recommendation: "修复鉴权、审计导出行为、对历史导出日志进行回溯。", status: "open" }, null]
];
for (const [t, id, type, label, stage, risk, props, attck] of nodes) {
  add("node", t, { id, type, label, stage, risk, confidence: type === "vulnerability" ? 0.9 : 0.95, props, ...(attck ? { attck } : {}) });
}

const edges = [
  [5, "rel-001", "host-001", "target-001", "belongs_to", "recon"],
  [6, "rel-002", "host-001", "svc-001", "exposes", "recon"],
  [6, "rel-003", "svc-001", "host-001", "runs_on", "recon"],
  [8, "rel-004", "webapp-001", "host-001", "runs_on", "recon"],
  [8, "rel-005", "svc-001", "webapp-001", "exposes", "recon"],
  [12, "rel-006", "webapp-001", "ep-001", "routes_to", "validation"],
  [20, "rel-007", "ep-001", "vuln-001", "has_vuln", "validation"],
  [26, "rel-008", "host-001", "vuln-002", "has_vuln", "validation"],
  [31, "rel-009", "vuln-002", "cred-001", "grants", "initial_access"],
  [34, "rel-010", "vuln-001", "sess-001", "grants", "initial_access"],
  [34, "rel-011", "cred-001", "sess-001", "grants", "initial_access"],
  [40, "rel-012", "sess-001", "host-002", "pivots_to", "lateral_movement"],
  [42, "rel-013", "host-002", "svc-002", "exposes", "lateral_movement"],
  [44, "rel-014", "svc-002", "webapp-002", "exposes", "lateral_movement"],
  [50, "rel-015", "webapp-002", "vuln-003", "has_vuln", "lateral_movement"],
  [55, "rel-016", "vuln-003", "sess-002", "grants", "lateral_movement"],
  [60, "rel-017", "sess-002", "data-001", "accesses", "collection"],
  [65, "rel-018", "data-001", "finding-001", "evidences", "reporting"],
  [65, "rel-019", "finding-001", "target-001", "belongs_to", "reporting"]
];
for (const [t, id, from, to, relation, stage, weight = 0.9] of edges) {
  add("edge", t, { id, from, to, relation, stage, weight, props: {} });
}

const events = [
  [3, "evt-001", "recon", "port_scan", "对 DMZ 网段执行端口探测，发现 443/8080 开放", "success", 2, ["host-001", "svc-001"], null, { tactic: "TA0043", technique: "T1595", name: "Active Scanning" }],
  [7, "evt-002", "recon", "service_fingerprint", "识别 443 端口为 nginx 1.24.0", "success", 1, ["svc-001"], null, { tactic: "TA0007", technique: "T1046", name: "Network Service Discovery" }],
  [13, "evt-003", "validation", "dir_enum", "枚举到 /api/v2 与导出接口路径", "success", 3, ["ep-001"], null, { tactic: "TA0007", technique: "T1083", name: "File and Directory Discovery" }],
  [21, "evt-004", "validation", "vuln_verify", "只读验证导出接口未鉴权，返回 200 与字段列表", "success", 7.5, ["vuln-001", "ep-001"], ["rel-007"], { tactic: "TA0001", technique: "T1190", name: "Exploit Public-Facing Application" }],
  [27, "evt-005", "validation", "credential_guess", "在授权字典范围内验证后台弱口令成功", "success", 9, ["vuln-002", "cred-001"], ["rel-009"], { tactic: "TA0006", technique: "T1110", name: "Brute Force" }],
  [35, "evt-006", "initial_access", "login", "使用教师账号登录后台，获得会话", "success", 8, ["sess-001", "cred-001"], ["rel-011"], { tactic: "TA0001", technique: "T1078", name: "Valid Accounts" }],
  [41, "evt-007", "lateral_movement", "lateral_probe", "探测内网 OA 主机可达性", "partial", 3, ["host-002"], ["rel-012"], { tactic: "TA0008", technique: "T1021", name: "Remote Services" }],
  [46, "evt-008", "lateral_movement", "web_fingerprint", "识别 OA 系统为 Tomcat + Shiro", "success", 2, ["webapp-002"], null, { tactic: "TA0007", technique: "T1046", name: "Network Service Discovery" }],
  [51, "evt-009", "lateral_movement", "authz_bypass", "普通用户越权访问管理员接口", "success", 6.8, ["vuln-003", "sess-002"], ["rel-015", "rel-016"], { tactic: "TA0004", technique: "T1548", name: "Abuse Elevation Control Mechanism" }],
  [61, "evt-010", "collection", "data_export", "在只读范围内确认可导出成绩数据（抽样 3 条）", "success", 8, ["data-001", "sess-002"], ["rel-017"], { tactic: "TA0009", technique: "T1213", name: "Data from Information Repositories" }],
  [64, "evt-011", "collection", "evidence_collect", "保存脱敏响应片段与截图作为证据", "success", 4, ["data-001"], null, { tactic: "TA0009", technique: "T1213", name: "Data from Information Repositories" }],
  [66, "evt-012", "reporting", "report_finding", "汇总为高危发现并给出修复建议", "success", 5, ["finding-001"], ["rel-018"], { tactic: "TA0009", technique: "T1213", name: "Data from Information Repositories" }]
];
for (const [t, id, stage, action, summary, result, risk, node_ids, edge_ids, attck] of events) {
  add("event", t, {
    id, stage, action, summary, result, risk,
    node_ids, ...(edge_ids ? { edge_ids } : {}), ...(attck ? { attck } : {}),
    detail: "本记录来自隔离靶场中的授权验证，未对目标数据做任何修改。",
    duration_ms: 120000 + (risk * 1000)
  });
}

add("evidence", 62, {
  id: "evd-001",
  type: "http",
  node_id: "vuln-001",
  title: "导出接口未授权响应（已脱敏）",
  summary: "HTTP/1.1 200 OK，响应 JSON 仅包含字段名与 3 条脱敏样例，正文已裁剪。",
  hash: "sha256:9f2c1f4a6b8c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  path: "evidence/ENG-2026-101/evd-001.json",
  sensitive: true
});
add("evidence", 63, {
  id: "evd-002",
  type: "screenshot",
  node_id: "vuln-003",
  title: "OA 越权访问页面对比截图（已脱敏）",
  summary: "普通用户会话访问 /admin/user 成功返回用户管理页，截图已打码。",
  hash: "sha256:1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
  path: "evidence/ENG-2026-101/evd-002.png",
  sensitive: true
});
add("note", 67, {
  id: "note-001",
  content: "后续建议：先修复导出接口鉴权与后台弱口令，再复测横向路径；本链路仅覆盖 DMZ 与办公网两个网段。",
  node_ids: ["finding-001"]
});

const ordered = [items[0], ...items.slice(1).sort((a, b) => a.t - b.t || 0)];
let seq = 0;
const records = ordered.map((it) => {
  seq += 1;
  return { schema: SCHEMA, seq, ts: ts(it.t), kind: it.kind, source: "simulation", ...it.data };
});
const out = resolve(root, "data/fixtures/mini.jsonl");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
console.log(`written ${records.length} records -> ${out}`);
console.log(`stats: nodes=${nodes.length} edges=${edges.length} events=${events.length}`);
