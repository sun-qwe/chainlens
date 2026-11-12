/**
 * 生成用于论文图 6-3 与容错测试的"部分非法"JSONL 样例。
 * 合法前缀保证可以进入预览，后续混入坏 JSON、重复 id、孤儿边、非法枚举、缺失字段。
 * 运行：node tools/make-invalid-fixture.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "data/fixtures/mini.jsonl");
const lines = readFileSync(src, "utf8").split(/\r?\n/).filter(Boolean);
const keep = lines.slice(0, 8); // meta + 若干合法记录

const bad = [
  '{"schema":"dsh-pentest/chain@1","seq":9,"ts":"2026-11-01T09:20:00+08:00","kind":"node",', // 坏 JSON
  JSON.stringify({ schema: "dsh-pentest/chain@1", seq: 9, ts: "2026-11-01T09:21:00+08:00", kind: "node", id: "host-001", type: "host", label: "重复 ID 主机", stage: "recon" }),
  JSON.stringify({ schema: "dsh-pentest/chain@1", seq: 10, ts: "2026-11-01T09:22:00+08:00", kind: "edge", id: "rel-901", from: "ghost-001", to: "host-001", relation: "exposes", stage: "recon" }),
  JSON.stringify({ schema: "dsh-pentest/chain@1", seq: 11, ts: "2026-11-01T09:23:00+08:00", kind: "event", id: "evt-901", stage: "unknown_stage", action: "Bad Action", summary: "非法枚举示例", result: "maybe" }),
  JSON.stringify({ schema: "dsh-pentest/chain@1", seq: 12, ts: "2026-11-01T09:24:00+08:00", kind: "evidence", id: "evd-901", title: "" }),
  JSON.stringify({ schema: "dsh-pentest/chain@1", seq: 13, ts: "2026-11-01T09:25:00+08:00", kind: "event", id: "evt-902", stage: "validation", action: "dir_enum", summary: "引用不存在的节点", result: "success", node_ids: ["no-such-node"] })
];
const out = resolve(root, "data/fixtures/invalid-demo.jsonl");
writeFileSync(out, [...keep, ...bad].join("\n") + "\n", "utf8");
console.log(`written ${keep.length + bad.length} lines -> ${out}`);
