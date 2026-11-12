#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成本科毕业设计开题报告 docx（复用论文排版助手）。

输入：proposal/source/开题报告.md
输出：proposal/开题报告.docx / proposal/开题报告.pdf（PDF 由 LibreOfficeKit 另行转换）

运行：python tools/build_proposal_docx.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from docx import Document  # noqa: E402
from docx.enum.section import WD_SECTION  # noqa: E402
from docx.enum.table import WD_TABLE_ALIGNMENT  # noqa: E402
from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: E402
from docx.shared import Cm, Pt, RGBColor  # noqa: E402

import build_thesis_docx as bt  # noqa: E402

SRC = ROOT / "proposal" / "source" / "开题报告.md"
OUT = ROOT / "proposal" / "开题报告.docx"

TITLE = "DSH 插件 dsh-pentest 的探索链路数据可视化工具的设计与实现"
AUTHOR = "孙博奥"
SID = "2301144050"
MAJOR = "网络工程"
SCHOOL = "黄河科技学院"
COLLEGE = "（待填写）"
ADVISOR = "（待填写）"
DATE_TEXT = "二〇二六年十一月"


def set_cell_text(cell, text, size=12, bold=False, east=bt.SONG, align=WD_ALIGN_PARAGRAPH.LEFT,
                  color=RGBColor(0, 0, 0)):
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.line_spacing = 1.5
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    bt.no_first_line(p)
    r = p.add_run(text)
    bt.set_run_font(r, east=east, size=size, bold=bold, color=color)


