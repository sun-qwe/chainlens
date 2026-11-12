/**
 * 导入 JSONL / JSON 弹窗：拖拽或选择文件 → 解析校验 → 显示错误/警告 → 载入为自定义场景。
 * 导入数据只在内存中使用，不写入磁盘、不上传（浏览器本地 FileReader/text）。
 */
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { parseChain } from '../parser.js';

let current = null;

function issueList(items, title, open = false) {
  if (!items.length) return '';
  return `<details class="import-issues"${open ? ' open' : ''}><summary>${esc(title)}（${items.length}）</summary>
    <ul class="issue-list">${items
      .slice(0, 60)
      .map(
        (item) =>
          `<li><code>${esc(item.code || 'issue')}</code><span>${esc(item.message || String(item))}</span></li>`
      )
      .join('')}${items.length > 60 ? `<li><span>… 其余 ${items.length - 60} 条已省略</span></li>` : ''}</ul>
  </details>`;
}

function statsGrid(chain) {
  const stats = chain.stats;
  const cells = [
    ['有效记录', stats.acceptedRecords],
    ['节点', stats.nodes],
    ['关系', stats.edges],
    ['事件', stats.events],
    ['证据', stats.evidences],
    ['批注', stats.notes],
    ['坏行', stats.skippedLines],
    ['错误', stats.errors],
    ['警告', stats.warnings]
  ];
  return `<div class="import-stats">${cells
    .map(([label, value]) => `<div class="import-stat"><b>${esc(String(value))}</b><span>${esc(label)}</span></div>`)
    .join('')}</div>`;
}

function renderReport(chain, fileName, fileSize) {
  const fatal = chain.fatal || [];
  const errors = chain.errors || [];
  const warnings = chain.warnings || [];
  const ok = chain.ok && !fatal.length;
  const alerts = [];
  if (fatal.length) {
    alerts.push(
      `<div class="import-alert is-error">${icon('warning')}<span>${fatal
        .map((issue) => esc(issue.message))
        .join('<br>')}</span></div>`
    );
  }
  if (errors.length) {
    alerts.push(
      `<div class="import-alert is-warn">${icon('warning')}<span>发现 ${errors.length} 个数据错误，相关记录已被跳过或修正；仍可载入查看其余有效数据。</span></div>`
    );
  }
  if (!fatal.length && !errors.length) {
    alerts.push(
      `<div class="import-alert is-ok">${icon('check')}<span>校验通过：${chain.stats.acceptedRecords} 条记录解析成功，可载入为“${
        esc(chain.meta?.engagement?.name || fileName)
      }”场景。</span></div>`
    );
  }
  return `<div class="import-report">
    <div class="chip-row">
      <span class="badge">${esc(fileName)}</span>
      <span class="badge">${esc(formatSize(fileSize))}</span>
      <span class="badge ${ok ? 'badge-green' : 'badge-red'}">${ok ? '可载入' : '存在阻断性错误'}</span>
    </div>
    ${statsGrid(chain)}
    ${alerts.join('')}
    ${issueList(errors, '错误明细', fatal.length > 0)}
    ${issueList(warnings, '警告明细')}
    ${
      fatal.length
        ? ''
        : `<p class="faint" style="font-size:10.5px">导入的场景仅存在于当前页面内存中，刷新后恢复默认数据；可在导入后使用“导出”保存分析结果。</p>`
    }
  </div>`;
}

function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '大小未知';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function escapeHtmlFileResults() {
  return '';
}

function close() {
  if (!current) return;
  document.removeEventListener('keydown', current.onKeydown);
  current.overlay.remove();
  current.restoreFocus?.focus?.();
  current = null;
}

function isOpen() {
  return Boolean(current);
}

/**
 * 打开导入弹窗。
 * @param {{onImport:(chain:object,fileName:string)=>void, toast?:(msg:string,type:string)=>void}} options
 */
