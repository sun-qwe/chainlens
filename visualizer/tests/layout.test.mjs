/**
 * 布局算法单元测试：确定性与结构约束（node:test，不依赖 DOM）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_METRICS, layoutForce, layoutGraph, layoutLayered } from '../js/layout.js';
import { parseChain } from '../js/parser.js';
import { STAGE_INDEX } from '../js/constants.js';
import { makeRecords } from './helpers.mjs';

const chain = parseChain(makeRecords());

function deepEqualPositions(a, b) {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  assert.deepEqual(keysA, keysB);
  for (const key of keysA) {
    assert.equal(a[key].x, b[key].x);
    assert.equal(a[key].y, b[key].y);
  }
}

test('分层布局：阶段列、坐标完整、确定性', () => {
  const first = layoutLayered(chain.nodes, chain.edges);
  const second = layoutLayered(chain.nodes, chain.edges);
  assert.equal(Object.keys(first.positions).length, chain.nodes.length);
  assert.equal(first.columns.length, 7);
  assert.ok(first.width > 0 && first.height > 0);
  assert.equal(first.mode, 'layered');
  deepEqualPositions(first.positions, second.positions);
  assert.equal(first.width, second.width);
  assert.equal(first.height, second.height);
});

test('分层布局：节点落在所属阶段列内，且无重叠', () => {
  const layout = layoutLayered(chain.nodes, chain.edges);
  for (const node of chain.nodes) {
    const pos = layout.positions[node.id];
    const column = layout.columns[STAGE_INDEX.get(node.stage)];
    assert.ok(pos.x >= column.x - 0.5, `${node.id} 不在阶段列起点之后`);
    assert.ok(pos.x <= column.x + column.width + 0.5, `${node.id} 超出阶段列宽度`);
    assert.ok(pos.y >= LAYOUT_METRICS.paddingY - 0.5);
    assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y));
  }
});

test('大阶段自动换行：节点较多时生成多个子列并控制高度', () => {
  const many = [];
  for (let i = 0; i < 60; i += 1) {
    many.push({
      id: `host-${String(i).padStart(3, '0')}`,
      type: 'host',
      label: `主机 ${i}`,
      stage: 'recon',
      risk: 1,
      confidence: 1,
      props: {},
      tsMs: i
    });
  }
  const layout = layoutLayered(many, [], { maxRows: 14 });
  const recon = layout.columns[0];
  assert.ok(recon.subColumns >= 4);
  assert.equal(Object.keys(layout.positions).length, 60);
  assert.ok(layout.height < 60 * LAYOUT_METRICS.rowGap);
  assert.equal(layout.meta.maxRows, 14);
});

test('力导向布局：固定种子确定性', () => {
  const a = layoutForce(chain.nodes, chain.edges, { iterations: 40 });
  const b = layoutForce(chain.nodes, chain.edges, { iterations: 40 });
  assert.equal(a.mode, 'force');
  assert.equal(Object.keys(a.positions).length, chain.nodes.length);
  deepEqualPositions(a.positions, b.positions);
  assert.ok(a.width > 0 && a.height > 0);
});

test('layoutGraph 按模式分发且空输入安全', () => {
  assert.equal(layoutGraph('layered', chain.nodes, chain.edges).mode, 'layered');
  assert.equal(layoutGraph('force', chain.nodes, chain.edges, { iterations: 5 }).mode, 'force');
  const empty = layoutLayered([], []);
  assert.deepEqual(empty.positions, {});
  assert.equal(empty.width, 0);
  const emptyForce = layoutForce([], []);
  assert.deepEqual(emptyForce.positions, {});
});
