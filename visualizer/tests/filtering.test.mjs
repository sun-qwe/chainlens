/**
 * 筛选逻辑测试（node:test，不依赖 DOM）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeFilterCount,
  emptyFilters,
  filterChain,
  filterEvidenceList,
  filterFindings,
  filterLabels,
  hasActiveFilters,
  normalizeFilters
} from '../js/filtering.js';
import { parseChain } from '../js/parser.js';
import { getDerived } from '../js/analytics.js';
import { makeRecords } from './helpers.mjs';

const chain = parseChain(makeRecords());
const derived = getDerived(chain);

test('空筛选返回全部对象', () => {
  const filtered = filterChain(chain, emptyFilters());
  assert.equal(filtered.nodeIds.size, chain.nodes.length);
  assert.equal(filtered.edgeIds.size, chain.edges.length);
  assert.equal(filtered.eventIds.size, chain.events.length);
  assert.equal(hasActiveFilters(emptyFilters()), false);
});

test('阶段与节点类型组合筛选', () => {
  const filtered = filterChain(chain, { stages: ['recon'], types: ['host'] });
  assert.deepEqual([...filtered.nodeIds], ['host-001']);
  assert.equal(filtered.edgeIds.size, 0);
  assert.equal(filtered.eventIds.size, 1); // evt-001 关联 host-001
});

test('搜索匹配节点标签 / 事件摘要 / props', () => {
  assert.ok(filterChain(chain, { q: '测试漏洞' }).nodeIds.has('vuln-001'));
  assert.ok(filterChain(chain, { q: '导出测试数据' }).eventIds.has('evt-004'));
  assert.ok(filterChain(chain, { q: '10.30.0.10' }).nodeIds.has('host-001'));
});

test('严重度筛选作用于漏洞 / 发现节点', () => {
  const filtered = filterChain(chain, { severities: ['critical'] });
  assert.ok(filtered.nodeIds.has('finding-001'));
  assert.equal(filtered.nodeIds.has('vuln-001'), false);
  assert.ok(filtered.nodeIds.has('host-001')); // 非风险节点不受严重度筛选影响
});

test('结果筛选作用于事件', () => {
  const filtered = filterChain(chain, { results: ['failure'] });
  assert.deepEqual([...filtered.eventIds], ['evt-005']);
});

test('关系筛选只保留相关节点', () => {
  const filtered = filterChain(chain, { relations: ['grants'] });
  assert.equal(filtered.edgeIds.has('rel-004'), true);
  assert.equal(filtered.nodeIds.has('cred-001'), true);
  assert.equal(filtered.nodeIds.has('host-001'), false);
});

test('发现与证据列表筛选', () => {
  const high = filterFindings(derived.findings, { severities: ['high'] });
  assert.equal(high.length, 1);
  assert.equal(high[0].id, 'vuln-001');
  const searched = filterFindings(derived.findings, { q: '测试漏洞' });
  assert.equal(searched.length, 1);
  const evidence = filterEvidenceList(derived.evidenceList, { q: '登录' });
  assert.deepEqual(
    evidence.map((item) => item.id),
    ['evd-002']
  );
});

test('敏感证据摘要不参与搜索', () => {
  const summaryOnly = filterEvidenceList(derived.evidenceList, { q: '字段已裁剪' });
  assert.equal(summaryOnly.length, 0);
  const masked = filterEvidenceList(derived.evidenceList, { q: '未授权响应' });
  assert.equal(masked.length, 1);
});

test('筛选条件规范化与标签', () => {
  const normalized = normalizeFilters({
    q: '  TEST  ',
    stages: ['recon', 'bogus'],
    types: ['host', 'host'],
    severities: ['high'],
    results: ['success']
  });
  assert.equal(normalized.q, 'test');
  assert.deepEqual(normalized.stages, ['recon']);
  assert.deepEqual(normalized.types, ['host']);
  assert.equal(activeFilterCount(normalized), 5);
  const labels = filterLabels(normalized);
  assert.ok(labels.some((label) => label.includes('阶段')));
  assert.ok(labels.some((label) => label.includes('高危')));
});
