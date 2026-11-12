/**
 * 测试用合成数据：覆盖全部 7 个阶段（6 个有记录）、节点/关系/事件/证据/批注、
 * ATT&CK 映射、敏感证据、阶段前向与回流边。
 */
export const SCHEMA = 'dsh-pentest/chain@1';
const BASE = Date.UTC(2026, 10, 1, 1, 0, 0); // 2026-11-01 09:00 +08:00

/** 生成 +08:00 的无毫秒时间戳 */
export function iso(minute = 0) {
  const wall = new Date(BASE + minute * 60000 + 8 * 3600 * 1000);
  return wall.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

function rec(kind, seq, minute, data) {
  return { schema: SCHEMA, seq, ts: iso(minute), kind, source: 'simulation', ...data };
}

/** 返回合成记录数组（可直接传给 parseChain；按 ts 排序后重新分配 seq） */
export function makeRecords() {
  const records = [
    rec('meta', 1, 0, {
      engagement: {
        id: 'ENG-2026-900',
        name: '单元测试场景',
        mode: 'simulation',
        scope: ['10.30.0.0/24', 'unit.test'],
        authorization: { basis: '《单元测试授权》LAB-2026-900', expires_at: iso(1000) },
        operator: '测试员',
        team: ['测试组'],
        started_at: iso(0),
        ended_at: null,
        description: '用于 node:test 的合成数据。'
      },
      tool: { name: 'dsh-pentest', version: '0.1.0' },
      scenario: 'unit-test'
    }),
    rec('node', 2, 1, {
      id: 'target-001',
      type: 'target',
      label: '测试目标组织',
      stage: 'recon',
      risk: 2,
      confidence: 1,
      props: { industry: '测试' }
    }),
    rec('node', 3, 2, {
      id: 'host-001',
      type: 'host',
      label: 'TEST-HOST-01',
      stage: 'recon',
      risk: 5,
      confidence: 0.9,
      props: { ip: '10.30.0.10', exposure: 'dmz' },
      attck: { tactic: 'TA0007', technique: 'T1046', name: 'Network Service Discovery' }
    }),
    rec('node', 4, 3, {
      id: 'vuln-001',
      type: 'vulnerability',
      label: '测试漏洞',
      stage: 'validation',
      risk: 7,
      confidence: 0.5,
      props: { severity: 'high', cvss: 7.1, status: 'confirmed', recommendation: '修复鉴权' },
      attck: { tactic: 'TA0001', technique: 'T1190', name: 'Exploit Public-Facing Application' }
    }),
    rec('node', 5, 4, {
      id: 'cred-001',
      type: 'credential',
      label: '测试凭据',
      stage: 'initial_access',
      risk: 6,
      confidence: 0.9,
      props: { kind: 'password', account: 'test', value: '[REDACTED]' },
      attck: { tactic: 'TA0006', technique: 'T1078', name: 'Valid Accounts' }
    }),
    rec('node', 6, 5, {
      id: 'sess-001',
      type: 'session',
      label: '测试会话',
      stage: 'initial_access',
      risk: 8,
      confidence: 1,
      props: { user: 'test', privilege: 'admin' }
    }),
    rec('node', 7, 6, {
      id: 'data-001',
      type: 'data',
      label: '测试数据集',
      stage: 'collection',
      risk: 4,
      confidence: 1,
      props: { kind: 'db', classification: 'confidential' }
    }),
    rec('node', 8, 7, {
      id: 'finding-001',
      type: 'finding',
      label: '综合风险发现',
      stage: 'reporting',
      risk: 9,
      confidence: 1,
      props: { severity: 'critical', status: 'open', recommendation: '限制导出' }
    }),
    rec('edge', 9, 2, { id: 'rel-001', from: 'target-001', to: 'host-001', relation: 'resolves_to', stage: 'recon', weight: 0.9 }),
    rec('edge', 10, 3, { id: 'rel-002', from: 'host-001', to: 'vuln-001', relation: 'has_vuln', stage: 'validation', weight: 1 }),
    rec('edge', 11, 4, { id: 'rel-003', from: 'vuln-001', to: 'cred-001', relation: 'exploits', stage: 'initial_access', weight: 1 }),
    rec('edge', 12, 4, { id: 'rel-004', from: 'cred-001', to: 'sess-001', relation: 'grants', stage: 'initial_access', weight: 1 }),
    rec('edge', 13, 5, { id: 'rel-005', from: 'sess-001', to: 'data-001', relation: 'accesses', stage: 'collection', weight: 1 }),
    rec('edge', 14, 6, { id: 'rel-006', from: 'data-001', to: 'finding-001', relation: 'evidences', stage: 'reporting', weight: 1 }),
    // 回流边：关键路径算法应忽略
    rec('edge', 15, 7, { id: 'rel-007', from: 'finding-001', to: 'target-001', relation: 'belongs_to', stage: 'reporting', weight: 1 }),
    rec('event', 16, 1, {
      id: 'evt-001',
      stage: 'recon',
      action: 'port_scan',
      summary: '扫描测试主机端口',
      result: 'success',
      risk: 2,
      node_ids: ['target-001', 'host-001'],
      attck: { tactic: 'TA0043', technique: 'T1595', name: 'Active Scanning' }
    }),
    rec('event', 17, 3, {
      id: 'evt-002',
      stage: 'validation',
      action: 'vuln_verify',
      summary: '验证鉴权缺陷',
      result: 'success',
      risk: 7,
      node_ids: ['vuln-001'],
      edge_ids: ['rel-002'],
      attck: { tactic: 'TA0001', technique: 'T1190', name: 'Exploit Public-Facing Application' }
    }),
    rec('event', 18, 4, {
      id: 'evt-003',
      stage: 'initial_access',
      action: 'exploit_confirmed',
      summary: '利用漏洞获得会话',
      result: 'success',
      risk: 8,
      node_ids: ['vuln-001', 'cred-001', 'sess-001'],
      edge_ids: ['rel-003', 'rel-004'],
      duration_ms: 185000
    }),
    rec('event', 19, 5, {
      id: 'evt-004',
      stage: 'collection',
      action: 'data_export',
      summary: '导出测试数据（部分成功）',
      result: 'partial',
      risk: 5,
      node_ids: ['sess-001', 'data-001'],
      edge_ids: ['rel-005']
    }),
    rec('event', 20, 7, {
      id: 'evt-005',
      stage: 'reporting',
      action: 'report_finding',
      summary: '记录风险发现（失败一次）',
      result: 'failure',
      risk: 3,
      node_ids: ['finding-001'],
      edge_ids: ['rel-006']
    }),
    rec('evidence', 21, 5, {
      id: 'evd-001',
      type: 'http',
      title: '未授权响应（已脱敏）',
      node_id: 'vuln-001',
      summary: 'HTTP 200，字段已裁剪。',
      sensitive: true
    }),
    rec('evidence', 22, 7, {
      id: 'evd-002',
      type: 'log',
      title: '登录日志',
      node_id: 'sess-001',
      summary: '登录成功。',
      sensitive: false
    }),
    rec('note', 23, 8, { id: 'note-001', content: '测试批注：关注鉴权问题。', node_ids: ['finding-001'] })
  ];
  records.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  records.forEach((record, index) => {
    record.seq = index + 1;
  });
  return records;
}

/** 合成链路的 JSONL 文本 */
export function makeJsonl() {
  return makeRecords()
    .map((record) => JSON.stringify(record))
    .join('\n');
}

/** 最小合法 meta 记录 */
export function metaRecord(seq = 1, minute = 0) {
  return makeRecords()[0] ? { ...makeRecords()[0], seq, ts: iso(minute) } : null;
}
