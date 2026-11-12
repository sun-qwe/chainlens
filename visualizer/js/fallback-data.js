/**
 * 内置兜底数据（规格 5.1：manifest 不可用时展示导入提示 + fallback 数据）。
 * 数据完全仿真、已脱敏，目标仅使用 RFC1918 私网与 .test 保留域。
 * 覆盖 10 种节点类型、11 种关系、7 个阶段、5 种严重度、ATT&CK 多战术与敏感证据打码场景。
 */
export const FALLBACK_SCENARIO_ID = 'fallback';
export const FALLBACK_SCENARIO = {
  id: FALLBACK_SCENARIO_ID,
  name: '星海大学实训靶场（内置演示数据）',
  file: null,
  builtin: true,
  size: 'demo',
  description: '离线兜底样例：约 80 条仿真记录，用于未检测到 data 目录时仍可完整演示六个视图。',
  stats: null
};

const SCHEMA = 'dsh-pentest/chain@1';
const BASE_UTC = Date.UTC(2026, 10, 1, 1, 0, 0); // 2026-11-01T09:00:00+08:00

/** 生成带 +08:00 偏移的时间戳（无毫秒） */
function ts(minute, second = 0) {
  const wall = new Date(BASE_UTC + (minute * 60 + second) * 1000 + 8 * 3600 * 1000);
  return wall.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

function rec(kind, minute, data, second = 0) {
  return { schema: SCHEMA, seq: 0, ts: ts(minute, second), kind, source: 'simulation', ...data };
}

function node(minute, id, type, label, stage, risk, props = {}, attck, confidence = 0.95) {
  return rec('node', minute, {
    id,
    type,
    label,
    stage,
    risk,
    confidence,
    props,
    ...(attck ? { attck } : {}),
    tags: []
  });
}

function edge(minute, id, from, to, relation, stage, weight = 0.9) {
  return rec('edge', minute, { id, from, to, relation, stage, weight, props: {} });
}

function event(minute, id, stage, action, summary, result, risk, nodeIds, edgeIds = [], attck = null, detail = '') {
  return rec('event', minute, {
    id,
    stage,
    action,
    summary,
    result,
    risk,
    node_ids: nodeIds,
    edge_ids: edgeIds,
    ...(attck ? { attck } : {}),
    ...(detail ? { detail } : {})
  });
}

function evidence(minute, id, type, nodeId, title, summary, sensitive, hash, path) {
  return rec('evidence', minute, {
    id,
    type,
    node_id: nodeId,
    title,
    summary,
    sensitive,
    ...(hash ? { hash } : {}),
    ...(path ? { path } : {})
  });
}

function note(minute, id, content, nodeIds = []) {
  return rec('note', minute, { id, content, node_ids: nodeIds });
}

const ATTCK = {
  scan: { tactic: 'TA0043', technique: 'T1595', name: 'Active Scanning' },
  discovery: { tactic: 'TA0007', technique: 'T1046', name: 'Network Service Discovery' },
  dir: { tactic: 'TA0007', technique: 'T1083', name: 'File and Directory Discovery' },
  exploit: { tactic: 'TA0001', technique: 'T1190', name: 'Exploit Public-Facing Application' },
  brute: { tactic: 'TA0006', technique: 'T1110', name: 'Brute Force' },
  validAccounts: { tactic: 'TA0001', technique: 'T1078', name: 'Valid Accounts' },
  remote: { tactic: 'TA0008', technique: 'T1021', name: 'Remote Services' },
  elevation: { tactic: 'TA0004', technique: 'T1548', name: 'Abuse Elevation Control Mechanism' },
  alternateAuth: { tactic: 'TA0008', technique: 'T1550', name: 'Use Alternate Authentication Material' },
  dump: { tactic: 'TA0006', technique: 'T1003', name: 'OS Credential Dumping' },
  collection: { tactic: 'TA0009', technique: 'T1213', name: 'Data from Information Repositories' }
};

const meta = rec('meta', 0, {
  engagement: {
    id: 'ENG-2026-001',
    name: '星海大学 Web 靶场授权测试',
    mode: 'simulation',
    scope: ['10.20.10.0/24', 'lab.starhai.test'],
    authorization: {
      basis: '《网络安全实训靶场使用授权书》（编号 LAB-2026-017）',
      expires_at: '2026-12-31T23:59:59+08:00'
    },
    operator: '孙博奥',
    team: ['红队 A 组'],
    started_at: ts(0),
    ended_at: null,
    description: '针对实训靶场 DMZ 与办公网段的授权仿真测试，全程在隔离网络中进行，仅做只读验证。'
  },
  tool: { name: 'dsh-pentest', version: '0.1.0' },
  scenario: 'campus-lab'
});

const nodes = [
  node(3, 'tgt-001', 'target', '星海大学实训靶场', 'recon', 2, {
    industry: '教育',
    domain: 'lab.starhai.test',
    region: '华东',
    owner: '网络中心'
  }),
  node(5, 'host-001', 'host', 'WEB-DMZ-01', 'recon', 6.5, {
    ip: '10.20.10.15',
    os: 'Ubuntu 22.04',
    exposure: 'dmz',
    critical: true,
    owner: '信息化办公室'
  }, ATTCK.discovery),
  node(6, 'svc-001', 'service', 'HTTPS / 443', 'recon', 4, {
    port: 443,
    protocol: 'tcp',
    product: 'nginx',
    version: '1.24.0'
  }),
  node(7, 'svc-002', 'service', 'SSH / 22', 'recon', 3.2, {
    port: 22,
    protocol: 'tcp',
    product: 'OpenSSH',
    version: '8.9p1'
  }),
  node(8, 'webapp-001', 'webapp', '实训教学平台', 'recon', 5, {
    url: 'https://lab.starhai.test',
    tech: ['Spring Boot', 'Vue 3'],
    auth: '账号密码 + 短信'
  }),
  node(10, 'ep-001', 'endpoint', 'GET /api/v2/export', 'validation', 6, {
    method: 'GET',
    path: '/api/v2/export',
    params: ['uid'],
    auth_required: false
  }, ATTCK.dir),
  node(12, 'vuln-001', 'vulnerability', '导出接口未授权访问', 'validation', 7.5, {
    severity: 'high',
    cvss: 7.5,
    cve: 'SIM-2026-0001',
    category: 'A01 访问控制失效',
    status: 'confirmed',
    recommendation: '为导出接口补充服务端鉴权与租户隔离校验。',
    description: '接口仅校验登录态而未校验对象归属，低权限账号可导出其他租户成绩数据。'
  }, ATTCK.exploit, 0.9),
  node(13, 'vuln-002', 'vulnerability', '管理后台弱口令', 'validation', 9.1, {
    severity: 'critical',
    cvss: 9.1,
    cve: 'SIM-2026-0002',
    category: 'A07 身份认证失效',
    status: 'confirmed',
    recommendation: '强制复杂口令并启用 MFA，限制管理入口来源。',
    description: '管理后台允许使用弱口令登录，且无失败次数限制。'
  }, ATTCK.brute, 0.9),
  node(15, 'cred-001', 'credential', '教师账号 t.chen', 'initial_access', 8, {
    account: 't.chen',
    kind: 'password',
    privilege: 'teacher',
    source: '弱口令验证',
    value: '[REDACTED]'
  }, ATTCK.validAccounts),
  node(17, 'sess-001', 'session', '教师后台会话', 'initial_access', 8.5, {
    user: 't.chen',
    privilege: 'teacher',
    host_id: 'host-001',
    valid_until: ts(120)
  }, ATTCK.validAccounts),
  node(20, 'host-002', 'host', 'OA-INTRANET-02', 'lateral_movement', 6.5, {
    ip: '10.20.20.31',
    os: 'Windows Server 2019',
    exposure: 'intranet',
    critical: true
  }, ATTCK.remote),
  node(21, 'svc-003', 'service', 'HTTP / 8080', 'lateral_movement', 5, {
    port: 8080,
    protocol: 'tcp',
    product: 'Apache Tomcat',
    version: '9.0.78'
  }),
  node(22, 'webapp-002', 'webapp', 'OA 办公系统', 'lateral_movement', 6, {
    url: 'http://10.20.20.31:8080/oa',
    tech: ['Java', 'Shiro'],
    auth: '统一身份认证'
  }),
  node(26, 'vuln-003', 'vulnerability', '普通用户越权访问管理员接口', 'lateral_movement', 6.8, {
    severity: 'high',
    cvss: 6.8,
    cve: 'SIM-2026-0003',
    category: 'A01 访问控制失效',
    status: 'confirmed',
    recommendation: '基于角色的服务端鉴权，补充越权测试用例。',
    description: 'OA 系统管理员接口仅在前端隐藏入口，普通用户可直接访问。'
  }, ATTCK.elevation, 0.9),
  node(28, 'sess-002', 'session', 'OA 普通用户会话', 'lateral_movement', 6, {
    user: 'u.zhang',
    privilege: 'employee',
    host_id: 'host-002',
    valid_until: ts(150)
  }, ATTCK.remote),
  node(31, 'host-003', 'host', 'DC-01 域控制器', 'lateral_movement', 9.2, {
    ip: '10.20.30.10',
    os: 'Windows Server 2022',
    exposure: 'intranet',
    critical: true
  }, ATTCK.remote),
  node(32, 'cred-002', 'credential', '域管备份账号哈希', 'lateral_movement', 9.6, {
    account: 'svc_backup',
    kind: 'hash',
    privilege: 'domain_admin',
    source: '内存抓取',
    value: '[REDACTED]'
  }, ATTCK.dump),
  node(34, 'sess-003', 'session', '域管理员会话', 'lateral_movement', 9.8, {
    user: 'svc_backup',
    privilege: 'domain_admin',
    host_id: 'host-003',
    valid_until: ts(160)
  }, ATTCK.alternateAuth),
  node(37, 'data-001', 'data', '学生成绩导出数据集', 'collection', 8, {
    kind: 'db',
    classification: 'confidential',
    path: '/api/v2/export?scope=grade'
  }, ATTCK.collection),
  node(39, 'data-002', 'data', '应用备份配置文件', 'collection', 5.3, {
    kind: 'config',
    classification: 'internal',
    path: '/opt/backup/app.env'
  }),
  node(43, 'finding-001', 'finding', '敏感数据未授权导出（综合发现）', 'reporting', 9, {
    severity: 'critical',
    title: '未授权导出学生成绩数据',
    impact: '可批量获取学生身份信息与成绩，违反数据最小化原则。',
    recommendation: '修复鉴权、审计导出行为，并对历史导出日志进行回溯。',
    status: 'open'
  }),
  node(44, 'finding-002', 'finding', '内网域控制器权限暴露（综合发现）', 'reporting', 9.4, {
    severity: 'critical',
    title: '域控制器可被完全接管',
    impact: '攻击者可获取全域管理员权限，影响整个办公网。',
    recommendation: '轮换域管凭据，启用分层管理与最小权限，部署凭据保护策略。',
    status: 'open'
  })
];

const edges = [
  edge(5, 'rel-001', 'host-001', 'tgt-001', 'belongs_to', 'recon'),
  edge(6, 'rel-002', 'host-001', 'svc-001', 'exposes', 'recon'),
  edge(6, 'rel-003', 'svc-001', 'host-001', 'runs_on', 'recon'),
  edge(7, 'rel-004', 'host-001', 'svc-002', 'exposes', 'recon'),
  edge(8, 'rel-005', 'webapp-001', 'host-001', 'runs_on', 'recon'),
  edge(8, 'rel-006', 'svc-001', 'webapp-001', 'exposes', 'recon'),
  edge(10, 'rel-007', 'webapp-001', 'ep-001', 'routes_to', 'validation'),
  edge(12, 'rel-008', 'ep-001', 'vuln-001', 'has_vuln', 'validation'),
  edge(13, 'rel-009', 'host-001', 'vuln-002', 'has_vuln', 'validation'),
  edge(15, 'rel-010', 'vuln-002', 'cred-001', 'grants', 'initial_access'),
  edge(17, 'rel-011', 'vuln-001', 'sess-001', 'grants', 'initial_access'),
  edge(17, 'rel-012', 'cred-001', 'sess-001', 'grants', 'initial_access'),
  edge(20, 'rel-013', 'sess-001', 'host-002', 'pivots_to', 'lateral_movement'),
  edge(21, 'rel-014', 'host-002', 'svc-003', 'exposes', 'lateral_movement'),
  edge(22, 'rel-015', 'svc-003', 'webapp-002', 'exposes', 'lateral_movement'),
  edge(26, 'rel-016', 'webapp-002', 'vuln-003', 'has_vuln', 'lateral_movement'),
  edge(28, 'rel-017', 'vuln-003', 'sess-002', 'grants', 'lateral_movement'),
  edge(31, 'rel-018', 'sess-002', 'host-003', 'pivots_to', 'lateral_movement'),
  edge(32, 'rel-019', 'cred-002', 'sess-003', 'grants', 'lateral_movement'),
  edge(34, 'rel-020', 'sess-003', 'host-003', 'runs_on', 'lateral_movement'),
  edge(37, 'rel-021', 'sess-002', 'data-001', 'accesses', 'collection'),
  edge(39, 'rel-022', 'sess-003', 'data-002', 'accesses', 'collection'),
  edge(42, 'rel-023', 'data-001', 'finding-001', 'evidences', 'reporting'),
  edge(42, 'rel-024', 'data-002', 'finding-001', 'evidences', 'reporting'),
  edge(44, 'rel-025', 'host-003', 'finding-002', 'evidences', 'reporting'),
  edge(44, 'rel-026', 'finding-002', 'tgt-001', 'belongs_to', 'reporting')
];

const events = [
  event(2, 'evt-001', 'recon', 'authorization_check', '确认授权范围与测试窗口，记录授权依据编号', 'info', 0, ['tgt-001']),
  event(4, 'evt-002', 'recon', 'port_scan', '对 DMZ 网段执行端口探测，发现 443/22 开放', 'success', 2, ['host-001', 'svc-001', 'svc-002'], [], ATTCK.scan),
  event(6, 'evt-003', 'recon', 'service_fingerprint', '识别 443 为 nginx 1.24.0，22 为 OpenSSH 8.9p1', 'success', 1, ['svc-001', 'svc-002'], [], ATTCK.discovery),
  event(9, 'evt-004', 'recon', 'dir_enum', '枚举到教学平台与 /api/v2 导出接口路径', 'success', 3, ['webapp-001', 'ep-001'], [], ATTCK.dir),
  event(11, 'evt-005', 'validation', 'vuln_verify', '管理接口未登录访问返回 403，不具备未授权访问', 'failure', 1.2, ['ep-001']),
  event(14, 'evt-006', 'validation', 'vuln_verify', '只读验证导出接口未鉴权，返回 200 与字段列表', 'success', 7.5, ['vuln-001', 'ep-001'], ['rel-008'], ATTCK.exploit, '使用只读 GET 请求验证，未修改任何数据。'),
  event(16, 'evt-007', 'validation', 'credential_guess', '在授权字典范围内验证后台弱口令成功', 'success', 9, ['vuln-002', 'cred-001'], ['rel-010'], ATTCK.brute),
  event(19, 'evt-008', 'initial_access', 'login', '使用教师账号登录后台，获得有效会话', 'success', 8, ['sess-001', 'cred-001'], ['rel-012'], ATTCK.validAccounts),
  event(20, 'evt-009', 'lateral_movement', 'lateral_probe', '探测内网 OA 主机可达性，确认 8080 端口开放', 'partial', 3, ['host-002'], ['rel-013'], ATTCK.remote),
  event(23, 'evt-010', 'lateral_movement', 'web_fingerprint', '识别 OA 系统为 Tomcat + Shiro 组合', 'success', 2, ['webapp-002'], [], ATTCK.discovery),
  event(24, 'evt-011', 'lateral_movement', 'lateral_probe', '尝试 SMB 中继被目标策略阻断', 'failure', 2, ['host-002'], [], ATTCK.remote),
  event(27, 'evt-012', 'lateral_movement', 'authz_bypass', '普通用户越权访问管理员接口成功', 'success', 6.8, ['vuln-003', 'sess-002'], ['rel-016', 'rel-017'], ATTCK.elevation),
  event(30, 'evt-013', 'lateral_movement', 'lateral_move', '借助 OA 会话横向移动到办公网主机', 'success', 9, ['sess-002', 'host-003'], ['rel-018'], ATTCK.alternateAuth),
  event(33, 'evt-014', 'lateral_movement', 'hash_dump', '在内存中提取到域管备份账号哈希（已脱敏）', 'success', 9.6, ['cred-002', 'host-003'], [], ATTCK.dump),
  event(36, 'evt-015', 'lateral_movement', 'lateral_move', '使用备用认证材料登录域控制器', 'success', 8.8, ['sess-003', 'host-003'], ['rel-019', 'rel-020'], ATTCK.alternateAuth),
  event(38, 'evt-016', 'collection', 'data_access', '只读确认成绩数据可批量导出（抽样 3 条）', 'success', 7.5, ['data-001'], ['rel-021'], ATTCK.collection),
  event(40, 'evt-017', 'collection', 'config_read', '读取应用备份配置，发现内网拓扑片段', 'success', 5, ['data-002'], ['rel-022'], ATTCK.collection),
  event(41, 'evt-018', 'collection', 'evidence_collect', '保存脱敏响应片段与配置哈希作为证据', 'success', 3, ['data-001', 'data-002'], [], ATTCK.collection),
  event(43, 'evt-019', 'reporting', 'report_finding', '汇总严重发现：未授权导出学生成绩数据', 'success', 3, ['finding-001'], ['rel-023', 'rel-024']),
  event(44, 'evt-020', 'reporting', 'report_finding', '汇总严重发现：内网域控制器可被接管', 'success', 3, ['finding-002'], ['rel-025']),
  event(47, 'evt-021', 'reporting', 'evidence_collect', '整理证据清单并复核脱敏结果', 'success', 2, ['finding-001', 'finding-002']),
  event(48, 'evt-022', 'reporting', 'report_summary', '输出阶段结论与修复优先级建议', 'info', 0, ['finding-001', 'finding-002']),
  event(45, 'evt-023', 'privilege_escalation', 'privilege_escalation', '确认应用管理员可读取数据库备份配置', 'partial', 6, ['sess-001', 'svc-003']),
  event(46, 'evt-024', 'privilege_escalation', 'config_read', '读取数据库连接串，确认为最小权限账号', 'info', 2, ['data-002', 'svc-003'])
];

const evidenceRecords = [
  evidence(
    49,
    'evd-001',
    'http',
    'vuln-001',
    '导出接口未授权响应（已脱敏）',
    'HTTP/1.1 200 OK，响应 JSON 仅保留字段名与 3 条脱敏样例，正文已裁剪。',
    true,
    'sha256:9f2c1f4a6b8c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    'evidence/ENG-2026-001/evd-001.json'
  ),
  evidence(
    50,
    'evd-002',
    'screenshot',
    'vuln-003',
    'OA 越权访问页面对比截图（已脱敏）',
    '普通用户会话访问 /admin/user 成功返回用户管理页，截图已打码。',
    true,
    'sha256:1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
    'evidence/ENG-2026-001/evd-002.png'
  ),
  evidence(
    51,
    'evd-003',
    'log',
    'cred-001',
    '后台登录日志片段（已脱敏）',
    '登录日志中账号与会话标识已替换为占位符，仅保留时间与结果。',
    true,
    'sha256:2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a',
    'evidence/ENG-2026-001/evd-003.log'
  ),
  evidence(
    52,
    'evd-004',
    'config',
    'data-002',
    '应用备份配置摘要（已脱敏）',
    '配置文件中的连接串与密钥字段已替换为 [REDACTED]。',
    true,
    'sha256:3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b',
    'evidence/ENG-2026-001/evd-004.env'
  ),
  evidence(
    53,
    'evd-005',
    'http',
    'ep-001',
    '接口响应头与状态码',
    '记录 403/200 两组响应头，用于说明鉴权差异，无敏感正文。',
    false,
    'sha256:4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c',
    'evidence/ENG-2026-001/evd-005.txt'
  ),
  evidence(
    54,
    'evd-006',
    'file',
    'sess-003',
    '域管会话凭据处理记录（已脱敏）',
    '记录哈希提取与验证流程，原始材料未入库。',
    true,
    'sha256:5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d',
    'evidence/ENG-2026-001/evd-006.md'
  ),
  evidence(
    55,
    'evd-007',
    'note',
    'finding-002',
    '域控暴露面梳理笔记',
    '域控开放端口与备份账号使用范围清单，已去除主机名与账号。',
    false,
    'sha256:6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e',
    'evidence/ENG-2026-001/evd-007.md'
  )
];

const notes = [
  note(56, 'note-001', '后续建议：先修复导出接口鉴权与后台弱口令，再复测横向路径。', ['finding-001']),
  note(57, 'note-002', '域控相关发现需要与蓝队联合复核，避免影响正常业务。', ['finding-002']),
  note(58, 'note-003', '本链路仅覆盖 DMZ 与办公网两个网段，云环境未在授权范围内。', ['tgt-001'])
];

let cachedRecords = null;

/** 构建并按时间排序的兜底记录（seq 从 1 开始严格递增） */
export function createFallbackRecords() {
  if (!cachedRecords) {
    const list = [meta, ...nodes, ...edges, ...events, ...evidenceRecords, ...notes];
    list.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    list.forEach((record, index) => {
      record.seq = index + 1;
    });
    cachedRecords = list;
  }
  return cachedRecords.map((record) => JSON.parse(JSON.stringify(record)));
}

/** 兜底数据的 JSONL 文本（bench / 导入演示可用） */
export function fallbackJsonl() {
  return createFallbackRecords()
    .map((record) => JSON.stringify(record))
    .join('\n');
}

