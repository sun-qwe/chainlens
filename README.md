# ChainLens · dsh-pentest 探索链路数据可视化

> 本科毕业设计项目：**DSH 插件 dsh-pentest 的探索链路数据可视化工具的设计与实现**
> 作者：孙博奥（学号 2301144050）· 黄河科技学院 · 网络工程

ChainLens 面向 DSH（DeepSeek Harness）生态中 `dsh-pentest` 插件产生的探索链路数据，把资产发现、服务识别、漏洞验证、凭据获取、横向移动、证据采集等过程记录，还原为可读、可查、可回放的链路图、时间线与分析报告。

项目同时提供一个**只记录、不攻击**的最小插件 `dsh-pentest`，用于生成符合契约的仿真数据；可视化端是零依赖、零构建、零外部网络请求的纯前端工具。仓库内另附**开题报告**、**开题答辩 PPT** 与**毕业答辩 PPT**。

---

## 1. 功能概览

| 端 | 能力 |
|---|---|
| dsh-pentest 插件 | 4 个工具（启动作业 / 记录步骤 / 结束作业 / 生成仿真）、授权与 scope 守卫、递归脱敏、JSONL 追加写、三个可复现仿真场景、CLI |
| ChainLens 可视化 | 总览仪表盘、阶段约束链路图（关键路径 / 筛选 / 缩放拖拽 / 回放）、时间线泳道、ATT&CK 覆盖矩阵、发现与证据、自动分析报告、JSONL 导入、深链、数据质量校验 |

六个视图共享同一份归一化数据；筛选、回放游标、选中对象在视图间联动，并可由 URL 深链复现。

## 2. 快速开始

环境要求：Windows / macOS / Linux，Python 3.10+；现代 Chrome / Edge 浏览器。**无需安装任何 npm 依赖，无需构建。**

```bash
# 在项目根目录启动本地静态服务
python serve.py            # 默认 http://127.0.0.1:8787

# 浏览器打开
# http://127.0.0.1:8787/visualizer/
```

页面默认加载 `data/manifest.json` 中的三个内置场景（小 / 中 / 大）。也可以把 `.jsonl` / `.json` 文件直接拖入页面导入。

### 常用深链

```
#/overview?scenario=campus-lab
#/graph?scenario=campus-lab&critical=1&zoom=0.9&cursor=15
#/timeline?scenario=campus-lab&cursor=15
#/attack?scenario=corp-ad
#/findings?scenario=campus-lab&severity=high,critical
#/findings?scenario=campus-lab&tab=evidence
#/report?scenario=campus-lab
#/about
```

完整参数见 [docs/可视化使用说明.md](docs/可视化使用说明.md)。

## 3. 运行插件 / 生成数据

插件与 CLI 只依赖 Node.js（开发验证版本 v24.21.0）：

```bash
cd dsh-pentest

# 生成全部三个仿真场景（确定性、可复现）
node bin/dsh-pentest.mjs demo --all --out ../data/scenarios

# 生成单个场景 / 校验 / 统计
node bin/dsh-pentest.mjs demo --scenario campus-lab
node bin/dsh-pentest.mjs validate ../data/scenarios/campus-lab.jsonl
node bin/dsh-pentest.mjs stats ../data/scenarios/campus-lab.jsonl

# mock 宿主验证：apply 加载、工具注册、记录落盘、脱敏、只读路由
node scripts/mock-host.mjs
```

安装到 DSH 的步骤见 [docs/插件说明.md](docs/插件说明.md)。本仓库不会修改正在运行的 DSH 配置。

## 4. 项目结构

```
dsh-c/
├─ dsh-pentest/              # 最小 DSH 插件（Node ESM，零第三方依赖）
│  ├─ lib/                   # 插件入口、schema 校验/脱敏、JSONL 存储、仿真器、场景蓝本
│  ├─ bin/dsh-pentest.mjs    # CLI
│  ├─ tests/                 # node:test，88 项
│  └─ scripts/mock-host.mjs  # mock 宿主验证
├─ visualizer/               # 零依赖前端（HTML/CSS/ES Modules + 自绘 SVG）
│  ├─ index.html
│  ├─ js/                    # 解析、分析、布局、回放、路由、视图、组件
│  ├─ css/                   # 深色设计系统
│  └─ tests/                 # node:test，52 项
├─ data/
│  ├─ schema/chain.schema.json   # 数据契约（JSON Schema 2020-12）
│  ├─ scenarios/                 # 三个仿真场景 JSONL
│  ├─ fixtures/mini.jsonl        # 最小样例
│  └─ manifest.json              # 场景清单与统计
├─ docs/                     # 设计规格、需求、系统设计、测试报告、部署演示、使用说明
├─ proposal/                 # 开题报告（docx/pdf）与开题答辩 PPT（pptx/pdf）
├─ thesis/                   # 论文源文件、插图、docx/PDF 成稿、毕业答辩 PPT
├─ screenshots/              # 界面截图（final/ 为论文与 PPT 用图）
├─ tools/                    # 独立校验器、性能/E2E、截图、PPT 与论文生成脚本
├─ serve.py                  # 本地静态服务
└─ README.md
```

## 5. 数据契约（摘要）