def add_cover(doc):
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.0)
    section.right_margin = Cm(2.5)

    for _ in range(2):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(SCHOOL)
    bt.set_run_font(r, east=bt.HEI, size=26, bold=True)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("本科毕业设计（论文）开题报告")
    bt.set_run_font(r, east=bt.HEI, size=24, bold=True)

    for _ in range(2):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.line_spacing = 1.4
    r = p.add_run(TITLE)
    bt.set_run_font(r, east=bt.HEI, size=18, bold=True)

    for _ in range(3):
        doc.add_paragraph()

    info = [
        ("学    院", COLLEGE),
        ("专    业", MAJOR),
        ("班    级", " "),
        ("学生姓名", AUTHOR),
        ("学    号", SID),
        ("指导教师", ADVISOR),
    ]
    table = doc.add_table(rows=len(info), cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.columns[0].width = Cm(4.2)
    table.columns[1].width = Cm(7.8)
    for row_idx, (label, value) in enumerate(info):
        c0, c1 = table.rows[row_idx].cells
        c0.width = Cm(4.2)
        c1.width = Cm(7.8)
        set_cell_text(c0, label + "：", 14, bold=False, east=bt.HEI, align=WD_ALIGN_PARAGRAPH.RIGHT)
        set_cell_text(c1, value, 14, east=bt.SONG, align=WD_ALIGN_PARAGRAPH.CENTER)
        tcPr = c1._tc.get_or_add_tcPr()
        tcBorders = bt.OxmlElement("w:tcBorders")
        bottom = bt.OxmlElement("w:bottom")
        bottom.set(bt.qn("w:val"), "single")
        bottom.set(bt.qn("w:sz"), "6")
        bottom.set(bt.qn("w:space"), "0")
        bottom.set(bt.qn("w:color"), "000000")
        tcBorders.append(bottom)
        tcPr.append(tcBorders)

    for _ in range(4):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(DATE_TEXT)
    bt.set_run_font(r, east=bt.HEI, size=14)


def add_form_box(doc, title, height_cm, note_lines):
    p = doc.add_paragraph(style="Normal")
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    bt.no_first_line(p)
    r = p.add_run(title)
    bt.set_run_font(r, east=bt.HEI, size=12, bold=True)

    table = doc.add_table(rows=1, cols=1)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    cell.width = Cm(15.4)
    table.rows[0].height = Cm(height_cm)
    cell.text = ""
    p0 = cell.paragraphs[0]
    p0.paragraph_format.line_spacing = 1.5
    r0 = p0.add_run("（待填写）")
    bt.set_run_font(r0, east=bt.SONG, size=12, color=RGBColor(0x66, 0x66, 0x66))
    for line in note_lines:
        p1 = cell.add_paragraph()
        p1.paragraph_format.line_spacing = 1.5
        p1.paragraph_format.space_before = Pt(8)
        r1 = p1.add_run(line)
        bt.set_run_font(r1, east=bt.SONG, size=12)
    # 表格边框
    for row in table.rows:
        for c in row.cells:
            tcPr = c._tc.get_or_add_tcPr()
            tcBorders = bt.OxmlElement("w:tcBorders")
            for edge in ("top", "left", "bottom", "right"):
                el = bt.OxmlElement(f"w:{edge}")
                el.set(bt.qn("w:val"), "single")
                el.set(bt.qn("w:sz"), "6")
                el.set(bt.qn("w:space"), "0")
                el.set(bt.qn("w:color"), "000000")
                tcBorders.append(el)
            tcPr.append(tcBorders)
    return p


def main():
    text = SRC.read_text(encoding="utf-8")
    # 去掉标题行与课题基本信息表，封面单独生成
    idx = text.find("\n## ")
    if idx < 0:
        raise SystemExit("未找到正文第一个二级标题")
    body = text[idx:].strip()

    # 拆出参考文献与最后意见部分
    ref_idx = body.find("## 七、参考文献")
    sec8_idx = body.find("## 八、")
    if ref_idx < 0:
        raise SystemExit("未找到参考文献部分")
    head_body = body[:ref_idx].strip()
    ref_and_rest = body[ref_idx:]
    ref_block = ref_and_rest[: sec8_idx - ref_idx] if sec8_idx > 0 else ref_and_rest
    sec8_block = ref_and_rest[sec8_idx - ref_idx:] if sec8_idx > 0 else ""

    # 参考文献条目
    ref_lines = [ln.strip() for ln in ref_block.splitlines() if re.match(r"^\[\d+\]", ln.strip())]

    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.0)
    section.right_margin = Cm(2.5)

    normal = doc.styles["Normal"]
    bt.set_style_font(normal, east=bt.SONG, ascii_font=bt.TIMES, size=12)
    normal.paragraph_format.line_spacing = 1.5
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    h1 = doc.styles["Heading 1"]
    bt.set_style_font(h1, east=bt.HEI, ascii_font=bt.TIMES, size=16, bold=True, color=RGBColor(0, 0, 0))
    h1.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    h1.paragraph_format.space_before = Pt(16)
    h1.paragraph_format.space_after = Pt(10)
    h1.paragraph_format.line_spacing = 1.5
    h1.paragraph_format.page_break_before = False

    h2 = doc.styles["Heading 2"]
    bt.set_style_font(h2, east=bt.HEI, ascii_font=bt.TIMES, size=14, bold=True, color=RGBColor(0, 0, 0))
    h2.paragraph_format.space_before = Pt(10)
    h2.paragraph_format.space_after = Pt(6)
    h2.paragraph_format.line_spacing = 1.5

    h3 = doc.styles["Heading 3"]
    bt.set_style_font(h3, east=bt.HEI, ascii_font=bt.TIMES, size=12, bold=True, color=RGBColor(0, 0, 0))
    h3.paragraph_format.space_before = Pt(6)
    h3.paragraph_format.space_after = Pt(3)
    h3.paragraph_format.line_spacing = 1.5

    add_cover(doc)

    # 正文节：页眉页面
    body_section = doc.add_section(WD_SECTION.NEW_PAGE)
    body_section.page_width = Cm(21.0)
    body_section.page_height = Cm(29.7)
    body_section.top_margin = Cm(2.54)
    body_section.bottom_margin = Cm(2.54)
    body_section.left_margin = Cm(3.0)
    body_section.right_margin = Cm(2.5)
    bt.add_page_number_footer(body_section)
    bt.add_header_text(body_section, "黄河科技学院本科毕业设计（论文）开题报告")
    bt.set_page_number_format(body_section, "decimal", 1)

    bt.process_markdown(doc, head_body)

    # 七、参考文献
    p = doc.add_paragraph(style="Heading 1")
    p.add_run("七、参考文献")
    p.paragraph_format.page_break_before = False
    for line in ref_lines:
        para = doc.add_paragraph(style="Normal")
        para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        para.paragraph_format.line_spacing = 1.25
        para.paragraph_format.left_indent = Cm(0.85)
        para.paragraph_format.first_line_indent = Cm(-0.85)
        para.paragraph_format.space_before = Pt(0)
        para.paragraph_format.space_after = Pt(3)
        bt.add_inline_runs(para, line, size=10.5)

    # 八、意见
    p = doc.add_paragraph(style="Heading 1")
    p.add_run("八、指导教师意见与开题小组意见")
    p.paragraph_format.page_break_before = False
    add_form_box(doc, "8.1 指导教师意见", 4.8, [
        "指导教师（签字）：＿＿＿＿＿＿＿＿　　　　日期：＿＿＿＿年＿＿月＿＿日",
    ])
    p82 = add_form_box(doc, "8.2 开题小组意见", 6.4, [
        "开题小组组长（签字）：＿＿＿＿＿＿＿＿　　日期：＿＿＿＿年＿＿月＿＿日",
        "开题小组成员：＿＿＿＿＿＿　＿＿＿＿＿＿　＿＿＿＿＿＿　＿＿＿＿＿＿",
    ])
    p82.paragraph_format.page_break_before = True

    # 进度安排表：固定列宽，避免时间/任务列换行过多
    for table in doc.tables:
        if len(table.columns) == 4 and table.cell(0, 0).text.strip() == "时间":
            table.autofit = False
            widths = [Cm(4.0), Cm(3.2), Cm(5.2), Cm(3.0)]
            for i, w in enumerate(widths):
                table.columns[i].width = w
            for row in table.rows:
                for i, w in enumerate(widths):
                    row.cells[i].width = w
            tblPr = table._tbl.tblPr
            layout = bt.OxmlElement("w:tblLayout")
            layout.set(bt.qn("w:type"), "fixed")
            tblPr.append(layout)

    # 确保正文中 H1 不强制分页（import 的 process_markdown 会设置分页）
    for para in doc.paragraphs:
        if para.style.name == "Heading 1":
            para.paragraph_format.page_break_before = False

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print("written", OUT)
    print("paragraphs:", len(doc.paragraphs), "tables:", len(doc.tables), "sections:", len(doc.sections))


if __name__ == "__main__":
    main()
