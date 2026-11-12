#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成两套答辩幻灯片：
1. proposal/开题答辩PPT.pptx（开题答辩，约 14 页）
2. thesis/毕业答辩PPT.pptx（毕业答辩，约 19 页）

运行：python tools/build_pptx.py
依赖：python-pptx、Pillow；图片来自 thesis/figures 与 screenshots/final。
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from ppt_theme import (  # noqa: E402
    W, H, CX, CW, BG, BG_DEEP, PANEL, PANEL_2, PANEL_3, BORDER, BORDER_SOFT, TEXT, DIM, FAINT,
    CYAN, VIOLET, AMBER, RED, GREEN, WHITE, FONT, FONT_NUM, FONT_MONO, add_bullets, add_image,
    add_notes, add_rect, add_table, add_text, bg, card, kicker_title, metric, new_deck, pill,
    section_cover,
)
from pptx.enum.text import PP_ALIGN  # noqa: E402

FIG = ROOT / "thesis" / "figures"
SHOT = ROOT / "screenshots" / "final"

TITLE = "DSH 插件 dsh-pentest 的探索链路数据可视化工具的设计与实现"
AUTHOR = "孙博奥"
SID = "2301144050"
MAJOR = "网络工程"
SCHOOL = "黄河科技学院"


# ---------------------------------------------------------------------------
# 通用页面
# ---------------------------------------------------------------------------
def new_slide(prs, section, page=None):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    if page is False:
        bg(s, section, None)
    else:
        bg(s, section, page if page is not None else len(prs.slides))
    return s


def cover(prs, kicker, right_image, right_caption, meta_lines, date_text):
    s = new_slide(prs, "", False)
    # 背景 -> 加一层左侧渐变块
    add_rect(s, 0, 0, 7.4, H, BG, radius=False)
    add_rect(s, 0, 0, 0.10, H, CYAN, radius=False)
    add_text(s, 0.85, 0.85, 6.2, 0.3, kicker, 11, CYAN, bold=True)
    add_text(s, 0.85, 1.38, 6.4, 1.8, "探索链路数据\n可视化工具", 40, TEXT, bold=True, line_spacing=1.15)
    add_text(s, 0.87, 3.25, 6.2, 0.62, "ChainLens · 面向 dsh-pentest 的\n过程数据可视分析", 17, DIM, line_spacing=1.35)
    add_rect(s, 0.87, 4.18, 0.6, 0.035, CYAN, radius=False)
    add_text(s, 0.87, 4.34, 6.2, 0.35, TITLE, 11.5, FAINT, line_spacing=1.3)
    for i, line in enumerate(meta_lines):
        add_text(s, 0.87, 5.18 + i * 0.32, 6.2, 0.3, line, 12.5, DIM)
    add_text(s, 0.87, 6.42, 6.2, 0.3, date_text, 12, FAINT)
    add_image(s, right_image, 7.55, 1.72, 5.15, 3.25, frame=True)
    add_text(s, 7.55, 5.12, 5.15, 0.3, right_caption, 10, FAINT, align=PP_ALIGN.CENTER)
    return s


def section_slide(prs, num, title, en, bullets):
    s = new_slide(prs, "章节过渡", None)
    section_cover(s, num, title, en, bullets)
    return s


def bullets_title(slide, kicker, title, subtitle=None):
    kicker_title(slide, kicker, title, subtitle)


def divider(prs, section, page=None):
    return new_slide(prs, section, page)


