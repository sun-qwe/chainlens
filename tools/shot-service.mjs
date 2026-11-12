#!/usr/bin/env node
/**
 * 本地截图服务（需要以较宽的文件/进程权限运行一次，因为 Chromium 在受限沙箱里无法创建 Mojo 管道）。
 *
 * 启动：
 *   node tools/shot-service.mjs
 * 仅监听 127.0.0.1:8799。之后任意进程可 POST：
 *   curl -X POST http://127.0.0.1:8799/shot -H "content-type: application/json" \
 *     -d "{\"url\":\"http://127.0.0.1:8787/visualizer/#/overview?scenario=campus-lab\",\"out\":\"screenshots/overview.png\",\"width\":1600,\"height\":1000,\"wait\":5000}"
 * 返回 chrome-cdp.mjs 的 JSON 汇总（含控制台错误、eval 结果）。
 *
 * 安全：只接受回环地址请求；不会访问外部网络；截图只能写入本项目目录（out 为相对项目根路径）。
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PORT = Number(process.env.SHOT_PORT || 8799);
const NODE = process.execPath;
const CDP = resolve(__dirname, "chrome-cdp.mjs");

function runShot(opts) {
  return new Promise((resolvePromise) => {
    const args = [CDP, "--url", String(opts.url), "--width", String(opts.width || 1600), "--height", String(opts.height || 1000), "--wait", String(opts.wait ?? 5000)];
    if (opts.out) {
      const out = String(opts.out).replace(/\\/g, "/");
      if (isAbsolute(out) || out.includes("..")) {
        resolvePromise({ ok: false, error: "out 必须是项目内的相对路径" });
        return;
      }
      args.push("--out", out);
    }
    if (opts.eval) args.push("--eval", String(opts.eval));
    if (opts.json) args.push("--json", String(opts.json));
    if (opts.fullpage) args.push("--fullpage");
    if (opts.scale) args.push("--scale", String(opts.scale));
    const child = spawn(NODE, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: { ...process.env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolvePromise({ ok: false, error: "截图超时（60s）", stderr: stderr.slice(-2000) });
    }, 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.slice(stdout.indexOf("{")));
      } catch {}
      resolvePromise(parsed || { ok: code === 0, code, stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, error: String(e) });
    });
  });
}

const server = http.createServer((req, res) => {
  const remote = req.socket.remoteAddress || "";
  const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  if (!isLoopback) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "chainlens-shot", chrome: "headless" }));
    return;
  }
  if (req.method === "POST" && req.url === "/shot") {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", async () => {
      let opts;
      try {
        opts = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "body 不是 JSON" }));
        return;
      }
      const result = await runShot(opts);
      res.writeHead(result.ok ? 200 : 500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    });
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ChainLens shot service listening on http://127.0.0.1:${PORT}`);
});
