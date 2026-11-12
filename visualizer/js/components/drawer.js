/**
 * 右侧详情抽屉：节点 / 事件 / 关系 / 证据 / 批注的详情与联动操作。
 * 敏感字段与 sensitive 证据在这里统一打码。
 */
import { NODE_TYPE_MAP, RELATION_MAP, RESULT_MAP, SENSITIVE_KEY_PATTERN, STAGE_MAP } from '../constants.js';
import { icon, typeIcon } from '../icons.js';
import { esc } from '../util.js';
import {
  actionZh,
  evidenceTypeZh,
  fmtDateTime,
  fmtDuration,
  fmtPropValue,
  relationZh,
  resultZh,
  stageZh,
  typeZh
} from '../format.js';
import { eventMini, kvGrid, refChip, riskMeter, severityBadge } from '../ui.js';

/** 递归屏蔽敏感字段值 */
function sanitize(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitize(child, depth + 1);
    }
    return out;
  }
  return value;
}

/** 常见 props 字段的中文标签与展示顺序 */
const PROP_LABELS = {
  severity: '严重度',
  cvss: 'CVSS',
  cve: 'CVE',
  category: '分类',
  status: '状态',
  recommendation: '修复建议',
  description: '描述',
  title: '标题',
  impact: '影响',
  ip: 'IP',
  hostname: '主机名',
  os: '操作系统',
  exposure: '暴露面',
  critical: '关键资产',
  owner: '负责人',
  port: '端口',
  protocol: '协议',
  product: '产品',
  version: '版本',
  banner: 'Banner',
  url: 'URL',
  tech: '技术栈',
  auth: '认证方式',
  method: '方法',
  path: '路径',
  params: '参数',
  auth_required: '需认证',
  account: '账号',
  kind: '类型',
  privilege: '权限',
  source: '来源',
  value: '值（已脱敏）',
  user: '用户',
  host_id: '主机',
  valid_until: '有效期至',
  classification: '密级',
  industry: '行业',
  domain: '域名',
  region: '区域',
  evidence_id: '证据 ID',
  asset: '资产'
};
const PROP_ORDER = Object.keys(PROP_LABELS);

function propsEntries(props) {
  if (!props || typeof props !== 'object' || !Object.keys(props).length) return [];
  const safe = sanitize(props);
  const entries = Object.entries(safe).map(([key, value]) => {
    let text;
    if (value === null || value === undefined) text = '—';
    else if (typeof value === 'object') {
      try {
        text = JSON.stringify(value);
      } catch {
        text = '—';
      }
    } else text = fmtPropValue(value);
    if (typeof text === 'string' && text.length > 240) text = `${text.slice(0, 239)}…`;
    const rank = PROP_ORDER.indexOf(key);
    return { label: PROP_LABELS[key] || key, value: text, rank: rank < 0 ? 999 : rank, key };
  });
  entries.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
  return entries.map((entry) => [entry.label, entry.value]);
}

function section(title, body, extra = '') {
  if (!body) return '';
  return `<section class="drawer-section"><div class="drawer-section-title">${esc(title)}${extra}</div>${body}</section>`;
}

function attckBlock(attck) {
  if (!attck) return '';
  return kvGrid([
    ['Tactic', `${attck.tactic || '—'}`],
    ['Technique', `${attck.technique || '—'}`],
    ['名称', attck.name || '—']
  ]);
}

function nodeActions(node) {
  return `<div class="drawer-actions">
    <button class="btn btn-sm" type="button" data-goto="graph" data-focus="${esc(node.id)}">${icon('layers')}在链路图中聚焦</button>
    <button class="btn btn-sm" type="button" data-drawer-action="timeline-node" data-node-id="${esc(
      node.id
    )}">${icon('clock')}在时间线定位</button>
    <button class="btn btn-sm" type="button" data-drawer-action="copy-node-link" data-node-id="${esc(
      node.id
    )}">${icon('link')}复制深链</button>
  </div>`;
}