export function openImportModal(options = {}) {
  if (current) close();
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return;
  const restoreFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'presentation');
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
    <div class="modal-header">
      <div>
        <h2 class="modal-title" id="import-title">导入探索链路数据</h2>
        <p class="modal-sub">支持 dsh-pentest JSONL 或 JSON 数组；坏行会跳过并统计，敏感值应在插件端脱敏。数据只在浏览器内存中处理，不写入磁盘、不上传。</p>
      </div>
      <button class="btn btn-icon" type="button" data-import-action="close" aria-label="关闭导入弹窗">${icon('close')}</button>
    </div>
    <div class="modal-body" data-role="body">
      <div class="dropzone" data-role="dropzone" role="button" tabindex="0" aria-label="拖拽或选择 JSONL 文件">
        ${icon('import')}
        <strong>拖拽 .jsonl / .json 文件到这里</strong>
        <span>或点击选择文件；当前为内置演示数据时可直接导入自己的链路</span>
        <input type="file" accept=".jsonl,.json,application/json" data-role="file" hidden>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" type="button" data-import-action="close">取消</button>
      <button class="btn btn-primary" type="button" data-import-action="load" disabled>载入并切换场景</button>
    </div>
  </div>`;
  modalRoot.appendChild(overlay);

  const body = overlay.querySelector('[data-role="body"]');
  const dropzone = overlay.querySelector('[data-role="dropzone"]');
  const fileInput = overlay.querySelector('[data-role="file"]');
  const loadButton = overlay.querySelector('[data-import-action="load"]');
  let parsed = null;
  let parsedName = '';
  let busy = false;

  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  function showDropzone(message = '') {
    body.innerHTML = `<div class="dropzone" data-role="dropzone" role="button" tabindex="0" aria-label="拖拽或选择 JSONL 文件">
      ${icon('import')}
      <strong>拖拽 .jsonl / .json 文件到这里</strong>
      <span>或点击选择文件；导入数据只在内存中使用，刷新后恢复默认场景</span>
      <input type="file" accept=".jsonl,.json,application/json" data-role="file" hidden>
    </div>${message ? `<div class="import-alert is-error" style="margin-top:10px">${icon('warning')}<span>${esc(message)}</span></div>` : ''}`;
    bindDropzone();
    loadButton.disabled = true;
    loadButton.textContent = '载入并切换场景';
    parsed = null;
    parsedName = '';
  }

  function bindDropzone() {
    const zone = body.querySelector('[data-role="dropzone"]');
    const input = body.querySelector('[data-role="file"]');
    if (!zone || !input) return;
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) readFile(file);
    });
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('is-drag');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-drag'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('is-drag');
      const file = event.dataTransfer?.files?.[0];
      if (file) readFile(file);
    });
  }

  async function readFile(file) {
    if (busy) return;
    busy = true;
    body.innerHTML = `<div class="view-loading" style="height:180px"><div class="loading-ring" style="width:32px;height:32px"></div><span>正在解析 ${esc(file.name)}…</span></div>`;
    loadButton.disabled = true;
    try {
      if (file.size > 32 * 1024 * 1024) throw new Error('文件超过 32MB，请拆分后再导入');
      const text = await file.text();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const chain = parseChain(text, { source: 'import', name: file.name });
      parsed = chain;
      parsedName = file.name;
      body.innerHTML = renderReport(chain, file.name, file.size);
      loadButton.disabled = !(chain.ok && !chain.fatal.length);
      loadButton.textContent = chain.fatal.length ? '数据存在阻断性错误' : '载入并切换场景';
      if (!chain.ok) {
        options.toast?.('导入数据校验未通过，请查看错误明细', 'error');
      } else if (chain.warnings.length) {
        options.toast?.(`解析完成：${chain.warnings.length} 个警告，可载入`, 'warn');
      }
    } catch (error) {
      showDropzone(`读取或解析失败：${error.message}`);
      options.toast?.(`导入失败：${error.message}`, 'error');
    } finally {
      busy = false;
    }
  }

  overlay.addEventListener('click', (event) => {
    const action = event.target.closest('[data-import-action]')?.dataset.importAction;
    if (action === 'close') {
      close();
      return;
    }
    if (action === 'load') {
      if (!parsed || !parsed.ok || parsed.fatal.length) return;
      options.onImport?.(parsed, parsedName);
      close();
    }
  });

  document.addEventListener('keydown', onKeydown);
  current = { overlay, onKeydown, restoreFocus };
  // 绑定初始拖拽区
  const initialZone = body.querySelector('[data-role="dropzone"]');
  if (initialZone) {
    bindDropzone();
    initialZone.focus?.();
  }
}

export function closeImportModal() {
  close();
}

export function isImportOpen() {
  return isOpen();
}

export { escapeHtmlFileResults };