JSON Lines，首行 `meta`，其后为 `node` / `edge` / `event` / `evidence` / `note` 记录；公共字段 `schema / seq / ts / kind`。十类节点、十一种关系、七个阶段、ATT&CK 战术/技术标签。完整字段与校验规则见 [docs/00-设计规格.md](docs/00-设计规格.md) 与 [chain.schema.json](data/schema/chain.schema.json)。

数据规模：

| 场景 | 记录 | 节点 | 关系 | 事件 | 证据 | 时长 |
|---|---|---|---|---|---|---|
| campus-lab | 150 | 66 | 51 | 25 | 5 | 181 min |
| corp-ad | 450 | 180 | 150 | 105 | 12 | 366 min |
| cloud-k8s | 900 | 260 | 320 | 300 | 17 | 573 min |

## 6. 测试与实验

```bash
# 插件：88 项
cd dsh-pentest
node --test --test-isolation=none tests/schema.test.mjs tests/redact.test.mjs tests/scope.test.mjs \
  tests/store.test.mjs tests/simulator.test.mjs tests/plugin.test.mjs tests/data.test.mjs tests/cli.test.mjs

# 前端：52 项
cd visualizer
node --test --test-isolation=none tests/*.test.mjs

# 独立数据校验（三场景均 0 error 0 warning）
cd ..
node tools/chain-check.mjs data/scenarios/campus-lab.jsonl
```

E2E 与性能（需先启动 `python serve.py` 和本地截图服务，见 [docs/04-测试报告.md](docs/04-测试报告.md)）：

```bash
node tools/e2e-check.mjs --json docs/e2e-results.json
node tools/bench.mjs
```

实测结果（1600×1000，headless Chrome 157，3 次中位数）：

| 场景 | 节点/关系 | 解析 | 布局 | 渲染 | 管线合计 | 页面首屏 | JS 堆 |
|---|---|---|---|---|---|---|---|
| campus-lab | 66 / 51 | 1.0 ms | 2.3 ms | 4.3 ms | 7.7 ms | 72 ms | 2.69 MB |
| corp-ad | 180 / 150 | 3.0 ms | 5.3 ms | 11.5 ms | 19.2 ms | 101 ms | 3.76 MB |
| cloud-k8s | 260 / 320 | 3.6 ms | 5.3 ms | 14.5 ms | 23.3 ms | 80 ms | 5.23 MB |

测试详情见 [docs/04-测试报告.md](docs/04-测试报告.md)。

## 7. 论文、开题报告与答辩 PPT

| 材料 | 文件 |
|---|---|
| 毕业论文（Word / PDF） | [docx](thesis/DSH插件dsh-pentest的探索链路数据可视化工具的设计与实现.docx) · [pdf](thesis/DSH插件dsh-pentest的探索链路数据可视化工具的设计与实现.pdf) |
| 开题报告（Word / PDF） | [docx](proposal/开题报告.docx) · [pdf](proposal/开题报告.pdf) |
| 开题答辩 PPT（14 页，含讲稿备注） | [pptx](proposal/开题答辩PPT.pptx) · [pdf](proposal/开题答辩PPT.pdf) |
| 毕业答辩 PPT（19 页，含讲稿备注） | [pptx](thesis/毕业答辩PPT.pptx) · [pdf](thesis/毕业答辩PPT.pdf) |
| 论文源文件与插图 | [thesis/source/](thesis/source/)、[thesis/figures/](thesis/figures/) |
| 开题报告源文件 | [proposal/source/开题报告.md](proposal/source/开题报告.md) |

论文排版：A4，正文宋体小四、1.5 倍行距，21 幅插图、25 张表，静态目录按实际页码生成；参考文献 30 条（GB/T 7714）。开题报告 11 页，含进度安排与指导教师/开题小组意见栏（待填写）。两套 PPT 均为 16:9 深色学术风格，备注页附讲解提示。

其他文档：
- 设计规格：[docs/00-设计规格.md](docs/00-设计规格.md)
- 需求分析：[docs/02-需求分析.md](docs/02-需求分析.md)
- 系统设计：[docs/03-系统设计.md](docs/03-系统设计.md)
- 插件说明：[docs/插件说明.md](docs/插件说明.md)
- 可视化使用说明：[docs/可视化使用说明.md](docs/可视化使用说明.md)
- 部署与答辩演示：[docs/05-部署与演示.md](docs/05-部署与演示.md)

## 8. 安全与合规边界

- 本项目的插件与工具**不发起任何网络扫描、漏洞利用或攻击请求**；只做结构化记录、校验与可视化。
- 三个场景全部为**仿真、脱敏数据**，目标地址仅使用 RFC1918 私网 / 回环 / `.test` 保留域；凭据值统一为 `[REDACTED]`，敏感证据默认打码。
- 真实使用必须在取得**书面授权**的前提下、在隔离靶场或授权范围内进行，并遵守《网络安全法》《数据安全法》与等级保护要求。
- 用户导入的数据只在浏览器内存中处理，不上传、不写盘（导出的文件由用户主动触发）。

## 9. 已知限制

- 报告打印依赖浏览器打印对话框；headless 环境未做 PDF 打印实测。
- ATT&CK 矩阵在 1366 宽度下需横向滚动查看全部 12 列（有意设计）。
- 大场景链路图默认优先保证可读字号（≥0.7 倍），可用“适配”查看全貌，或筛选聚焦子图。
- DSH 工具注册依赖宿主提供 `@deepseek-ai/dsh-tools`；普通 Node 环境会自动降级为 CLI 模式，不影响插件加载。
