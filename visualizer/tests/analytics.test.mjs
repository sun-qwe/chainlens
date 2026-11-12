/**
 * 指标与前端分析算法单元测试（规格 5.5，node:test，不依赖 DOM）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attackCoverage,
  criticalPath,
  dataQuality,
  durationMs,
  evidenceCoverage,
  getDerived,
  longestSilence,
  nodeTypeCounts,
  playbackPlan,
  riskBreakdown,
  riskScore,
  stageCounts,
  stageDurationMs,
  stageStats,
  successRate,
  severityCounts,
  summarise,
  timeBuckets,
  topRiskNodes
} from '../js/analytics.js';
import { parseChain } from '../js/parser.js';
import { makeRecords, iso } from './helpers.mjs';

const chain = parseChain(makeRecords());

test('节点类型 / 阶段 / 严重度计数', () => {
  const types = nodeTypeCounts(chain);
  assert.equal(types.length, 10);
  assert.equal(types.find((type) => type.id === 'host').count, 1);
  assert.equal(types.find((type) => type.id === 'service').count, 0);

  const stages = stageCounts(chain);
  assert.equal(stages.length, 7);
  assert.equal(stages.find((stage) => stage.id === 'recon').nodes, 2);
  assert.equal(stages.find((stage) => stage.id === 'collection').nodes, 1);
  assert.equal(stages.find((stage) => stage.id === 'reporting').events, 1);

  const severities = severityCounts(chain);
  assert.equal(severities.find((severity) => severity.id === 'critical').count, 1);
  assert.equal(severities.find((severity) => severity.id === 'high').count, 1);
});

test('事件跨度、阶段统计与最长静默', () => {
  assert.equal(durationMs(chain), 360000);
  const stats = stageStats(chain);
  assert.equal(stats.find((stage) => stage.stage === 'recon').events, 1);
  assert.equal(stats.find((stage) => stage.stage === 'reporting').firstTs, Date.parse(iso(7)));
  const durations = stageDurationMs(chain);
  assert.equal(durations.find((item) => item.stage === 'recon').durationMs, 0);
  assert.equal(longestSilence(chain).gapMs, 120000);
});

test('事件成功率与成功 / 失败 / 部分计数', () => {
  const rate = successRate(chain);
  assert.equal(rate.success, 3);
  assert.equal(rate.failure, 1);
  assert.equal(rate.partial, 1);
  assert.equal(rate.ratio, 0.6);
});

test('关键路径：阶段前向 DAG 最长路径与同阶段 ts 约束', () => {
  const path = criticalPath(chain);
  assert.equal(path.fallback, false);
  assert.deepEqual(
    path.nodes.map((node) => node.id),
    ['target-001', 'host-001', 'vuln-001', 'cred-001', 'sess-001', 'data-001', 'finding-001']
  );
  assert.equal(path.edges.length, 6);
  assert.equal(path.score, 48);
  assert.deepEqual(path.stages, ['recon', 'validation', 'initial_access', 'collection', 'reporting']);
  // 回流边 rel-007 不应进入关键路径
  assert.equal(path.edges.some((edge) => edge.id === 'rel-007'), false);
});

test('关键路径：无前向边时回退到最高风险节点', () => {
  const meta = makeRecords().find((record) => record.kind === 'meta');
  const nodes = [
    { ...makeRecords().find((record) => record.id === 'target-001'), ts: iso(1), seq: 2 },
    { ...makeRecords().find((record) => record.id === 'host-001'), ts: iso(2), seq: 3, risk: 9 }
  ];
  const backEdge = {
    ...makeRecords().find((record) => record.kind === 'edge'),
    id: 'rel-back',
    from: 'host-001',
    to: 'target-001',
    ts: iso(3),
    seq: 4
  };
  const fallbackChain = parseChain([meta, ...nodes, backEdge]);
  const path = criticalPath(fallbackChain);
  assert.equal(path.fallback, true);
  assert.equal(path.nodes.length, 1);
  assert.equal(path.nodes[0].id, 'host-001');
  assert.equal(path.score, 10);
});

test('ATT&CK 覆盖：tactic / technique 去重与事件计数', () => {
  const coverage = attackCoverage(chain);
  assert.equal(coverage.tacticCount, 4);
  assert.equal(coverage.techniqueCount, 4);
  assert.equal(coverage.recordCount, 5);
  assert.ok(coverage.usedTactics.every((tactic) => tactic.recordCount > 0));
  const initial = coverage.usedTactics.find((tactic) => tactic.id === 'TA0001');
  assert.ok(initial.techniques.some((tech) => tech.id === 'T1190' && tech.eventCount === 1));
});

test('证据覆盖：直接关联与 evidences 关系均计入', () => {
  const coverage = evidenceCoverage(chain);
  assert.equal(coverage.total, 2);
  assert.equal(coverage.covered, 2);
  assert.equal(coverage.ratio, 1);
  assert.deepEqual(coverage.missing, []);
});

test('风险分：severity 权重 × confidence，一位小数', () => {
  const breakdown = riskBreakdown(chain);
  assert.equal(breakdown.total, 13.5);
  assert.equal(riskScore(chain), 13.5);
  assert.equal(breakdown.bySeverity.find((item) => item.id === 'critical').score, 10);
  assert.equal(breakdown.bySeverity.find((item) => item.id === 'high').score, 3.5);
});

test('数据质量评分公式与下限', () => {
  assert.equal(dataQuality({ errors: [], warnings: [] }).score, 100);
  assert.equal(dataQuality({ errors: [1], warnings: [] }).score, 92);
  assert.equal(dataQuality({ errors: [1], warnings: [1, 2] }).score, 88);
  assert.equal(dataQuality({ errors: new Array(20).fill(1), warnings: [] }).score, 0);
  const level = dataQuality({ errors: [], warnings: [] });
  assert.equal(level.level, 'excellent');
});

test('时间密度桶与 Top 风险节点', () => {
  const buckets = timeBuckets(chain);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].count, 5);
  assert.equal(buckets[0].riskSum, 25);
  const top = topRiskNodes(chain, 3);
  assert.equal(top[0].id, 'finding-001');
  assert.equal(top[0].risk, 9);
});

test('回放节奏归一化：350–1400ms，速度按比例缩短', () => {
  const plan = playbackPlan(chain, 1);
  assert.equal(plan.length, chain.events.length);
  assert.equal(plan[0].baseDelayMs, 350);
  for (const item of plan) {
    assert.ok(item.baseDelayMs >= 350 && item.baseDelayMs <= 1400);
  }
  assert.equal(Math.max(...plan.map((item) => item.baseDelayMs)), 1400);
  const fast = playbackPlan(chain, 2);
  assert.equal(fast[1].delayMs, Math.round(1400 / 2));
});

test('派生数据与摘要一致', () => {
  const derived = getDerived(chain);
  assert.equal(derived.criticalPath.score, 48);
  assert.equal(derived.quality.score, 100);
  assert.equal(derived.findings.length, 2);
  assert.equal(derived.findings[0].severity, 'critical');
  assert.equal(derived.findings[1].assetLabel, 'TEST-HOST-01');
  const summary = summarise(chain);
  assert.equal(summary.nodes, 7);
  assert.equal(summary.criticalPathScore, 48);
  assert.equal(summary.attackTactics, 4);
  assert.equal(derived.nodeTypeCounts.find((type) => type.id === 'finding').count, 1);
});