# ---------------------------------------------------------------------------
# 开题答辩
# ---------------------------------------------------------------------------
def build_proposal():
    prs = new_deck()
    # 1 封面
    cover(
        prs,
        "本科毕业设计 · 开题答辩",
        FIG / "fig-4-1-architecture.png",
        "ChainLens 总体架构（采集 → 数据 → 分析 → 展示）",
        [f"学生：{AUTHOR}    学号：{SID}", f"专业：{MAJOR}    指导教师：＿＿＿＿", f"学院：{SCHOOL} · 工学部"],
        "2026 年 11 月",
    )
    add_notes(prs.slides[-1], "各位老师好，我是网络工程专业孙博奥，开题题目是《DSH 插件 dsh-pentest 的探索链路数据可视化工具的设计与实现》。下面从选题依据、研究内容、技术路线、重难点与创新、进度和预期成果六部分汇报。")

    # 2 目录
    s = new_slide(prs, "汇报提纲")
    kicker_title(s, "CONTENTS", "汇报提纲", "从问题出发，说明“做什么、怎么做、能做到什么程度”")
    items = [
        ("01", "选题依据", "智能体渗透测试的过程数据问题与研究现状"),
        ("02", "研究内容与目标", "数据契约、最小插件、六视图可视化、测试实验"),
        ("03", "研究方法与技术路线", "需求 → 契约 → 插件 → 前端 → 算法 → 测试"),
        ("04", "重点难点与创新点", "契约设计、阶段布局、关键路径、零依赖工程"),
        ("05", "进度安排", "2026.11 — 2027.06 分阶段推进"),
        ("06", "预期成果", "可运行系统、三场景数据、论文、测试报告"),
    ]
    for i, (num, title, desc) in enumerate(items):
        col, row = i % 2, i // 2
        x = CX + col * 5.95
        y = 2.05 + row * 1.52
        add_text(s, x, y, 0.62, 0.4, num, 20, CYAN, bold=True, font=FONT_NUM)
        add_text(s, x + 0.72, y - 0.02, 4.9, 0.3, title, 15, TEXT, bold=True)
        add_text(s, x + 0.72, y + 0.28, 4.9, 0.3, desc, 10.5, DIM)
        add_rect(s, x, y + 1.1, 5.05, 0.008, BORDER, radius=False)
    add_text(s, CX, 6.55, CW, 0.3, "本课题同时包含工程实现与可视化方法研究，强调可复现与可演示。", 10.5, FAINT)
    add_notes(prs.slides[-1], "汇报分六部分：先说明为什么做，再说明做什么、怎么做，最后是重点难点、进度和成果。")

    # 3 选题背景
    s = new_slide(prs, "01 选题依据")
    kicker_title(s, "BACKGROUND", "智能体进入渗透测试，但“过程”不可解释", "记录数量增加，不等于过程可复盘、可审计、可度量")
    cards = [
        ("过程黑箱", "智能体的计划、工具调用与判断散落在多轮对话与日志中，缺少统一过程视图。", CYAN, "PROBLEM 01"),
        ("数据异构", "资产、服务、漏洞、凭据、会话、证据、时间戳混在一起，难以形成结构化链路。", VIOLET, "PROBLEM 02"),
        ("复核困难", "评审者难以回答“这条路径怎么走通的、风险为什么高、证据在哪里”。", AMBER, "PROBLEM 03"),
    ]
    for i, (t, b, c, k) in enumerate(cards):
        card(s, CX + i * 3.98, 2.0, 3.78, 1.62, title=t, body=b, accent=c, kicker=k)
    add_rect(s, CX, 3.95, CW, 1.16, PANEL_2, BORDER)
    add_rect(s, CX, 3.95, 0.07, 1.16, CYAN, radius=False)
    add_text(s, CX + 0.3, 4.08, 0.8, 0.4, "核心\n判断", 11, CYAN, bold=True, line_spacing=1.2)
    add_text(s, CX + 1.15, 4.06, CW - 1.45, 0.9,
             "渗透测试的交付物不仅是“发现了多少漏洞”，还包括在什么授权范围内、以什么顺序、用什么手段得到什么结论的完整过程证据。"
             "缺少统一数据契约与可视化出口，过程数据无法成为可复核的资产。",
             13.5, TEXT, line_spacing=1.55)
    add_text(s, CX, 5.38, CW, 0.3, "现有 DSH 生态中 dsh-pentest 插件与数据格式均未公开，本课题需要自建最小记录插件与可复现仿真数据。",
             10.5, FAINT)
    add_notes(prs.slides[-1], "问题有三个层面：过程黑箱、数据异构、复核困难。核心判断是：过程本身也是交付物，需要契约和可视化。")

    # 4 研究现状
    s = new_slide(prs, "01 选题依据")
    kicker_title(s, "RELATED WORK", "国内外研究现状：四类工作提供了基础，但仍有缺口", "攻击图 · 安全可视化与溯源 · 图布局与可视分析 · 智能体插件生态")
    lit = [
        ("攻击图与攻击路径", "以图结构枚举攻击可达性，可计算最小代价路径；面向“潜在可能性”，需预先建模规则库。", CYAN, "[6]-[11]"),
        ("安全日志与溯源", "安全可视化综述、PROV 溯源模型与事件溯源强调只追加、可重放；但多面向流量与日志，缺过程阶段语义。", VIOLET, "[12]-[15]"),
        ("图布局与可视分析", "Sugiyama 分层布局、重心法、力导向布局与交互意图分类；提供布局与交互基础，但需结合阶段约束。", AMBER, "[16]-[23]"),
        ("智能体插件生态", "Cordis/DSH 以插件扩展能力，重视能力注册，对过程数据契约与解释性关注不足。", GREEN, "[5]"),
    ]
    for i, (t, b, c, ref) in enumerate(lit):
        col, row = i % 2, i // 2
        x, y = CX + col * 5.95, 2.02 + row * 1.58
        card(s, x, y, 5.72, 1.42, title=t, body=b, accent=c, kicker=ref, title_size=13.5, body_size=10.2)
    add_rect(s, CX, 5.3, CW, 0.82, PANEL_2, BORDER)
    add_text(s, CX + 0.25, 5.42, 1.0, 0.3, "研究缺口", 10.5, RED, bold=True)
    add_text(s, CX + 1.25, 5.4, CW - 1.5, 0.6,
             "① 缺少面向“已发生过程”的可视化；② 缺少统一过程数据契约；③ 结构、时间、证据分散在不同视图；④ 教学演示所需可复现性不足。",
             11, DIM, line_spacing=1.45)
    add_notes(prs.slides[-1], "四类工作分别解决“呈现什么、怎么解释、怎么排布、数据从哪来”。共同缺口是：面向已发生过程的统一契约与可视化。")

    # 5 研究问题与目标
    s = new_slide(prs, "01 选题依据")
    kicker_title(s, "QUESTIONS & GOALS", "研究问题：如何把过程数据变成可复核的分析对象？", "三个问题，对应三项可验证的目标")
    qs = [
        ("Q1 数据契约", "如何用一份可校验、可回放、可脱敏的文本契约，统一表达资产、关系、动作与证据？", CYAN),
        ("Q2 可视化表达", "如何让结构关系、时间推进与覆盖度在同一套视图中联动，而不是彼此割裂？", VIOLET),
        ("Q3 工程可验证", "如何在零依赖、离线、可复现的约束下完成实现，并用测试与性能实验验证？", AMBER),
    ]
    for i, (t, b, c) in enumerate(qs):
        card(s, CX, 2.0 + i * 1.36, 6.65, 1.18, title=t, body=b, accent=c, title_size=14, body_size=10.8)
    metrics = [
        ("0", "第三方依赖", "纯前端 + 原生 SVG"),
        ("< 1 s", "260 节点首屏", "设计目标，实测 80 ms"),
        ("140", "单元测试", "插件 88 + 前端 52"),
        ("31/31", "端到端检查", "三场景 · 六视图 · 深链"),
    ]
    for i, (v, l, sub) in enumerate(metrics):
        x = 7.65 + (i % 2) * 2.6
        y = 2.0 + (i // 2) * 1.65
        metric(s, x, y, 2.4, 1.45, v, l, sub, accent=[CYAN, VIOLET, AMBER, GREEN][i])
    add_text(s, CX, 6.12, CW, 0.3, "目标均可度量：契约可校验、视图可操作、算法可单测、性能可复现。", 10.5, FAINT)
    add_notes(prs.slides[-1], "三个研究问题分别对应契约、可视化与工程验证。右侧是四个可度量的目标。")

    # 6 研究内容
    s = new_slide(prs, "02 研究内容")
    kicker_title(s, "RESEARCH CONTENT", "研究内容：一条“采集—校验—可视化—报告”的完整闭环", "四个部分相互支撑，最终形成可运行系统")
    contents = [
        ("01", "数据契约", "六类记录 · 十类节点\n十一种关系 · 七个阶段\nJSONL 事件溯源 + JSON Schema", CYAN),
        ("02", "最小插件", "四个工具接口\n授权/scope 守卫\n递归脱敏 · 确定性仿真", VIOLET),
        ("03", "可视化工具", "总览 · 链路图 · 时间线\nATT&CK · 发现证据 · 报告\n零依赖 · 零构建 · 离线", AMBER),
        ("04", "测试与论文", "140 项单元测试\n31 项端到端检查\n三场景性能实验", GREEN),
    ]
    for i, (num, t, b, c) in enumerate(contents):
        x = CX + i * 2.98
        add_rect(s, x, 2.0, 2.78, 2.2, PANEL, BORDER)
        add_rect(s, x, 2.0, 2.78, 0.05, c, radius=False)
        add_text(s, x + 0.2, 2.18, 0.7, 0.35, num, 16, c, bold=True, font=FONT_NUM)
        add_text(s, x + 0.2, 2.55, 2.35, 0.35, t, 16, TEXT, bold=True)
        add_text(s, x + 0.2, 3.02, 2.35, 1.3, b, 10.2, DIM, line_spacing=1.55)
        if i < 3:
            add_text(s, x + 2.79, 3.1, 0.18, 0.3, "→", 16, FAINT)
    add_rect(s, CX, 4.55, CW, 0.8, PANEL_2, BORDER)
    add_text(s, CX + 0.25, 4.67, 3.0, 0.3, "交付形态", 10.5, CYAN, bold=True)
    add_text(s, CX + 1.35, 4.63, CW - 1.6, 0.55,
             "dsh-pentest 插件（记录）+ ChainLens 可视化（分析）+ 三份仿真数据 + 论文与测试报告；均可离线运行、可复现。",
             11.5, TEXT, line_spacing=1.45)
    add_notes(prs.slides[-1], "四部分内容形成一个闭环：插件负责生产，契约负责约束，前端负责消费与解释，测试负责验证。")

    # 7 数据契约
    s = new_slide(prs, "02 研究内容")
    kicker_title(s, "DATA CONTRACT", "数据契约：用事件溯源表达一次探索过程", "dsh-pentest/chain@1 · UTF-8 JSON Lines · 首行 meta")
    add_bullets(s, CX, 2.0, 4.15, 4.4, [
        [("六类记录", {"bold": True, "color": TEXT}), ("：meta / node / edge / event / evidence / note", {"color": DIM})],
        [("十类节点", {"bold": True, "color": TEXT}), ("：目标、主机、服务、Web 应用、接口、漏洞、凭据、会话、数据、发现", {"color": DIM})],
        [("十一种关系", {"bold": True, "color": TEXT}), ("：暴露、运行于、存在漏洞、利用、授予、横向、佐证等", {"color": DIM})],
        [("七个阶段", {"bold": True, "color": TEXT}), ("：侦察 → 验证 → 初始访问 → 提权 → 横向 → 收集 → 报告", {"color": DIM})],
        [("两层语义", {"bold": True, "color": TEXT}), ("：阶段表示“进度”，ATT&CK 表示“技战术”，解耦表达", {"color": DIM})],
        [("可校验", {"bold": True, "color": TEXT}), ("：JSON Schema + 引用完整性 + 时间单调 + 敏感值检测", {"color": DIM})],
    ], size=11.8, space=10)
    add_image(s, FIG / "fig-4-2-data-model.png", 5.05, 1.95, 7.35, 4.65, caption="图 1  记录流 → 归一化模型 → 六个视图（论文图 4-2）")
    add_notes(prs.slides[-1], "契约是整个系统的地基：六类记录、十类节点、十一种关系、七个阶段；事件是回放的最小粒度，节点是状态，边是关系。")

    # 8 系统架构
    s = new_slide(prs, "02 研究内容")
    kicker_title(s, "ARCHITECTURE", "系统架构：四层解耦，数据单向流动", "采集层 → 数据层 → 分析层 → 展示层")
    add_image(s, FIG / "fig-4-1-architecture.png", CX, 1.95, 8.05, 4.72, caption="图 2  ChainLens 总体架构（论文图 4-1）")
    layers = [
        ("采集层", "dsh-pentest 插件：工具、校验、脱敏、存储、仿真", CYAN),
        ("数据层", "chain.jsonl + manifest.json + schema", VIOLET),
        ("分析层", "解析、图模型、指标、关键路径、布局、回放", AMBER),
        ("展示层", "六个视图 + 深链 + 报告", GREEN),
    ]
    for i, (t, b, c) in enumerate(layers):
        y = 2.05 + i * 1.08
        add_rect(s, 9.1, y, 3.4, 0.92, PANEL, BORDER)
        add_rect(s, 9.1, y, 0.05, 0.92, c, radius=False)
        add_text(s, 9.25, y + 0.12, 1.0, 0.3, t, 12, c, bold=True)
        add_text(s, 9.25, y + 0.42, 3.1, 0.42, b, 9.5, DIM, line_spacing=1.25)
    add_notes(prs.slides[-1], "四层架构的关键是数据单向流动：插件只写，前端只读同一份事实；因此视图可以复现、可以审计。")

    # 9 关键方法
    s = new_slide(prs, "02 研究内容")
    kicker_title(s, "METHODS", "关键方法：确定性布局 + 风险加权关键路径", "算法不使用随机数，同一输入得到同一结果")
    methods = [
        ("阶段约束分层布局", "同阶段同列；四轮重心排序 + 18 次同层力松弛；节点过多自动拆子列；力导向作为对照。",
         "O(k·(|V|+|E|))", CYAN),
        ("风险加权关键路径", "仅前向边，节点权重 w=1+risk，DAG 上 DP；无前向边回退最大风险节点。",
         "O(|V|+|E|)", VIOLET),
        ("回放与视图联动", "事件游标决定可见子图；播放间隔归一化 350–1400 ms；筛选/选中/游标由 URL 深链复现。",
         "350–1400 ms", AMBER),
    ]
    for i, (t, b, tag, c) in enumerate(methods):
        x = CX + i * 3.98
        card(s, x, 2.0, 3.78, 2.0, title=t, body=b, accent=c, kicker=tag, title_size=14, body_size=10.8)
    add_rect(s, CX, 4.45, CW, 0.62, PANEL_2, BORDER)
    add_text(s, CX + 0.25, 4.57, CW - 0.5, 0.4,
             "可复现性：固定种子仿真 + 确定性布局，保证论文插图、测试结果与答辩演示一致。", 11.5, TEXT)
    add_notes(prs.slides[-1], "三个方法分别解决“怎么排、怎么找关键路径、怎么回放”。所有算法都要求确定性，方便截图与测试复现。")

    # 10 技术路线
    s = new_slide(prs, "03 技术路线")
    kicker_title(s, "ROADMAP", "技术路线：六个阶段推进，先契约后实现", "需求分析 → 契约设计 → 插件实现 → 可视化实现 → 测试实验 → 论文定稿")
    steps = [
        ("01", "需求分析", "场景、角色\n功能与非功能"),
        ("02", "契约设计", "记录类型\n校验规则"),
        ("03", "插件实现", "工具、存储\n脱敏、仿真"),
        ("04", "可视化实现", "解析、布局\n六视图"),
        ("05", "测试实验", "单测、E2E\n性能与容错"),
        ("06", "论文定稿", "图表、数据\n排版与查重"),
    ]
    for i, (n, t, b) in enumerate(steps):
        x = CX + i * 2.02
        add_text(s, x, 2.05, 0.45, 0.3, n, 13, CYAN, bold=True, font=FONT_NUM)
        add_text(s, x, 2.38, 1.75, 0.3, t, 13, TEXT, bold=True)
        add_text(s, x, 2.74, 1.75, 0.8, b, 9.8, DIM, line_spacing=1.35)
        if i < 5:
            add_text(s, x + 1.82, 2.45, 0.18, 0.3, "→", 14, FAINT)
    add_rect(s, CX, 4.05, CW, 1.38, PANEL, BORDER)
    add_text(s, CX + 0.25, 4.18, 2.2, 0.3, "技术栈", 10.5, CYAN, bold=True)
    tech = [("Node.js 24", "插件/CLI/测试"), ("JSONL / JSON Schema", "数据契约"), ("原生 HTML/CSS/ES Modules", "前端"),
            ("SVG 自绘", "图形"), ("Python", "静态服务/文档"), ("Chrome Headless", "E2E/截图/性能")]
    for i, (a, b) in enumerate(tech):
        x = CX + 0.25 + (i % 3) * 3.85
        y = 4.55 + (i // 3) * 0.42
        add_text(s, x, y, 1.6, 0.3, a, 10.5, TEXT, bold=True)
        add_text(s, x + 1.55, y, 1.9, 0.3, b, 9.5, FAINT)
    add_notes(prs.slides[-1], "路线强调先契约后实现：契约冻结后，插件端和可视化端可以并行开发，最后用测试和论文收口。")

    # 11 进度安排（甘特图）
    s = new_slide(prs, "04 进度安排")
    kicker_title(s, "SCHEDULE", "进度安排：2026.11 — 2027.06", "按月划分，设置阶段交付物与检查点")
    months = ["11月", "12月", "1月", "2月", "3月", "4月", "5月", "6月"]
    gx, gy, gw = 3.15, 2.12, 9.35
    colw = gw / len(months)
    for i, m in enumerate(months):
        add_text(s, gx + i * colw + colw / 2 - 0.45, gy - 0.28, 0.9, 0.22, m, 8.5, FAINT, align=PP_ALIGN.CENTER)
        if i:
            add_rect(s, gx + i * colw, gy, 0.006, 3.55, BORDER, radius=False)
    tasks = [
        ("开题调研", 0, 2, "开题报告、文献综述", CYAN),
        ("需求与契约", 1, 3, "schema、三场景蓝本", VIOLET),
        ("插件实现", 2, 4, "四工具、脱敏、CLI、单测", AMBER),
        ("可视化实现", 3, 6, "六视图、布局、回放、E2E", GREEN),
        ("测试与论文", 5, 7, "性能实验、论文初稿", CYAN),
        ("定稿与答辩", 6, 8, "查重、PPT、答辩", VIOLET),
    ]
    for i, (name, a, b, deliver, c) in enumerate(tasks):
        y = gy + 0.18 + i * 0.6
        add_text(s, CX, y + 0.04, 2.2, 0.28, name, 10.5, TEXT, bold=True)
        add_text(s, gx, y + 0.04, 0.0, 0.0, "", 8, FAINT)
        add_rect(s, gx + a * colw + 0.03, y, (b - a) * colw - 0.06, 0.28, c, radius=True, alpha=0.85)
        add_text(s, gx + a * colw + 0.10, y + 0.03, (b - a) * colw - 0.2, 0.24, deliver, 8.2, BG_DEEP)
    add_text(s, CX, 6.25, CW, 0.55,
             "关键检查点：第 4 月完成可运行原型与三场景数据；第 5 月完成测试报告与论文初稿；第 6 月完成定稿与答辩准备。",
             10.5, FAINT, line_spacing=1.35)
    add_notes(prs.slides[-1], "进度按八个月安排，先完成契约与原型，再留出测试、论文和答辩缓冲。")

    # 12 预期成果与创新点
    s = new_slide(prs, "05 预期成果")
    kicker_title(s, "DELIVERABLES & INNOVATION", "预期成果与创新点", "工程交付 + 方法探索 + 可复用数据")
    add_rect(s, CX, 2.0, 5.35, 3.65, PANEL, BORDER)
    add_text(s, CX + 0.25, 2.15, 2.5, 0.3, "预期成果", 13, CYAN, bold=True)
    add_bullets(s, CX + 0.25, 2.58, 4.9, 2.9, [
        "可运行的 dsh-pentest 最小插件与 ChainLens 可视化工具",
        "三份规模递增、可复现的仿真探索链路数据",
        "JSON Schema 数据契约与独立校验器",
        "140 项单元测试、31 项端到端检查、性能实验数据",
        "毕业论文、开题报告、答辩 PPT 与演示材料",
    ], size=11.5, space=12)
    innovations = [
        ("过程导向的数据契约", "以事件溯源统一“资产—关系—动作—证据”，支持回放与审计。", CYAN),
        ("阶段语义进入布局", "阶段作为硬约束分列，重心排序 + 轻量力松弛，结果确定。", VIOLET),
        ("零依赖离线可视分析", "自绘 SVG，六视图共享状态，深链可复现，适配隔离环境。", AMBER),
        ("安全边界内建采集端", "授权/scope/脱敏在记录时完成，而非事后补救。", GREEN),
    ]
    for i, (t, b, c) in enumerate(innovations):
        x = 6.35 + (i % 2) * 3.1
        y = 2.0 + (i // 2) * 1.9
        card(s, x, y, 2.95, 1.7, title=t, body=b, accent=c, title_size=12.5, body_size=9.8)
    add_notes(prs.slides[-1], "成果分工程与材料两类；创新点强调“过程契约、阶段布局、零依赖、安全内建”，不夸大算法创新。")

    # 13 可行性与风险
    s = new_slide(prs, "05 预期成果")
    kicker_title(s, "FEASIBILITY & RISKS", "可行性与风险应对", "已有可运行原型与三场景数据，风险可控")
    feas = [
        ("技术可行", "Node/原生 Web/SVG 均为成熟技术；已有插件、前端与测试原型。", CYAN),
        ("数据可行", "原始插件与数据格式缺失，已用固定 seed 生成三份可复现仿真数据。", VIOLET),
        ("环境可行", "零依赖、离线运行；本地服务 + 浏览器即可演示。", AMBER),
        ("时间可行", "关键模块已提前完成，留出论文与答辩缓冲。", GREEN),
    ]
    for i, (t, b, c) in enumerate(feas):
        card(s, CX + i * 2.98, 1.95, 2.78, 1.4, title=t, body=b, accent=c, title_size=12.5, body_size=9.6)
    rows = [
        ["数据来源单一", "自建插件 + 固定 seed 仿真 + 可导入外部 JSONL"],
        ["浏览器性能", "默认缩放保证可读；600+ 节点隐藏标签/降级动画"],
        ["进度风险", "里程碑检查点；先完成可运行原型，再写论文"],
        ["合规风险", "仅仿真/授权数据；授权与 scope 守卫 + 脱敏"],
    ]
    add_table(s, CX, 3.62, CW, 2.25, ["风险", "应对措施"], rows, col_widths=[3.6, 8.23], font_size=10.2, row_height=0.44)
    add_rect(s, CX, 6.08, CW, 0.5, PANEL_2, BORDER)
    add_text(s, CX + 0.22, 6.18, CW - 0.44, 0.3, "已有可运行原型、三场景数据与测试结果，课题具备继续推进与按期答辩的条件。", 10.5, DIM)
    add_notes(prs.slides[-1], "可行性的核心是：原型与数据已经存在，剩下的是测试、论文与答辩材料。风险都有对应措施。")

    # 14 结束
    s = new_slide(prs, "", False)
    add_rect(s, CX, 1.45, 0.09, 3.3, CYAN, radius=False)
    add_text(s, CX + 0.4, 1.4, 9.5, 0.4, "THANK YOU", 13, CYAN, bold=True)
    add_text(s, CX + 0.4, 1.85, 10.5, 0.8, "请各位老师批评指正", 34, TEXT, bold=True)
    add_text(s, CX + 0.42, 2.85, 9.5, 0.5, "开题汇报结束 · 后续将按计划推进系统实现与论文工作", 13, DIM)
    add_text(s, CX + 0.42, 4.1, 8.0, 0.35, f"{AUTHOR} · {MAJOR} · {SID}", 12, FAINT)
    add_text(s, CX + 0.42, 4.45, 8.0, 0.35, f"{SCHOOL} 工学部 · 2026 年 11 月", 11, FAINT)
    add_notes(prs.slides[-1], "我的汇报到此结束，请各位老师批评指正，谢谢。")

    out = ROOT / "proposal" / "开题答辩PPT.pptx"
    out.parent.mkdir(parents=True, exist_ok=True)
    prs.save(out)
    print("written", out, "slides:", len(prs.slides))


# ---------------------------------------------------------------------------
# 毕业答辩
# ---------------------------------------------------------------------------
def build_defense():
    prs = new_deck()
    cover(
        prs,
        "本科毕业设计 · 答辩",
        SHOT / "fig-5-4-graph-view.png",
        "ChainLens 链路图：阶段分列、关键路径与节点详情",
        [f"学生：{AUTHOR}    学号：{SID}", f"专业：{MAJOR}    指导教师：＿＿＿＿", f"学院：{SCHOOL} · 工学部"],
        "2027 年 6 月",
    )
    add_notes(prs.slides[-1], "各位老师好，我是网络工程专业孙博奥，毕业设计题目是《DSH 插件 dsh-pentest 的探索链路数据可视化工具的设计与实现》，系统名为 ChainLens。")

    # 目录
    s = new_slide(prs, "答辩提纲")
    kicker_title(s, "AGENDA", "答辩提纲", "从问题、数据、系统到实验与创新")
    items = [
        ("01", "背景与问题", "智能体渗透测试的过程数据为何需要可视化"),
        ("02", "数据与架构", "数据契约、最小插件与四层架构"),
        ("03", "系统实现", "六个视图、关键算法与交互"),
        ("04", "测试与实验", "140 项测试、31 项 E2E 与性能数据"),
        ("05", "创新与展望", "创新点、不足与后续方向"),
    ]
    for i, (n, t, d) in enumerate(items):
        y = 2.05 + i * 0.9
        add_text(s, CX, y, 0.55, 0.3, n, 14, CYAN, bold=True, font=FONT_NUM)
        add_text(s, CX + 0.68, y - 0.03, 3.0, 0.3, t, 16, TEXT, bold=True)
        add_text(s, CX + 3.7, y, 7.8, 0.3, d, 10.5, DIM)
        add_rect(s, CX, y + 0.62, CW, 0.008, BORDER, radius=False)
    add_notes(prs.slides[-1], "我将从背景问题、数据与架构、系统实现、测试实验、创新与展望五个部分汇报。")

    # 背景
    s = new_slide(prs, "01 背景与问题")
    kicker_title(s, "BACKGROUND", "过程数据 ≠ 可解释：智能体渗透测试的复核困境", "合规要求“过程可追溯”，现有工具却只给结果")
    cards = [
        ("数据分散", "计划、工具调用、资产发现、验证动作散落在会话与日志中，缺少统一结构。", CYAN),
        ("因果链断裂", "某条会话如何获得、某个凭据来自哪次利用，需要反复回溯人工整理。", VIOLET),
        ("结论难复核", "评审者无法回答“风险为什么高、证据在哪、是否在授权范围内”。", AMBER),
    ]
    for i, (t, b, c) in enumerate(cards):
        card(s, CX + i * 3.98, 1.98, 3.78, 1.62, title=t, body=b, accent=c, title_size=15, body_size=10.8)
    add_rect(s, CX, 3.92, CW, 1.25, PANEL_2, BORDER)
    add_rect(s, CX, 3.92, 0.07, 1.25, CYAN, radius=False)
    add_text(s, CX + 0.3, 4.06, 0.8, 0.4, "研究\n对象", 11, CYAN, bold=True, line_spacing=1.2)
    add_text(s, CX + 1.2, 4.03, CW - 1.5, 1.0,
             "面向 DSH 插件 dsh-pentest 产生的“探索链路”：以资产、服务、漏洞、凭据、会话、证据与动作构成的事件序列。"
             "目标不是替代渗透测试工具，而是把过程记录变成可复核、可演示、可审计的分析对象。",
             13, TEXT, line_spacing=1.55)
    add_text(s, CX, 5.45, CW, 0.3, "边界：插件只记录、不攻击；样例为仿真/脱敏数据；真实使用须书面授权。", 10.5, FAINT)
    add_notes(prs.slides[-1], "问题可以概括为三句话：数据分散、因果链断裂、结论难复核。本文只做记录与可视化，不包含攻击能力。")

    # 研究现状
    s = new_slide(prs, "01 背景与问题")
    kicker_title(s, "RELATED WORK", "已有研究提供了基础，但缺少“过程导向”的统一方案", "攻击图 · 安全可视化与溯源 · 图布局 · 插件生态")
    areas = [
        ("攻击图", "枚举潜在攻击路径，适合“是否可达”，不适合“已经发生了什么”。", "[6]-[11]", CYAN),
        ("安全可视化/溯源", "强调日志、溯源与事件重放，但偏流量/血缘，缺渗透阶段与证据语义。", "[12]-[15]", VIOLET),
        ("图布局/交互", "分层、重心、力导向与交互分类成熟，可直接借鉴到阶段约束布局。", "[16]-[23]", AMBER),
        ("智能体插件", "能力扩展成熟，过程数据契约与可视化出口不足。", "[5]", GREEN),
    ]
    for i, (t, b, ref, c) in enumerate(areas):
        col, row = i % 2, i // 2
        card(s, CX + col * 5.95, 1.98 + row * 1.62, 5.72, 1.46, title=t, body=b, accent=c, kicker=ref,
             title_size=13.5, body_size=10)
    add_rect(s, CX, 5.35, CW, 0.72, PANEL_2, BORDER)
    add_text(s, CX + 0.25, 5.45, 1.1, 0.3, "本文定位", 10.2, RED, bold=True)
    add_text(s, CX + 1.35, 5.42, CW - 1.6, 0.55,
             "补足“过程数据契约 + 过程可视化 + 可复现工程”这一段，把攻击图的事前分析与安全可视化的日志分析连接起来。",
             11, DIM, line_spacing=1.4)
    add_notes(prs.slides[-1], "本文不是提出新的攻击图算法，而是补过程数据契约与可视化的工程缺口。")

    # 研究内容
    s = new_slide(prs, "02 数据与架构")
    kicker_title(s, "OVERVIEW", "研究内容：插件记录 + 契约约束 + 可视化分析", "一条从数据生产到分析报告的完整链路")
    blocks = [
        ("dsh-pentest 插件", "4 个工具 · 授权/scope 守卫 · 递归脱敏 · JSONL 追加", CYAN),
        ("dsh-pentest/chain@1", "6 类记录 · 10 类节点 · 11 种关系 · 7 个阶段", VIOLET),
        ("ChainLens 可视化", "6 个视图 · 布局/关键路径/回放 · 零依赖离线", AMBER),
    ]
    for i, (t, b, c) in enumerate(blocks):
        x = CX + i * 3.98
        add_rect(s, x, 2.1, 3.78, 1.55, PANEL, BORDER)
        add_rect(s, x, 2.1, 3.78, 0.05, c, radius=False)
        add_text(s, x + 0.22, 2.28, 3.3, 0.3, t, 15, TEXT, bold=True)
        add_text(s, x + 0.22, 2.68, 3.3, 0.8, b, 10.2, DIM, line_spacing=1.4)
        if i < 2:
            add_text(s, x + 3.8, 2.7, 0.18, 0.3, "→", 18, FAINT)
    add_image(s, SHOT / "fig-5-3-overview.png", CX, 3.9, 8.0, 2.75, caption="总览视图：KPI、阶段分布、严重度与关键路径摘要")
    add_rect(s, 9.0, 3.9, 3.55, 2.75, PANEL, BORDER)
    add_text(s, 9.2, 4.05, 3.15, 0.3, "交付物", 12, CYAN, bold=True)
    add_bullets(s, 9.2, 4.42, 3.15, 2.05, [
        "插件 + CLI + 三场景数据",
        "六视图可视化工具",
        "契约与独立校验器",
        "140 项测试 + 31 项 E2E",
        "论文 / 开题报告 / PPT",
    ], size=9.8, space=4)
    add_notes(prs.slides[-1], "系统由三部分组成：插件生产数据，契约约束数据，前端消费并解释数据。右侧是最终交付物。")

    # 数据契约
    s = new_slide(prs, "02 数据与架构")
    kicker_title(s, "DATA CONTRACT", "数据契约：事件溯源 + 双层语义 + 三级校验", "同一份 JSONL 支撑图、时间线、矩阵与报告")
    add_image(s, FIG / "fig-4-2-data-model.png", CX, 1.95, 7.4, 4.68, caption="记录流 → 归一化图模型 → 六个视图")
    add_bullets(s, 8.35, 2.0, 4.25, 4.5, [
        [("六类记录", {"bold": True, "color": TEXT}), ("：meta / node / edge / event / evidence / note", {"color": DIM})],
        [("事件是最小回放粒度", {"bold": True, "color": TEXT}), ("；节点是状态、边是关系", {"color": DIM})],
        [("阶段 = 进度轴", {"bold": True, "color": TEXT}), ("，ATT&CK = 技战术语义，两者解耦", {"color": DIM})],
        [("错误 / 警告 / 提示", {"bold": True, "color": TEXT}), ("三级校验，坏行不阻断整体", {"color": DIM})],
        [("质量分", {"bold": True, "color": TEXT}), ("：max(0, 100−8E−2W)，总览页展示", {"color": DIM})],
    ], size=10.8, space=10)
    add_notes(prs.slides[-1], "契约设计的关键是双轨：阶段管进度，ATT&CK 管语义；同一份数据可以推导出六个视图。")

    # 架构
    s = new_slide(prs, "02 数据与架构")
    kicker_title(s, "ARCHITECTURE", "系统架构：采集—数据—分析—展示", "层间解耦，视图只读同一份事实")
    add_image(s, FIG / "fig-4-1-architecture.png", CX, 1.95, 8.1, 4.75, caption="ChainLens 总体架构")
    add_bullets(s, 9.15, 2.05, 3.4, 4.2, [
        [("采集层", {"bold": True, "color": CYAN}), ("：插件工具、校验、脱敏、JSONL 存储、确定性仿真", {"color": DIM})],
        [("数据层", {"bold": True, "color": VIOLET}), ("：chain.jsonl + manifest + schema", {"color": DIM})],
        [("分析层", {"bold": True, "color": AMBER}), ("：纯函数解析、指标、布局、关键路径、回放", {"color": DIM})],
        [("展示层", {"bold": True, "color": GREEN}), ("：六视图 + 深链 + 报告", {"color": DIM})],
        [("原则", {"bold": True, "color": TEXT}), ("：算法与 DOM 解耦，可单测、可复现", {"color": DIM})],
    ], size=10, space=8)
    add_notes(prs.slides[-1], "四层架构，核心原则是数据单向流动，视图不反写事实；因此所有分析结果可复现。")

    # 插件实现
    s = new_slide(prs, "03 系统实现")
    kicker_title(s, "PLUGIN", "插件实现：四个工具 + 双重安全守卫 + 单行原子追加", "只记录、不攻击；无 DSH 时自动降级为 CLI")
    tools = [
        ("start_engagement", "授权依据 / mode / scope\n创建作业目录与 meta", CYAN),
        ("record_step", "kind + data\n补 seq/ts、校验、脱敏、追加", VIOLET),
        ("finish_engagement", "追加结项 note\n原子写 summary.json", AMBER),
        ("demo", "三场景确定性仿真\n无网络、无命令执行", GREEN),
    ]
    for i, (t, b, c) in enumerate(tools):
        x = CX + (i % 2) * 4.2
        y = 1.95 + (i // 2) * 1.62
        card(s, x, y, 3.95, 1.42, title=t, body=b, accent=c, kicker="TOOL", title_size=12.5, body_size=9.6)
    add_image(s, FIG / "fig-5-1-sequence.png", 8.35, 1.95, 4.2, 2.85, caption="工具调用与记录落盘时序")
    add_rect(s, 8.35, 5.0, 4.2, 1.5, PANEL, BORDER)
    add_text(s, 8.5, 5.1, 3.9, 0.3, "安全实现", 11, GREEN, bold=True)
    add_text(s, 8.5, 5.44, 3.9, 0.95,
             "递归脱敏 [REDACTED] · 私网/.test scope 守卫 · 路径穿越防护 · 单次 write + 文件锁 + 临时文件 rename",
             9.4, DIM, line_spacing=1.3)
    add_notes(prs.slides[-1], "插件只做记录。四个工具覆盖作业生命周期；安全守卫在写入前完成，而不是展示时补救。")

    # 可视化总览
    s = new_slide(prs, "03 系统实现")
    kicker_title(s, "VISUALIZATION", "六个视图：从“看整体”到“看结论”", "零第三方依赖、零构建、零外部网络请求")
    add_image(s, SHOT / "fig-5-3-overview.png", CX, 1.95, 8.55, 4.8, caption="总览：授权信息、KPI、阶段/严重度分布、链路摘要")
    add_bullets(s, 9.45, 2.05, 3.1, 4.4, [
        [("总览", {"bold": True, "color": CYAN}), ("：6 个 KPI、阶段分布、TOP 风险", {"color": DIM})],
        [("链路图", {"bold": True, "color": VIOLET}), ("：分层布局、关键路径、回放", {"color": DIM})],
        [("时间线", {"bold": True, "color": AMBER}), ("：7 条泳道、播放与步进", {"color": DIM})],
        [("ATT&CK", {"bold": True, "color": GREEN}), ("：战术×技术热力、下钻", {"color": DIM})],
        [("发现与证据", {"bold": True, "color": RED}), ("：筛选/打码/导出", {"color": DIM})],
        [("分析报告", {"bold": True, "color": TEXT}), ("：九部分、A4 打印", {"color": DIM})],
    ], size=10.2, space=8)
    add_notes(prs.slides[-1], "六个视图不是六张孤立图表，而是共享筛选、游标与选中对象；这张是总览视图。")

    # 链路图
    s = new_slide(prs, "03 系统实现")
    kicker_title(s, "CHAIN GRAPH", "链路图：阶段约束布局 + 风险加权关键路径", "同阶段同列；四轮重心排序；18 次同层力松弛")
    add_image(s, SHOT / "fig-5-4-graph-view.png", CX, 1.95, 7.75, 4.75, caption="链路图：关键路径、节点详情与证据关联")
    add_rect(s, 8.7, 1.95, 3.9, 2.2, PANEL, BORDER)
    add_text(s, 8.9, 2.08, 3.5, 0.3, "布局算法", 12, CYAN, bold=True)
    add_text(s, 8.9, 2.45, 3.5, 1.55,
             "layer(v)=stage(v)；初始按类型/风险排序；四轮正向/反向重心；固定 x 的同层力松弛；节点过多自动拆子列。",
             9.8, DIM, line_spacing=1.35)
    add_rect(s, 8.7, 4.35, 3.9, 2.35, PANEL, BORDER)
    add_text(s, 8.9, 4.48, 3.5, 0.3, "关键路径", 12, VIOLET, bold=True)
    add_text(s, 8.9, 4.85, 3.5, 0.35, "dp(v) = w(v) + max dp(u)", 11.5, TEXT, bold=True, font=FONT_MONO)
    add_text(s, 8.9, 5.25, 3.5, 1.2,
             "仅前向边；w = 1 + risk；DAG 上 DP，终点回溯；无前向边回退最大风险节点；O(V+E)。",
             9.6, DIM, line_spacing=1.35)
    add_notes(prs.slides[-1], "链路图的核心是阶段硬约束：左到右就是侦察到报告；红色是关键路径，右侧抽屉展示节点字段与证据。")

    # 时间线与 ATT&CK
    s = new_slide(prs, "03 系统实现")
    kicker_title(s, "TIMELINE & ATT&CK", "时间线回放与 ATT&CK 覆盖", "看过程推进，也看技战术覆盖")
    add_image(s, SHOT / "fig-5-5-timeline.png", CX, 2.0, 5.8, 3.65, caption="时间线：七条阶段泳道 + 回放游标")
    add_image(s, SHOT / "fig-5-6-attack.png", 6.85, 2.0, 5.75, 3.65, caption="ATT&CK：战术×技术覆盖矩阵")
    add_rect(s, CX, 5.95, CW, 0.55, PANEL_2, BORDER)
    add_text(s, CX + 0.2, 6.05, CW - 0.4, 0.35,
             "回放游标决定可见子图；播放间隔归一化到 350–1400 ms，可 0.5×/1×/2×/4×；两视图与链路图共享同一游标。",
             10.2, DIM)
    add_notes(prs.slides[-1], "时间线回答“什么时候发生了什么”，ATT&CK 回答“用了什么技战术”。两者与链路图共享游标和筛选。")

    # 发现证据报告
    s = new_slide(prs, "03 系统实现")
    kicker_title(s, "FINDINGS & REPORT", "发现、证据与自动报告", "从过程数据到可交付结论")
    add_image(s, SHOT / "fig-5-7-findings.png", CX, 2.0, 5.8, 3.65, caption="发现与证据：严重度、CVSS、证据覆盖、敏感打码")
    add_image(s, SHOT / "fig-5-8-report.png", 6.85, 2.0, 5.75, 3.65, caption="分析报告：九部分、可打印/另存 PDF")
    add_rect(s, CX, 5.95, CW, 0.55, PANEL_2, BORDER)
    add_text(s, CX + 0.2, 6.05, CW - 0.4, 0.35,
             "报告信息、执行摘要、范围与授权、链路指标、阶段推进、关键路径、风险建议、ATT&CK 覆盖、证据清单、数据质量。",
             10.2, DIM)
    add_notes(prs.slides[-1], "发现与证据页支持筛选、导出和敏感打码；报告页把链路、指标、风险与证据组织成可交付文档。")

    # 算法细节
    s = new_slide(prs, "03 系统实现")
    kicker_title(s, "ALGORITHMS", "两个核心算法：确定性布局与关键路径", "复杂度可控，可单元测试，论文截图可复现")
    add_image(s, FIG / "fig-4-4-layout-flow.png", CX, 1.95, 5.7, 3.56, caption="阶段约束分层布局流程")
    add_image(s, FIG / "fig-4-5-critical-path.png", 6.95, 1.95, 5.63, 3.56, caption="风险加权关键路径 DP")
    add_rect(s, CX, 5.72, CW, 0.72, PANEL_2, BORDER)
    add_text(s, CX + 0.2, 5.82, CW - 0.4, 0.55,
             "布局 O(k(|V|+|E|))，k=4；力导向 300 次固定迭代；关键路径 O(V+E)。260 节点实测布局 5.3 ms、关键路径 4 节点 / 36.3 分。",
             10.2, DIM)
    add_notes(prs.slides[-1], "两个算法都追求确定性：布局不使用随机数，关键路径用 DAG 上的 DP；复杂度都是线性或近线性。")

    # 数据与可复现
    s = new_slide(prs, "04 测试与实验")
    kicker_title(s, "DATA & REPRODUCIBILITY", "三份仿真数据：规模递增、固定种子、可字节复现", "覆盖 7 阶段、8 个 ATT&CK 战术、11 种关系")
    rows = [
        ["campus-lab", "150", "66", "51", "25", "5", "181 min"],
        ["corp-ad", "450", "180", "150", "105", "12", "366 min"],
        ["cloud-k8s", "900", "260", "320", "300", "17", "573 min"],
    ]
    add_table(s, CX, 2.05, 8.6, 1.65, ["场景", "记录", "节点", "关系", "事件", "证据", "时长"],
              rows, col_widths=[2.1, 1.0, 1.0, 1.0, 1.0, 1.0, 1.5], font_size=10.5, row_height=0.38)
    add_bullets(s, CX, 3.95, 5.6, 2.4, [
        "固定 seed + 固定时间基点：同一版本重复生成字节一致（SHA256 相同）",
        "三场景均通过 JSON Schema 与独立语义校验：0 error / 0 warning",
        "目标仅使用私网 / 回环 / .test；凭据值全部 [REDACTED]",
        "数据可导入：支持外部 JSONL/JSON，坏行跳过并统计",
    ], size=10.5, space=7)
    add_image(s, FIG / "fig-6-2-scale.png", 6.55, 3.85, 6.05, 2.85, caption="规模—耗时曲线：近似线性")
    add_notes(prs.slides[-1], "三份数据规模递增，但都由固定种子生成，因此结果可复现；它们既是演示数据，也是性能实验数据。")

    # 测试结果
    s = new_slide(prs, "04 测试与实验")
    kicker_title(s, "TESTING", "测试结果：140 项单元测试 + 31 项端到端检查全部通过", "契约、单元、端到端、容错、性能五类验证")
    metrics = [
        ("88", "插件单元测试", "schema/脱敏/scope/store/仿真", CYAN),
        ("52", "前端单元测试", "解析/指标/布局/回放/路由", VIOLET),
        ("31/31", "端到端检查", "三场景 · 六视图 · 深链", AMBER),
        ("0", "未捕获异常", "全页面运行", GREEN),
    ]
    for i, (v, l, sub, c) in enumerate(metrics):
        x = CX + i * 2.98
        add_rect(s, x, 1.95, 2.78, 1.65, PANEL, BORDER)
        add_rect(s, x, 1.95, 2.78, 0.05, c, radius=False)
        add_text(s, x + 0.18, 2.1, 2.4, 0.55, v, 27, c, bold=True, font=FONT_NUM)
        add_text(s, x + 0.18, 2.73, 2.4, 0.28, l, 11.5, TEXT, bold=True)
        add_text(s, x + 0.18, 3.05, 2.4, 0.5, sub, 8.8, DIM, line_spacing=1.2)
    add_table(s, CX, 3.95, 7.4, 2.3, ["测试类别", "覆盖内容", "结果"], [
        ["契约校验", "三场景 + 非法样例（坏 JSON/重复 id/孤儿边）", "0 error / 0 warning"],
        ["单元测试", "插件 8 文件 + 前端 6 文件", "140 / 140"],
        ["端到端", "三场景、六视图、深链、1366×768", "31 / 31"],
        ["容错导入", "1 坏行 + 4 错误 + 2 警告仍可载入", "通过"],
    ], col_widths=[2.0, 3.8, 1.6], font_size=9.8, row_height=0.4)
    add_image(s, SHOT / "fig-6-3-import-error.png", 8.45, 3.95, 4.15, 2.55, caption="非法数据导入：错误明细与容错")
    add_notes(prs.slides[-1], "测试分五类：契约、单元、端到端、容错和性能；140 项单测与 31 项 E2E 全部通过，页面无未捕获异常。")

    # 性能
    s = new_slide(prs, "04 测试与实验")
    kicker_title(s, "PERFORMANCE", "性能实验：260 节点场景管线 23.3 ms、首屏 80 ms", "显著低于 1 s 设计目标；渲染是主要开销")
    add_image(s, FIG / "fig-6-1-perf.png", CX, 1.95, 7.75, 4.45, caption="三场景解析、布局与渲染耗时")
    rows = [
        ["campus-lab", "66/51", "1.0", "2.3", "4.3", "7.7", "72", "2.69"],
        ["corp-ad", "180/150", "3.0", "5.3", "11.5", "19.2", "101", "3.76"],
        ["cloud-k8s", "260/320", "3.6", "5.3", "14.5", "23.3", "80", "5.23"],
    ]
    add_table(s, 8.55, 1.98, 3.98, 2.35, ["场景", "节点/关系", "解析", "布局", "渲染", "合计", "首屏", "堆"],
              rows, col_widths=[0.86, 0.72, 0.46, 0.46, 0.46, 0.46, 0.44, 0.44], font_size=7.4, header_size=7.2, row_height=0.5)
    add_rect(s, 8.55, 4.62, 3.98, 1.95, PANEL, BORDER)
    add_text(s, 8.75, 4.75, 3.6, 0.3, "结论", 12, GREEN, bold=True)
    add_bullets(s, 8.75, 5.1, 3.6, 1.35, [
        "管线 23.3 ms、首屏 80 ms，均远低于 1 s",
        "布局随规模近似线性（2.3→5.3→5.3 ms）",
        "渲染占 62%，是后续优化重点",
    ], size=8.9, space=4)
    add_notes(prs.slides[-1], "最大场景 260 节点、320 条关系，管线 23.3 毫秒、首屏 80 毫秒，远低于 1 秒目标；渲染是主要开销。")

    # 创新点
    s = new_slide(prs, "05 创新与展望")
    kicker_title(s, "CONTRIBUTIONS", "本文的主要工作与创新点", "工程改进为主，不夸大算法创新")
    items = [
        ("01", "过程导向的数据契约", "六类记录 + 事件溯源 + 双层语义 + 三级校验，使结构、时间与证据共存于一份文本。", CYAN),
        ("02", "阶段语义进入布局", "阶段作为硬约束分列，重心排序 + 轻量力松弛；确定性算法保证截图与测试可复现。", VIOLET),
        ("03", "零依赖离线可视分析", "自绘 SVG、六视图联动、深链复现，适配隔离网络与投影演示环境。", AMBER),
        ("04", "安全边界内建采集端", "授权、scope、脱敏在记录时完成；插件只记录、不攻击，样例全仿真。", GREEN),
    ]
    for i, (n, t, b, c) in enumerate(items):
        col, row = i % 2, i // 2
        x = CX + col * 5.95
        y = 2.0 + row * 2.15
        add_rect(s, x, y, 5.72, 1.95, PANEL, BORDER)
        add_rect(s, x, y, 0.06, 1.95, c, radius=False)
        add_text(s, x + 0.25, y + 0.18, 0.6, 0.3, n, 13, c, bold=True, font=FONT_NUM)
        add_text(s, x + 0.9, y + 0.17, 4.5, 0.35, t, 14.5, TEXT, bold=True)
        add_text(s, x + 0.9, y + 0.65, 4.55, 1.1, b, 10, DIM, line_spacing=1.35)
    add_notes(prs.slides[-1], "创新点集中在数据契约、布局方法和工程形态，属于工程与设计层面的改进；不宣称提出了新的攻击图理论。")

    # 总结展望
    s = new_slide(prs, "05 创新与展望")
    kicker_title(s, "SUMMARY & FUTURE", "总结与展望", "已完成闭环，仍有可扩展空间")
    add_rect(s, CX, 1.95, 5.75, 4.25, PANEL, BORDER)
    add_text(s, CX + 0.25, 2.1, 3.0, 0.3, "工作总结", 13, CYAN, bold=True)
    add_bullets(s, CX + 0.25, 2.52, 5.25, 3.4, [
        "完成可运行插件 + 零依赖可视化系统，形成“采集—校验—可视化—报告”闭环",
        "三场景数据可复现，契约、单测、E2E、性能五类验证通过",
        "260 节点场景管线 23.3 ms、首屏 80 ms，达到设计目标",
        "形成论文、开题报告、答辩 PPT 与演示材料",
    ], size=10.8, space=12)
    add_rect(s, 6.75, 1.95, 5.85, 4.25, PANEL, BORDER)
    add_text(s, 7.0, 2.1, 3.0, 0.3, "不足与展望", 13, AMBER, bold=True)
    add_bullets(s, 7.0, 2.52, 5.3, 3.4, [
        "数据来源单一：后续可对接更多宿主/工具的事件流",
        "缺少协作与持久化：可增加只读服务、增量同步与版本",
        "大规模可扩展性：虚拟化渲染、Canvas/WebGL、分层聚合",
        "ATT&CK 映射依赖人工标注：可引入规则/模型辅助映射",
    ], size=10.8, space=12)
    add_notes(prs.slides[-1], "总结：完成了闭环与验证；不足是数据来源、协作、大图性能和语义标注，后续有明确改进方向。")

    # 致谢
    s = new_slide(prs, "", False)
    add_rect(s, CX, 1.45, 0.09, 3.2, CYAN, radius=False)
    add_text(s, CX + 0.4, 1.4, 9.5, 0.4, "THANK YOU", 13, CYAN, bold=True)
    add_text(s, CX + 0.4, 1.85, 10.5, 0.8, "感谢各位老师批评指正", 34, TEXT, bold=True)
    add_text(s, CX + 0.42, 2.85, 9.5, 0.5, "ChainLens · DSH 插件 dsh-pentest 探索链路数据可视化工具", 13, DIM)
    add_text(s, CX + 0.42, 4.1, 8.0, 0.35, f"{AUTHOR} · {MAJOR} · {SID}", 12, FAINT)
    add_text(s, CX + 0.42, 4.45, 8.0, 0.35, f"{SCHOOL} 工学部 · 2027 年 6 月", 11, FAINT)
    add_notes(prs.slides[-1], "我的答辩到此结束，感谢各位老师，请批评指正。")

    out = ROOT / "thesis" / "毕业答辩PPT.pptx"
    prs.save(out)
    print("written", out, "slides:", len(prs.slides))


if __name__ == "__main__":
    build_proposal()
    build_defense()
