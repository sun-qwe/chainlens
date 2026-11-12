/**
 * 回放状态与游标单元测试（node:test，不依赖 DOM）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentEvent,
  normalizeCursor,
  progressRatio,
  snapshot,
  stepCursor,
  visibleState
} from '../js/replay.js';
import { parseChain } from '../js/parser.js';
import { makeRecords } from './helpers.mjs';

const chain = parseChain(makeRecords());
const total = chain.events.length;

test('cursor 归一化：null / 越界 / 非法值', () => {
  assert.equal(normalizeCursor(chain, null), null);
  assert.equal(normalizeCursor(chain, 0), 0);
  assert.equal(normalizeCursor(chain, 3.9), 3);
  assert.equal(normalizeCursor(chain, 999), total);
  assert.equal(normalizeCursor(chain, -5), 0);
  assert.equal(normalizeCursor(chain, 'abc'), null);
});

test('cursor=0 时没有任何可见对象', () => {
  const state = visibleState(chain, 0);
  assert.equal(state.total, total);
  assert.equal(state.visibleNodes.size, 0);
  assert.equal(state.visibleEdges.size, 0);
  assert.equal(state.currentEvent, null);
  assert.equal(state.complete, false);
});

test('回放中途：可见对象逐步增加，且当前事件正确', () => {
  const state = visibleState(chain, 2);
  assert.ok(state.visibleNodes.size >= 2);
  assert.ok(state.visibleNodes.has('target-001'));
  assert.equal(state.currentEvent.id, 'evt-002');
  assert.equal(state.currentIndex, 1);
  assert.equal(state.currentNodes.has('vuln-001'), true);
  assert.ok(state.visibleEdges.has('rel-002') || state.visibleEdges.size >= 1);
});

test('cursor=null 或到达末尾时全部可见', () => {
  const full = visibleState(chain, null);
  assert.equal(full.visibleNodes.size, chain.nodes.length);
  assert.equal(full.visibleEdges.size, chain.edges.length);
  assert.equal(full.complete, true);
  const end = visibleState(chain, total);
  assert.equal(end.visibleNodes.size, chain.nodes.length);
  assert.equal(end.currentEvent.id, chain.events[total - 1].id);
});

test('步进与进度比例', () => {
  assert.equal(stepCursor(chain, 2, 1), 3);
  assert.equal(stepCursor(chain, 0, -1), 0);
  assert.equal(stepCursor(chain, null, -1), total - 1);
  assert.equal(progressRatio(chain, null), 1);
  assert.equal(progressRatio(chain, 0), 0);
  assert.equal(progressRatio(chain, total / 2), 0.4);
  assert.equal(progressRatio(chain, 3), 0.6);
});

test('currentEvent 与回放快照', () => {
  assert.equal(currentEvent(chain, 0), null);
  assert.equal(currentEvent(chain, 3).id, 'evt-003');
  const snap = snapshot(chain, 2);
  assert.equal(snap.cursor, 2);
  assert.equal(snap.complete, false);
  assert.equal(snap.currentEventId, 'evt-002');
  assert.ok(snap.visibleNodes > 0);
});
