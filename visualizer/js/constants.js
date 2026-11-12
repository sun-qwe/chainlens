/**
 * ChainLens 常量与视觉编码（严格对齐 docs/00-设计规格.md 第 3.8/3.9 节）。
 * 纯数据模块：不依赖 DOM，可被 Node 测试直接 import。
 */

export const SCHEMA_ID = 'dsh-pentest/chain@1';
export const APP_VERSION = '1.0.0';

/** 7 个阶段（顺序即链路图列序） */
export const STAGES = [
  { id: 'recon', zh: '侦察', index: 0, color: '#38bdf8' },
  { id: 'validation', zh: '验证', index: 1, color: '#8b5cf6' },
  { id: 'initial_access', zh: '初始访问', index: 2, color: '#f87171' },
  { id: 'privilege_escalation', zh: '权限提升', index: 3, color: '#f59e0b' },
  { id: 'lateral_movement', zh: '横向移动', index: 4, color: '#f472b6' },
  { id: 'collection', zh: '信息收集', index: 5, color: '#c084fc' },
  { id: 'reporting', zh: '报告输出', index: 6, color: '#34d399' }
];
export const STAGE_IDS = STAGES.map((s) => s.id);
export const STAGE_MAP = new Map(STAGES.map((s) => [s.id, s]));
export const STAGE_INDEX = new Map(STAGES.map((s) => [s.id, s.index]));

/** 10 种节点类型（中文名与主色见规格 3.8） */
export const NODE_TYPES = [
  { id: 'target', zh: '目标组织', color: '#8b5cf6', icon: 'flag' },
  { id: 'host', zh: '主机', color: '#38bdf8', icon: 'server' },
  { id: 'service', zh: '服务', color: '#22d3ee', icon: 'port' },
  { id: 'webapp', zh: 'Web 应用', color: '#34d399', icon: 'browser' },
  { id: 'endpoint', zh: '接口', color: '#a3e635', icon: 'code' },
  { id: 'vulnerability', zh: '漏洞', color: '#f87171', icon: 'shield' },
  { id: 'credential', zh: '凭据', color: '#fbbf24', icon: 'key' },
  { id: 'session', zh: '会话', color: '#f472b6', icon: 'terminal' },
  { id: 'data', zh: '数据', color: '#c084fc', icon: 'cube' },
  { id: 'finding', zh: '风险发现', color: '#fb923c', icon: 'alert' }
];
export const NODE_TYPE_IDS = NODE_TYPES.map((t) => t.id);
export const NODE_TYPE_MAP = new Map(NODE_TYPES.map((t) => [t.id, t]));

/** 严重度（规格 3.8） */
export const SEVERITIES = [
  { id: 'critical', zh: '严重', color: '#ef4444', rank: 5, weight: 10 },
  { id: 'high', zh: '高危', color: '#f97316', rank: 4, weight: 7 },
  { id: 'medium', zh: '中危', color: '#eab308', rank: 3, weight: 4 },
  { id: 'low', zh: '低危', color: '#22c55e', rank: 2, weight: 1 },
  { id: 'info', zh: '提示', color: '#64748b', rank: 1, weight: 0.2 }
];
export const SEVERITY_IDS = SEVERITIES.map((s) => s.id);
export const SEVERITY_MAP = new Map(SEVERITIES.map((s) => [s.id, s]));

/** 11 种关系（规格 3.5） */
export const RELATIONS = [
  { id: 'resolves_to', zh: '解析到', color: '#38bdf8' },
  { id: 'exposes', zh: '暴露', color: '#22d3ee' },
  { id: 'runs_on', zh: '运行于', color: '#2dd4bf' },
  { id: 'routes_to', zh: '路由到', color: '#34d399' },
  { id: 'has_vuln', zh: '存在漏洞', color: '#f87171' },
  { id: 'exploits', zh: '利用', color: '#ef4444' },
  { id: 'grants', zh: '授予权限', color: '#fbbf24' },
  { id: 'pivots_to', zh: '横向移动', color: '#f472b6' },
  { id: 'accesses', zh: '访问', color: '#c084fc' },
  { id: 'evidences', zh: '佐证', color: '#94a3b8' },
  { id: 'belongs_to', zh: '归属', color: '#64748b' }
];
export const RELATION_IDS = RELATIONS.map((r) => r.id);
export const RELATION_MAP = new Map(RELATIONS.map((r) => [r.id, r]));
/** 默认虚线绘制的关系 */
export const DASHED_RELATIONS = new Set(['evidences', 'belongs_to', 'routes_to']);

/** 事件结果（规格 3.6） */
export const RESULTS = [
  { id: 'success', zh: '成功', color: '#10b981' },
  { id: 'failure', zh: '失败', color: '#ef4444' },
  { id: 'partial', zh: '部分成功', color: '#f59e0b' },
  { id: 'info', zh: '信息', color: '#64748b' }
];
export const RESULT_IDS = RESULTS.map((r) => r.id);
export const RESULT_MAP = new Map(RESULTS.map((r) => [r.id, r]));

