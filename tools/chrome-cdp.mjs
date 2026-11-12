#!/usr/bin/env node
/**
 * 极简 Chrome DevTools Protocol 驱动（无第三方依赖）
 *
 * 用途：用 headless Chrome 打开 ChainLens，等待就绪，执行表达式，收集控制台错误，
 *      按视口截图，用于论文插图、自动验收和性能采样。
 *
 * 用法：
 *   node tools/chrome-cdp.mjs --url http://127.0.0.1:8787/visualizer/#/overview \
 *        --out screenshots/overview.png --width 1600 --height 1000 \
 *        --wait 6000 [--eval "window.ChainLens.bench('campus-lab')"] [--json result.json]
 *
 * 退出码：0 正常；1 页面有未捕获异常/关键请求失败；2 启动或连接失败。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function parseArgs(argv) {
  const out = { width: 1600, height: 1000, wait: 6000, timeout: 30000, port: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (key === "json" || key === "keep" || key === "fullpage") {
      out[key] = true;
      continue;
    }
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = key === "width" || key === "height" || key === "wait" || key === "timeout" || key === "port" || key === "scale" ? Number(next) : next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else p.resolve(msg.result);
        return;
      }
      const hs = this.handlers.get(msg.method) || [];
      for (const h of hs) h(msg.params);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }
  on(method, fn) {
    const arr = this.handlers.get(method) || [];
    arr.push(fn);
    this.handlers.set(method, arr);
  }
}

async function waitFor(fn, timeoutMs, intervalMs = 200) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw lastErr || new Error("waitFor timeout");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error("缺少 --url");
    process.exit(2);
  }
  const port = args.port || 9400 + Math.floor(Math.random() * 400);
  const profile = resolve(os.tmpdir(), `chainlens-chrome-${port}-${Date.now()}`);
  mkdirSync(profile, { recursive: true });
  const chromeArgs = [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${args.width},${args.height}`,
    "--disable-extensions",
    "--mute-audio",
    "about:blank"
  ];
  const child = spawn(CHROME, chromeArgs, { stdio: "ignore", windowsHide: true });
  let ws;
  const errors = [];
  const requests = [];
  try {
    const ver = await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return res.ok ? res.json() : null;
    }, 15000);
    const targets = await waitFor(async () => {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (!r.ok) return null;
      const list = await r.json();
      return list.find((t) => t.type === "page") ? list : null;
    }, 15000);
    const pageTarget = targets.find((t) => t.type === "page");
    if (!pageTarget?.webSocketDebuggerUrl) throw new Error("没有找到可用的页面 target");
    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    const cdp = new CDP(ws);
    let loaded = false;
    const consoleErrors = [];
    cdp.on("Runtime.exceptionThrown", (p) => {
      errors.push({ type: "exception", text: p.exceptionDetails?.exception?.description || p.exceptionDetails?.text });
    });
    cdp.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error") consoleErrors.push(p.args?.map((a) => a.value ?? a.description ?? "").join(" "));
    });
    cdp.on("Log.entryAdded", (p) => {
      if (p.entry.level === "error") consoleErrors.push(p.entry.text);
    });
    cdp.on("Page.loadEventFired", () => {
      loaded = true;
    });
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: args.width,
      height: args.height,
      deviceScaleFactor: args.scale || 1,
      mobile: false
    });
    await cdp.send("Page.navigate", { url: args.url });
    // 等 load + 应用就绪
    await waitFor(() => loaded, 15000).catch(() => {});
    await waitFor(async () => {
      const r = await cdp.send("Runtime.evaluate", {
        expression: "document.readyState === 'complete'",
        returnByValue: true
      });
      return r.result?.value === true;
    }, 15000);
    const ready = await cdp.send("Runtime.evaluate", {
      expression: "typeof window.__chainlensReady === 'object' || typeof window.__chainlensReady === 'function' ? Promise.resolve(window.__chainlensReady).then(() => 'ready') : 'no-marker'",
      awaitPromise: true,
      returnByValue: true,
      timeout: args.timeout
    }).catch(() => ({ result: { value: "marker-timeout" } }));
    await new Promise((r) => setTimeout(r, Math.max(0, args.wait)));
    let evalResult = null;
    if (args.eval) {
      const r = await cdp.send("Runtime.evaluate", {
        expression: `(async () => { ${args.eval} })()`,
        awaitPromise: true,
        returnByValue: true,
        timeout: args.timeout
      });
      evalResult = r.result?.value ?? null;
    }
    let screenshot = null;
    if (args.out) {
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: Boolean(args.fullpage)
      });
      const outPath = resolve(ROOT, args.out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, Buffer.from(shot.data, "base64"));
      screenshot = outPath;
    }
    const summary = {
      ok: errors.length === 0,
      url: args.url,
      ready: ready.result?.value,
      screenshot,
      eval: evalResult,
      errors,
      consoleErrors,
      requestsFailed: requests.filter((r) => r.failed)
    };
    if (args.json) {
      const p = resolve(ROOT, typeof args.json === "string" ? args.json : "screenshots/cdp-report.json");
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify(summary, null, 2), "utf8");
    }
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = summary.ok ? 0 : 1;
  } catch (e) {
    console.error("CDP 失败:", e?.stack || e);
    process.exitCode = 2;
  } finally {
    try {
      ws?.close();
    } catch {}
    try {
      child.kill();
    } catch {}
    setTimeout(() => {
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {}
    }, 500);
  }
}

main();
