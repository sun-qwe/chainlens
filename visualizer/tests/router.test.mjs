/**
 * 深链解析与生成测试（规格 5.1）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoute, parseRoute, routeSnapshot } from '../js/router.js';

test('解析规格示例深链', () => {
  const route = parseRoute(
    '#/graph?scenario=corp-ad&cursor=120&critical=1&focus=vuln-007&filter=stage:initial_access,type:vulnerability&severity=high,critical&zoom=0.8&fit=1'
  );
  assert.equal(route.view, 'graph');
  assert.equal(route.scenarioId, 'corp-ad');
  assert.equal(route.cursor, 120);
  assert.equal(route.critical, true);
  assert.equal(route.focus, 'vuln-007');
  assert.deepEqual(route.filters.stages, ['initial_access']);
  assert.deepEqual(route.filters.types, ['vulnerability']);
  assert.deepEqual(route.filters.severities, ['high', 'critical']);
  assert.equal(route.zoom, 0.8);
  assert.equal(route.fit, true);
});

test('filter 支持多个键与多个值（| 分隔）', () => {
  const route = parseRoute('#/timeline?filter=stage:recon|validation,result:success|partial');
  assert.deepEqual(route.filters.stages, ['recon', 'validation']);
  assert.deepEqual(route.filters.results, ['success', 'partial']);
  assert.equal(route.view, 'timeline');
});

test('未知视图 / 非法参数降级', () => {
  const route = parseRoute('#/nonsense?cursor=abc&zoom=9&severity=bogus');
  assert.equal(route.view, 'overview');
  assert.equal(route.cursor, null);
  assert.equal(route.zoom, 2.5);
  assert.deepEqual(route.filters.severities, []);
});

test('buildRoute 生成可再次解析的深链', () => {
  const state = {
    view: 'graph',
    scenarioId: 'campus-lab',
    cursor: 12,
    critical: true,
    zoom: 0.8,
    fit: false,
    focus: 'vuln-001',
    filters: { q: '导出 接口', stages: ['validation'], types: ['vulnerability'], severities: ['high'], results: [], relations: [] },
    tab: 'findings',
    attackCell: null
  };
  const hash = buildRoute(state);
  assert.match(hash, /^#\/graph\?/);
  const parsed = parseRoute(hash);
  assert.equal(parsed.view, 'graph');
  assert.equal(parsed.scenarioId, 'campus-lab');
  assert.equal(parsed.cursor, 12);
  assert.equal(parsed.critical, true);
  assert.equal(parsed.zoom, 0.8);
  assert.equal(parsed.focus, 'vuln-001');
  assert.deepEqual(parsed.filters.stages, ['validation']);
  assert.deepEqual(parsed.filters.severities, ['high']);
  assert.equal(parsed.filters.q, '导出 接口');
});

test('fit=1 与非 graph 视图不输出 zoom', () => {
  const fitted = buildRoute({ view: 'graph', scenarioId: 'x', fit: true, zoom: null, filters: {} });
  assert.match(fitted, /fit=1/);
  const overview = buildRoute({ view: 'overview', scenarioId: 'x', zoom: 0.8, filters: {} });
  assert.equal(overview.includes('zoom='), false);
});

test('findings tab 与 ATT&CK 深链参数', () => {
  const findings = parseRoute('#/findings?scenario=campus-lab&tab=evidence&severity=high,critical');
  assert.equal(findings.tab, 'evidence');
  const attack = parseRoute('#/attack?scenario=cloud-k8s&tactic=TA0001&technique=T1190');
  assert.equal(attack.tactic, 'TA0001');
  assert.equal(attack.technique, 'T1190');
});

test('routeSnapshot 保留深链关键字段', () => {
  const snap = routeSnapshot({
    view: 'timeline',
    scenarioId: 's',
    cursor: 4,
    critical: true,
    zoom: 1.2,
    fit: false,
    focus: null,
    filters: { stages: [] },
    tab: 'evidence',
    tactic: 'TA0001',
    technique: 'T1190'
  });
  assert.equal(snap.view, 'timeline');
  assert.equal(snap.cursor, 4);
  assert.equal(snap.zoom, 1.2);
  assert.equal(snap.tactic, 'TA0001');
});
