/**
 * 解析 / 归一化 / 语义校验单元测试（node:test，不依赖 DOM）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChain, toJsonl } from '../js/parser.js';
import { makeRecords, makeJsonl, iso } from './helpers.mjs';

const clean = () => makeRecords();
const meta = () => clean().find((record) => record.kind === 'meta');
const firstNode = () => clean().find((record) => record.kind === 'node');
const firstEdge = () => clean().find((record) => record.kind === 'edge');

test('解析合成 JSON 数组：统计、排序与引用', () => {
  const chain = parseChain(clean(), { source: 'test' });
  assert.equal(chain.ok, true);
  assert.equal(chain.fatal.length, 0);
  assert.equal(chain.errors.length, 0);
  assert.equal(chain.warnings.length, 0);
  assert.equal(chain.nodes.length, 7);
  assert.equal(chain.edges.length, 7);
  assert.equal(chain.events.length, 5);
  assert.equal(chain.evidences.length, 2);
  assert.equal(chain.notes.length, 1);
  assert.equal(chain.meta.engagement.name, '单元测试场景');
  assert.equal(chain.stats.acceptedRecords, clean().length);
  // 集合按时间排序
  const times = chain.events.map((event) => event.tsMs);
  assert.deepEqual(times, times.slice().sort((a, b) => a - b));
});

test('解析 JSONL 文本与 JSON 数组结果一致', () => {
  const fromArray = parseChain(clean());
  const fromText = parseChain(makeJsonl());
  assert.equal(fromText.ok, true);
  assert.equal(fromText.nodes.length, fromArray.nodes.length);
  assert.equal(fromText.edges.length, fromArray.edges.length);
  assert.equal(fromText.stats.skippedLines, 0);
});

test('坏行跳过并计数，不影响其余记录', () => {
  const text = `${makeJsonl()}\n{ this is not json`;
  const chain = parseChain(text);
  assert.equal(chain.ok, true);
  assert.equal(chain.skippedLines, 1);
  assert.equal(chain.errors.filter((error) => error.code === 'bad-json').length, 1);
  assert.equal(chain.nodes.length, 7);
});

test('空输入 / 缺失 meta / 无节点为阻断性错误', () => {
  const empty = parseChain('');
  assert.ok(empty.fatal.some((issue) => issue.code === 'empty'));
  assert.equal(empty.ok, false);

  const noMeta = parseChain(clean().filter((record) => record.kind !== 'meta'));
  assert.ok(noMeta.fatal.some((issue) => issue.code === 'missing-meta'));
  assert.equal(noMeta.meta, null);
  assert.equal(noMeta.ok, false);

  const noNodes = parseChain([meta()]);
  assert.ok(noNodes.fatal.some((issue) => issue.code === 'no-nodes'));
  assert.equal(noNodes.ok, false);
});

test('重复 id 被拒绝且只保留首条', () => {
  const node = firstNode();
  const duplicate = { ...node, ts: iso(30), seq: 999 };
  const chain = parseChain([meta(), node, duplicate]);
  assert.equal(chain.nodes.length, 1);
  assert.ok(chain.errors.some((error) => error.code === 'duplicate-id'));
});

test('非法枚举记录被跳过并产生错误', () => {
  const node = { ...firstNode(), id: 'alien-001', type: 'alien' };
  const chain = parseChain([meta(), node]);
  assert.equal(chain.nodes.length, 0);
  assert.ok(chain.errors.some((error) => error.code === 'node-type'));
  assert.equal(chain.ok, false);
});

test('悬挂引用产生聚合 warning', () => {
  const edge = { ...firstEdge(), id: 'rel-999', from: 'not-exist-01', to: 'also-no-01' };
  const chain = parseChain([meta(), firstNode(), edge]);
  assert.ok(chain.warnings.some((warning) => warning.code === 'dangling-edge'));
  assert.equal(chain.ok, true);
});

test('时间倒序与 seq 倒序产生 warning', () => {
  const a = { ...firstNode(), ts: iso(5), seq: 2 };
  const b = { ...firstNode(), id: 'host-002', ts: iso(4), seq: 3 };
  const chain = parseChain([meta(), a, b]);
  assert.ok(chain.warnings.some((warning) => warning.code === 'ts-order'));
});

test('敏感字段检测：未脱敏值告警，[REDACTED] 不告警', () => {
  const nodeA = { ...firstNode(), props: { password: 'hunter2' } };
  const nodeB = { ...firstNode(), id: 'host-002', ts: iso(3), props: { token: '[REDACTED]' } };
  const chain = parseChain([meta(), nodeA, nodeB]);
  const sensitive = chain.warnings.filter((warning) => warning.code === 'sensitive-value');
  assert.equal(sensitive.length, 1);
  assert.match(sensitive[0].message, /敏感/);
});

test('schema 错误与非法 JSON 根类型', () => {
  const bad = { ...firstNode(), schema: 'other/schema@9' };
  const chain = parseChain([meta(), bad]);
  assert.ok(chain.errors.some((error) => error.code === 'schema'));
  const wrongRoot = parseChain('{"schema":"x"}');
  assert.equal(wrongRoot.ok, false);
});

test('meta 字段缺失时记录错误但仍可展示', () => {
  const badMeta = {
    ...meta(),
    engagement: {
      id: 'ENG-2026-900',
      name: '测试',
      mode: 'unknown',
      scope: [],
      operator: '测试员',
      started_at: iso(0)
    }
  };
  const chain = parseChain([badMeta, firstNode()]);
  assert.ok(chain.errors.some((error) => error.code === 'meta-fields'));
  assert.equal(chain.meta.engagement.mode, 'unknown');
});

test('toJsonl 可被重新解析（round-trip）', () => {
  const text = toJsonl(clean());
  const chain = parseChain(text);
  assert.equal(chain.ok, true);
  assert.equal(chain.nodes.length, 7);
});

test('布尔 / 数值规范化：risk 夹取与默认值', () => {
  const node = { ...firstNode(), id: 'host-003', risk: 99, confidence: 2 };
  const chain = parseChain([meta(), node]);
  const parsed = chain.nodes.find((item) => item.id === 'host-003');
  assert.equal(parsed.risk, 10);
  assert.equal(parsed.confidence, 1);
  assert.ok(chain.warnings.some((warning) => warning.code === 'risk'));
  assert.ok(chain.warnings.some((warning) => warning.code === 'confidence'));
});
