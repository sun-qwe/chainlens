/**
 * 数据导出：发现 CSV / 证据 JSON / 报告 JSON。
 * 仅使用 Blob 本地下载，不发起网络请求。
 */
import { downloadCsv, downloadText, safeFileName, timestampSuffix } from './io.js';
import { buildReportModel } from './views/report.js';

/** 导出风险发现 CSV，返回导出条数 */
export function exportFindingsCsv(findings, scenarioName) {
  const rows = [
    ['严重度', '标题', '类型', 'CVSS', '资产', '阶段', '状态', '证据数', 'CVE', '建议'],
    ...findings.map((finding) => [
      finding.severity,
      finding.title,
      finding.type,
      finding.cvss ?? '',
      finding.assetLabel,
      finding.stage,
      finding.status,
      finding.evidenceCount,
      finding.cve,
      finding.recommendation
    ])
  ];
  downloadCsv(`chainlens-findings-${safeFileName(scenarioName)}-${timestampSuffix()}.csv`, rows);
  return findings.length;
}

/** 导出证据 JSON（敏感证据摘要统一替换为 [REDACTED]），返回导出条数 */
export function exportEvidenceJson(evidenceList, scenarioName) {
  const payload = {
    generatedAt: new Date().toISOString(),
    count: evidenceList.length,
    evidence: evidenceList.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      nodeId: item.nodeId,
      nodeLabel: item.nodeLabel,
      sensitive: item.sensitive,
      summary: item.sensitive ? '[REDACTED]' : item.summary,
      hash: item.hash,
      path: item.path,
      ts: item.ts
    }))
  };
  downloadText(
    `chainlens-evidence-${safeFileName(scenarioName)}-${timestampSuffix()}.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8'
  );
  return payload.count;
}

/** 导出报告 JSON 模型 */
export function exportReportJson(ctx, scenarioName) {
  const model = buildReportModel(ctx);
  downloadText(
    `chainlens-report-${safeFileName(scenarioName)}-${timestampSuffix()}.json`,
    JSON.stringify(model, null, 2),
    'application/json;charset=utf-8'
  );
  return model;
}