function nodeContent(ctx, node) {
  const derived = ctx.derived;
  const spec = NODE_TYPE_MAP.get(node.type) || { zh: node.type, color: '#64748b' };
  const evidence = derived.evidenceByNode.get(node.id) || [];
  const events = (derived.eventsByNode.get(node.id) || []).slice().sort((a, b) => a.tsMs - b.tsMs);
  const incidentEdges = [
    ...(derived.outgoing.get(node.id) || []).map((edge) => ({ edge, direction: 'out' })),
    ...(derived.incoming.get(node.id) || []).map((edge) => ({ edge, direction: 'in' }))
  ].slice(0, 14);
  return {
    kicker: `${typeIcon(node.type)}${esc(spec.zh)}详情`,
    title: `<span style="color:${spec.color}">${esc(node.label)}</span>`,
    html: `
      <div class="chip-row" style="margin-bottom:10px">
        ${severityBadge(node.props?.severity || 'info', node.props?.severity ? undefined : '无严重度')}
        <span class="badge">${esc(stageZh(node.stage))}</span>
        <span class="badge">${esc(typeZh(node.type))}</span>
        <span class="badge">置信度 ${Math.round((node.confidence ?? 1) * 100)}%</span>
        <span class="badge mono">${esc(node.id)}</span>
      </div>
      ${section('风险等级', riskMeter(node.risk))}
      ${section(
        '属性',
        kvGrid([
          ...propsEntries(node.props)
        ])
      )}
      ${node.attck ? section('ATT&CK 映射', attckBlock(node.attck)) : ''}
      ${section(
        '关联证据',
        evidence.length
          ? evidence
              .map(
                (item) =>
                  `<div class="evidence-mini"><div class="evidence-mini-head">${icon('data')}<span class="evidence-mini-title">${esc(
                    item.title
                  )}</span>${item.sensitive ? '<span class="sensitive-tag">已脱敏</span>' : ''}</div><div class="faint" style="font-size:10.5px">${esc(
                    fmtDateTime(item.ts)
                  )} · ${esc(item.id)}</div></div>`
              )
              .join('')
          : '<p class="drawer-summary faint">该节点未关联证据。</p>',
        evidence.length ? `<span class="faint">${evidence.length}</span>` : ''
      )}
      ${section(
        '相关事件',
        events.length
          ? events
              .slice(0, 8)
              .map((event) => eventMini(event))
              .join('')
          : '<p class="drawer-summary faint">暂无事件引用该节点。</p>',
        events.length ? `<span class="faint">${events.length}</span>` : ''
      )}
      ${section(
        '关系',
        incidentEdges.length
          ? `<div class="chip-row">${incidentEdges
              .map(({ edge, direction }) => {
                const otherId = direction === 'out' ? edge.to : edge.from;
                const other = derived.nodeMap.get(otherId);
                if (!other) return '';
                return `<button class="ref-chip" type="button" data-open-node="${esc(other.id)}"><span class="dot" style="background:${
                  NODE_TYPE_MAP.get(other.type)?.color || '#64748b'
                }"></span><span>${esc(relationZh(edge.relation))} ${direction === 'out' ? '→' : '←'} ${esc(
                  other.label
                )}</span><span class="ref-id">${esc(other.id)}</span></button>`;
              })
              .join('')}</div>`
          : ''
      )}
      ${nodeActions(node)}`
  };
}