/** 证据类型（规格 3.7） */
export const EVIDENCE_TYPES = [
  { id: 'screenshot', zh: '截图', icon: 'browser' },
  { id: 'http', zh: 'HTTP 响应', icon: 'code' },
  { id: 'config', zh: '配置', icon: 'data' },
  { id: 'log', zh: '日志', icon: 'terminal' },
  { id: 'file', zh: '文件', icon: 'data' },
  { id: 'credential', zh: '凭据', icon: 'key' },
  { id: 'note', zh: '备注', icon: 'info' }
];
export const EVIDENCE_TYPE_IDS = EVIDENCE_TYPES.map((e) => e.id);
export const EVIDENCE_TYPE_MAP = new Map(EVIDENCE_TYPES.map((e) => [e.id, e]));

/** MITRE ATT&CK 允许的 tactic（规格 3.9） */
export const TACTICS = [
  { id: 'TA0043', zh: '侦察', en: 'Reconnaissance' },
  { id: 'TA0001', zh: '初始访问', en: 'Initial Access' },
  { id: 'TA0002', zh: '执行', en: 'Execution' },
  { id: 'TA0004', zh: '权限提升', en: 'Privilege Escalation' },
  { id: 'TA0005', zh: '防御规避', en: 'Defense Evasion' },
  { id: 'TA0006', zh: '凭据访问', en: 'Credential Access' },
  { id: 'TA0007', zh: '发现', en: 'Discovery' },
  { id: 'TA0008', zh: '横向移动', en: 'Lateral Movement' },
  { id: 'TA0009', zh: '收集', en: 'Collection' },
  { id: 'TA0011', zh: '命令与控制', en: 'Command and Control' },
  { id: 'TA0010', zh: '数据外泄', en: 'Exfiltration' },
  { id: 'TA0040', zh: '影响', en: 'Impact' }
];
export const TACTIC_MAP = new Map(TACTICS.map((t) => [t.id, t]));

/** 视图定义（顶栏 Tab） */
export const VIEWS = [
  { id: 'overview', zh: '总览', icon: 'target', shortcut: '1' },
  { id: 'graph', zh: '链路图', icon: 'layers', shortcut: '2' },
  { id: 'timeline', zh: '时间线', icon: 'clock', shortcut: '3' },
  { id: 'attack', zh: 'ATT&CK 矩阵', icon: 'shield', shortcut: '4' },
  { id: 'findings', zh: '发现与证据', icon: 'alert', shortcut: '5' },
  { id: 'report', zh: '分析报告', icon: 'report', shortcut: '6' }
];
export const VIEW_IDS = VIEWS.map((v) => v.id);

/** 内置兜底场景 ID */
export const FALLBACK_SCENARIO_ID = 'fallback';

/** 严重度权重 / 数据质量公式（规格 5.5） */
export const QUALITY_ERROR_PENALTY = 8;
export const QUALITY_WARNING_PENALTY = 2;

/** 事件动作中文映射（数据中可能出现的常用动作） */
export const ACTION_ZH = {
  port_scan: '端口扫描',
  service_fingerprint: '服务指纹识别',
  dir_enum: '目录枚举',
  vuln_verify: '漏洞验证',
  credential_guess: '凭据猜测',
  credential_reuse: '凭据复用',
  login: '登录',
  exploit_confirmed: '利用确认',
  exploit_attempt: '利用尝试',
  privilege_escalation: '权限提升',
  lateral_probe: '横向探测',
  lateral_move: '横向移动',
  web_fingerprint: 'Web 指纹识别',
  authz_bypass: '越权访问',
  data_export: '数据导出',
  data_access: '数据访问',
  evidence_collect: '证据采集',
  report_finding: '报告发现',
  internal_recon: '内网侦察',
  session_established: '会话建立',
  hash_dump: '凭据提取',
  config_read: '配置读取'
};

/** 时间线需要放大标记的关键动作 */
export const KEY_ACTIONS = new Set([
  'exploit_confirmed',
  'exploit_attempt',
  'credential_reuse',
  'privilege_escalation',
  'lateral_move',
  'authz_bypass',
  'data_export',
  'hash_dump'
]);

/** 回放节奏（规格 5.5） */
export const PLAYBACK_MIN_DELAY = 350;
export const PLAYBACK_MAX_DELAY = 1400;
export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4];

/** 常见敏感字段名（数据质量检测用） */
export const SENSITIVE_KEY_PATTERN =
  /^(password|passwd|pwd|token|cookie|secret|api[_-]?key|private[_-]?key|authorization|session[_-]?id)$/i;
