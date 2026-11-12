/**
 * 文件导出 / 复制工具（浏览器端，仅本地 Blob，不发起网络请求）。
 */

/** 触发浏览器下载 */
export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** CSV 下载（带 UTF-8 BOM，方便 Excel 打开中文） */
export function downloadCsv(filename, rows) {
  const content = `\uFEFF${rows.join('\r\n')}`;
  downloadText(filename, content, 'text/csv;charset=utf-8');
}

/** CSV 单元格转义 */
export function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** CSV 行（数组） */
export function csvRow(values) {
  return values.map(csvCell).join(',');
}

/** 复制文本到剪贴板（带降级方案） */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext !== false) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 降级到 execCommand
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 文件名安全的场景名 */
export function safeFileName(name, fallback = 'chainlens') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

/** 生成时间戳文件名后缀 */
export function timestampSuffix() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