function eventContent(ctx, event) {
  const derived = ctx.derived;
  const resultSpec = RESULT_MAP.get(event.result) || { zh: event.result, color: '#64748b' };
  const index = ctx.chain.events.findIndex((item) => item.id === event.id);
  const nodes = event.node_ids.map((id) => derived.nodeMap.get(id)).filter(Boolean);
  const edges = event.edge_ids.map((id) => derived.edgeMap.get(id)).filter(Boolean);
  const evidence = [];
  for (const node of nodes) {
    for (const item of derived.evidenceByNode.get(node.id) || []) {
      if (!evidence.find((e) => e.id === item.id)) evidence.push(item);
    }
  }
  return {
    kicker: `${icon('clock')}事件详情 · ${esc(stageZh(event.stage))}`,
    title: esc(event.summary),
    html: `
      <div class="chip-row" style="margin-bottom:10px">
        <span class="sev-pill" style="--c:${resultSpec.color}"><i></i>${esc(resultSpec.zh)}</span>
        <span class="badge">${esc(stageZh(event.stage))}</span>
        <span class="badge">风险 ${Number(event.risk).toFixed(1)}</span>
        <span class="badge mono">${esc(event.id)}</span>
      </div>
      ${section(
        '时间与动作',
        kvGrid([
          ['时间', fmtDateTime(event.ts)],
          ['动作', `${actionZh(event.action)}（${event.action}）`],
          ['结果', resultZh(event.result)],
          ['持续', event.duration_ms !== undefined ? fmtDuration(event.duration_ms) : '—'],
          ['执行者', event.actor || '—']
        ])
      )}
      ${event.detail ? section('详情', `<p class="drawer-summary">${esc(event.detail)}</p>`) : ''}
      ${event.attck ? section('ATT&CK 映射', attckBlock(event.attck)) : ''}
      ${section(
        '关联节点',
        nodes.length ? `<div class="chip-row">${nodes.map((node) => refChip(node)).join('')}</div>` : '<p class="faint">无</p>'
      )}
      ${section(
        '关联关系',
        edges.length
          ? `<div class="chip-row">${edges
              .map(
                (edge) =>
                  `<button class="ref-chip" type="button" data-open-edge="${esc(edge.id)}">${icon(
                    'link'
                  )}<span>${esc(relationZh(edge.relation))}</span><span class="ref-id">${esc(edge.id)}</span></button>`
              )
              .join('')}</div>`
          : ''
      )}
      ${section(
        '相关证据',
        evidence.length
          ? evidence
              .map(
                (item) =>
                  `<button class="evidence-mini" type="button" data-open-evidence="${esc(
                    item.id
                  )}" style="width:100%;text-align:left"><div class="evidence-mini-head">${icon('data')}<span class="evidence-mini-title">${esc(
                    item.title
                  )}</span>${item.sensitive ? '<span class="sensitive-tag">已脱敏</span>' : ''}</div><div class="faint" style="font-size:10.5px">${esc(
                    fmtDateTime(item.ts)
                  )}</div></button>`
              )
              .join('')
          : ''
      )}
      <div class="drawer-actions">
        <button class="btn btn-sm" type="button" data-drawer-action="timeline-event" data-cursor="${
          index + 1
        }">${icon('clock')}在时间线定位</button>
        <button class="btn btn-sm" type="button" data-goto="graph" ${
          nodes[0] ? `data-focus="${esc(nodes[0].id)}"` : ''
        }>${icon('layers')}在链路图中查看</button>
        <button class="btn btn-sm" type="button" data-drawer-action="copy-event-link" data-cursor="${
          index + 1
        }">${icon('link')}复制回放深链</button>
      </div>`
  };
}

function edgeContent(ctx, edge) {
  const derived = ctx.derived;
  const from = derived.nodeMap.get(edge.from);
  const to = derived.nodeMap.get(edge.to);
  const relSpec = RELATION_MAP.get(edge.relation);
  return {
    kicker: `${icon('link')}关系详情 · ${esc(stageZh(edge.stage))}`,
    title: `${esc(from?.label || edge.from)} <span style="color:var(--text-faint)">→</span> ${esc(
      to?.label || edge.to
    )}`,
    html: `
      <div class="chip-row" style="margin-bottom:10px">
        <span class="badge" style="color:${relSpec?.color || 'var(--text-dim)'};border-color:${relSpec?.color || 'var(--border)'}33">${esc(
          relationZh(edge.relation)
        )}</span>
        <span class="badge">权重 ${Number(edge.weight).toFixed(2)}</span>
        <span class="badge">${esc(stageZh(edge.stage))}</span>
        <span class="badge mono">${esc(edge.id)}</span>
      </div>
      ${section(
        '两端节点',
        `<div class="chip-row">${from ? refChip(from) : `<span class="badge">${esc(edge.from)}</span>`}${
          to ? refChip(to) : `<span class="badge">${esc(edge.to)}</span>`
        }</div>`
      )}
      ${edge.attck ? section('ATT&CK 映射', attckBlock(edge.attck)) : ''}
      ${propsEntries(edge.props).length ? section('属性', kvGrid(propsEntries(edge.props))) : ''}
      <div class="drawer-actions">
        ${from ? `<button class="btn btn-sm" type="button" data-open-node="${esc(from.id)}">${icon('target')}查看源节点</button>` : ''}
        ${to ? `<button class="btn btn-sm" type="button" data-open-node="${esc(to.id)}">${icon('target')}查看目标节点</button>` : ''}
      </div>`
  };
}

function evidenceContent(ctx, evidence) {
  const derived = ctx.derived;
  const node = evidence.node_id ? derived.nodeMap.get(evidence.node_id) : null;
  return {
    kicker: `${icon('data')}证据详情 · ${esc(evidenceTypeZh(evidence.type))}`,
    title: esc(evidence.title),
    html: `
      <div class="chip-row" style="margin-bottom:10px">
        ${evidence.sensitive ? '<span class="sensitive-tag">敏感 · 已脱敏</span>' : '<span class="badge badge-green">公开</span>'}
        <span class="badge">${esc(evidenceTypeZh(evidence.type))}</span>
        <span class="badge">${esc(fmtDateTime(evidence.ts))}</span>
        <span class="badge mono">${esc(evidence.id)}</span>
      </div>
      ${
        evidence.sensitive
          ? `<div class="masked-note">${icon('eye')}该证据标记为 sensitive，内容默认打码；仅展示标题与元数据，避免泄露原始敏感信息。</div>`
          : evidence.summary
            ? section('摘要', `<p class="drawer-summary">${esc(evidence.summary)}</p>`)
            : ''
      }
      ${section(
        '关联对象',
        node ? `<div class="chip-row">${refChip(node)}</div>` : '<p class="drawer-summary faint">未关联节点。</p>'
      )}
      ${section(
        '元数据',
        kvGrid([
          ['类型', evidenceTypeZh(evidence.type)],
          ['时间', fmtDateTime(evidence.ts)],
          ['哈希', evidence.hash || '—'],
          ['路径', evidence.path || '—'],
          ['敏感', evidence.sensitive ? '是（已打码）' : '否'],
          ...propsEntries(evidence.props)
        ])
      )}
      <div class="drawer-actions">
        ${
          node
            ? `<button class="btn btn-sm" type="button" data-open-node="${esc(node.id)}">${icon('target')}查看关联节点</button>`
            : ''
        }
        <button class="btn btn-sm" type="button" data-drawer-action="copy-evidence-id" data-evidence-id="${esc(
          evidence.id
        )}">${icon('link')}复制证据 ID</button>
      </div>`
  };
}

function noteContent(ctx, note) {
  const derived = ctx.derived;
  const nodes = note.node_ids.map((id) => derived.nodeMap.get(id)).filter(Boolean);
  return {
    kicker: `${icon('info')}人工批注`,
    title: esc(note.id),
    html: `
      <div class="chip-row" style="margin-bottom:10px"><span class="badge">${esc(fmtDateTime(note.ts))}</span><span class="badge mono">${esc(
        note.id
      )}</span></div>
      ${section('内容', `<p class="drawer-summary">${esc(note.content)}</p>`)}
      ${section('关联节点', nodes.length ? `<div class="chip-row">${nodes.map((n) => refChip(n)).join('')}</div>` : '')}
    `
  };
}

/** 根据当前 state.drawer 生成抽屉内容 */
export function buildDrawerContent(ctx) {
  const drawer = ctx.state.drawer;
  if (!drawer || !drawer.id) return null;
  const kind = drawer.kind || 'node';
  const derived = ctx.derived;
  try {
    if (kind === 'event') {
      const event = derived.eventMap.get(drawer.id);
      return event ? eventContent(ctx, event) : null;
    }
    if (kind === 'edge') {
      const edge = derived.edgeMap.get(drawer.id);
      return edge ? edgeContent(ctx, edge) : null;
    }
    if (kind === 'evidence') {
      const evidence = derived.evidenceMap.get(drawer.id);
      return evidence ? evidenceContent(ctx, evidence) : null;
    }
    if (kind === 'note') {
      const note = derived.noteMap.get(drawer.id);
      return note ? noteContent(ctx, note) : null;
    }
    const node = derived.nodeMap.get(drawer.id);
    return node ? nodeContent(ctx, node) : null;
  } catch (error) {
    console.warn('[ChainLens] 抽屉渲染失败', error);
    return null;
  }
}

