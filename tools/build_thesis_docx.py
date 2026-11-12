#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_thesis_docx.py — 将 thesis/source/*.md 合成符合本科毕业论文排版习惯的 .docx

用法：
    python tools/build_thesis_docx.py [--out thesis/xxx.docx] [--no-write]

生成结构：
    封面 → 摘要 → Abstract → 目录（Word TOC 域）→ 第1-7章 → 参考文献 → 致谢 → 附录

约定（见 thesis/source/00-论文大纲.md）：
    ## → 一级标题（章）  ### → 二级  #### → 三级
    Markdown 管道表 → 三线表；![图题](figures/xx.png) → 图片 + 图题
    `表 x-y ...` 独占一行且后接表格 → 表题
    正文 [n] 引用 → 上标；`代码` → 等宽字体；**强调** → 加粗

依赖：python-docx、Pillow（均已安装）
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor, Emu
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "thesis" / "source"
FIG = ROOT / "thesis" / "figures"
DEFAULT_OUT = ROOT / "thesis" / "DSH插件dsh-pentest的探索链路数据可视化工具的设计与实现.docx"

SONG = "宋体"
HEI = "黑体"
KAI = "楷体"
TIMES = "Times New Roman"
CONSOLE = "Consolas"
BODY_PT = 12  # 小四
CAPTION_PT = 10.5  # 五号

TOC_MODE = "auto"  # auto：有 toc-entries.json 时用静态目录；field：Word 域；static：强制静态
TOC_JSON = None  # 在 build() 中赋值

warnings: list[str] = []
stats = {"paragraphs": 0, "tables": 0, "figures": 0, "headings": 0, "chinese_chars": 0}

# ----------------------------------------------------------------------------
# 底层辅助
# ----------------------------------------------------------------------------

def set_run_font(run, east=SONG, ascii_font=TIMES, size=BODY_PT, bold=None, color=None, italic=None):
    run.font.name = ascii_font
    run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    if color is not None:
        run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:ascii"), ascii_font)
    rFonts.set(qn("w:hAnsi"), ascii_font)
    rFonts.set(qn("w:eastAsia"), east)


def set_style_font(style, east=SONG, ascii_font=TIMES, size=BODY_PT, bold=None, color=None):
    style.font.name = ascii_font
    style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    if color is not None:
        style.font.color.rgb = color
    rPr = style.element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:ascii"), ascii_font)
    rFonts.set(qn("w:hAnsi"), ascii_font)
    rFonts.set(qn("w:eastAsia"), east)


def set_first_line_chars(paragraph, chars=2, fallback_pt=None):
    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    ind.set(qn("w:firstLineChars"), str(chars * 100))
    if fallback_pt:
        ind.set(qn("w:firstLine"), str(int(fallback_pt * 20)))


def no_first_line(paragraph):
    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    ind.set(qn("w:firstLineChars"), "0")
    ind.set(qn("w:firstLine"), "0")


def add_page_number_footer(section):
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    no_first_line(p)
    run = p.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    txt = OxmlElement("w:t")
    txt.text = "1"
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_sep)
    run._r.append(txt)
    run._r.append(fld_end)
    set_run_font(run, size=9)


def add_header_text(section, text):
    header = section.header
    header.is_linked_to_previous = False
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    no_first_line(p)
    run = p.add_run(text)
    set_run_font(run, size=9)
    # 页眉下边框
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "4")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "808080")
    pBdr.append(bottom)
    pPr.append(pBdr)


def set_page_number_format(section, fmt="decimal", start=1):
    sectPr = section._sectPr
    pgNumType = sectPr.find(qn("w:pgNumType"))
    if pgNumType is None:
        pgNumType = OxmlElement("w:pgNumType")
        sectPr.append(pgNumType)
    pgNumType.set(qn("w:fmt"), fmt)
    pgNumType.set(qn("w:start"), str(start))


def add_toc_field(paragraph):
    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = ' TOC \\o "1-3" \\h \\z \\u '
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    placeholder = OxmlElement("w:t")
    placeholder.text = "（目录为 Word 域，首次打开请全选后按 F9 更新；或右键“更新域”）"
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_sep)
    run._r.append(placeholder)
    run._r.append(fld_end)
    set_run_font(run, size=10.5)


def add_static_toc(doc, toc):
    """用 PDF 书签提取的章/节页码生成静态目录（避免依赖打开文档后手动更新域）。"""
    entries = toc.get("entries", [])
    if not entries:
        return False
    for entry in entries:
        title = str(entry.get("title", "")).strip()
        page = str(entry.get("page", "")).strip()
        level = int(entry.get("level", 0))
        p = doc.add_paragraph(style="Normal")
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        no_first_line(p)
        p.paragraph_format.line_spacing = 1.25
        p.paragraph_format.space_before = Pt(2 if level == 0 else 0)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.left_indent = Cm(0 if level == 0 else 0.74)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(15.4), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
        run = p.add_run(title)
        set_run_font(run, east=HEI if level == 0 else SONG, size=12 if level == 0 else 10.5, bold=(level == 0))
        run = p.add_run("\t" + page)
        set_run_font(run, east=SONG, size=12 if level == 0 else 10.5)
    return True


def set_update_fields(doc):
    settings = doc.settings.element
    update = settings.find(qn("w:updateFields"))
    if update is None:
        update = OxmlElement("w:updateFields")
        settings.append(update)
    update.set(qn("w:val"), "true")


def set_table_three_line(table):
    tbl = table._tbl
    tblPr = tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "bottom"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "12")  # 1.5pt
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), "000000")
        borders.append(el)
    for edge in ("left", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "nil")
        borders.append(el)
    tblPr.append(borders)
    # 表头行下边框
    if len(table.rows) > 0:
        for cell in table.rows[0].cells:
            tcPr = cell._tc.get_or_add_tcPr()
            tcBorders = OxmlElement("w:tcBorders")
            bottom = OxmlElement("w:bottom")
            bottom.set(qn("w:val"), "single")
            bottom.set(qn("w:sz"), "8")
            bottom.set(qn("w:space"), "0")
            bottom.set(qn("w:color"), "000000")
            tcBorders.append(bottom)
            tcPr.append(tcBorders)
    # 表头跨页重复
    trPr = table.rows[0]._tr.get_or_add_trPr()
    tblHeader = OxmlElement("w:tblHeader")
    tblHeader.set(qn("w:val"), "true")
    trPr.append(tblHeader)
    # 单元格内边距
    tblCellMar = OxmlElement("w:tblCellMar")
    for side, w in (("top", 60), ("left", 100), ("bottom", 60), ("right", 100)):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:w"), str(w))
        el.set(qn("w:type"), "dxa")
        tblCellMar.append(el)
    tblPr.append(tblCellMar)


# ----------------------------------------------------------------------------
# 行内解析
# ----------------------------------------------------------------------------

CITE_RE = re.compile(r"(\[\d+(?:[-,，]\d+)*\])")
CODE_RE = re.compile(r"`([^`]+)`")
BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")


def add_inline_runs(paragraph, text, size=BODY_PT, east=SONG, bold=False):
    """处理 `代码`、**加粗**、[n] 引用上标。按顺序切分，保持嵌套尽量简单。"""
    pos = 0
    # 先按代码片段切分
    parts = []
    for m in CODE_RE.finditer(text):
        if m.start() > pos:
            parts.append(("text", text[pos:m.start()]))
        parts.append(("code", m.group(1)))
        pos = m.end()
    if pos < len(text):
        parts.append(("text", text[pos:]))
    for kind, chunk in parts:
        if kind == "code":
            run = paragraph.add_run(chunk)
            set_run_font(run, east=SONG, ascii_font=CONSOLE, size=size - 1)
            continue
        # 文本：先切加粗
        bpos = 0
        for bm in BOLD_RE.finditer(chunk):
            _add_citation_runs(paragraph, chunk[bpos:bm.start()], size, east, bold)
            _add_citation_runs(paragraph, bm.group(1), size, east, True)
            bpos = bm.end()
        if bpos < len(chunk):
            _add_citation_runs(paragraph, chunk[bpos:], size, east, bold)


def _add_citation_runs(paragraph, text, size, east, bold):
    pos = 0
    for m in CITE_RE.finditer(text):
        if m.start() > pos:
            run = paragraph.add_run(text[pos:m.start()])
            set_run_font(run, east=east, size=size, bold=bold)
        run = paragraph.add_run(m.group(1))
        set_run_font(run, east=east, size=size, bold=bold)
        run.font.superscript = True
        pos = m.end()
    if pos < len(text):
        run = paragraph.add_run(text[pos:])
        set_run_font(run, east=east, size=size, bold=bold)


# ----------------------------------------------------------------------------
# Markdown → docx
# ----------------------------------------------------------------------------

def add_body_paragraph(doc, text, indent=True):
    p = doc.add_paragraph(style="Normal")
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.line_spacing = 1.5
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    if indent:
        set_first_line_chars(p, 2, BODY_PT)
    add_inline_runs(p, text.strip())
    stats["paragraphs"] += 1
    return p


def add_caption(doc, text, kind="figure"):
    p = doc.add_paragraph(style="Normal")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    no_first_line(p)
    p.paragraph_format.space_before = Pt(6 if kind == "figure" else 12)
    p.paragraph_format.space_after = Pt(12 if kind == "figure" else 6)
    p.paragraph_format.line_spacing = 1.15
    run = p.add_run(text.strip())
    set_run_font(run, east=SONG, size=CAPTION_PT, bold=(kind == "table"))
    return p


def is_caption_line(text):
    return bool(re.match(r"^\s*(图|表)\s*\d+[-–]\d+", text))


def add_image(doc, alt, path, width_cm=None):
    img_path = (FIG.parent / path).resolve() if not Path(path).is_absolute() else Path(path)
    if not img_path.exists():
        # 尝试 thesis/figures 下按文件名查找
        cand = FIG / Path(path).name
        if cand.exists():
            img_path = cand
    if not img_path.exists():
        warnings.append(f"缺少图片：{path}")
        p = doc.add_paragraph(style="Normal")
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(f"［图片缺失：{path}］")
        set_run_font(run, size=CAPTION_PT)
        if alt and alt.strip():
            add_caption(doc, alt)
        return
    try:
        with Image.open(img_path) as im:
            w, h = im.size
    except Exception:
        w, h = 1600, 900
    default_w = 14.0
    if w / max(h, 1) > 2.2:
        default_w = 15.0
    if w / max(h, 1) < 0.9:
        default_w = 10.0
    width = Cm(width_cm or default_w)
    p = doc.add_paragraph(style="Normal")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    no_first_line(p)
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run()
    run.add_picture(str(img_path), width=width)
    stats["figures"] += 1
    if alt and alt.strip() and not re.match(r"^(图|表)", alt.strip()):
        alt = f"图 {alt.strip()}"
    if alt and alt.strip():
        add_caption(doc, alt)
    else:
        warnings.append(f"图片无图题：{path}")


def add_table(doc, rows):
    if len(rows) < 2:
        return
    header = rows[0]
    body = [r for r in rows[1:] if not re.match(r"^\s*\|?\s*:?-{2,}", "|".join(r))]
    ncols = max(len(header), max((len(r) for r in body), default=0))
    table = doc.add_table(rows=1 + len(body), cols=ncols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    try:
        table.style = doc.styles["Table Grid"]
    except Exception:
        pass
    for j in range(ncols):
        cell = table.rows[0].cells[j]
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        no_first_line(p)
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(2)
        txt = header[j].strip() if j < len(header) else ""
        add_inline_runs(p, txt, size=CAPTION_PT, bold=True)
    for i, r in enumerate(body, start=1):
        for j in range(ncols):
            cell = table.rows[i].cells[j]
            cell.text = ""
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT if j == 0 else WD_ALIGN_PARAGRAPH.CENTER
            no_first_line(p)
            p.paragraph_format.line_spacing = 1.0
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            txt = r[j].strip() if j < len(r) else ""
            add_inline_runs(p, txt, size=CAPTION_PT)
            if txt:
                stats["chinese_chars"] += len(re.findall(r"[\u4e00-\u9fff]", txt))
    set_table_three_line(table)
    stats["tables"] += 1
    # 表后留白
    p = doc.add_paragraph(style="Normal")
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.0


def parse_table(lines, start):
    rows = []
    i = start
    while i < len(lines) and lines[i].strip().startswith("|"):
        line = lines[i].strip()
        cells = [c.strip() for c in line.strip("|").split("|")]
        rows.append(cells)
        i += 1
    # 去掉分隔行
    if len(rows) >= 2 and all(re.match(r"^:?-{2,}:?$", c) for c in rows[1] if c):
        rows = [rows[0]] + rows[2:]
    return rows, i


def process_markdown(doc, md_text, chapter_mode=True):
    lines = md_text.splitlines()
    i = 0
    first_heading_seen = False
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        if stripped.startswith("```"):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1
            p = doc.add_paragraph(style="Normal")
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            no_first_line(p)
            p.paragraph_format.line_spacing = 1.0
            p.paragraph_format.left_indent = Cm(0.5)
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(4)
            run = p.add_run("\n".join(code_lines))
            set_run_font(run, east=SONG, ascii_font=CONSOLE, size=9)
            continue
        if stripped.startswith("|"):
            rows, i = parse_table(lines, i)
            add_table(doc, rows)
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 2:
                p = doc.add_paragraph(style="Heading 1")
                p.add_run(text)
                p.paragraph_format.page_break_before = True
                stats["headings"] += 1
            elif level == 3:
                p = doc.add_paragraph(style="Heading 2")
                p.add_run(text)
                stats["headings"] += 1
            elif level == 4:
                p = doc.add_paragraph(style="Heading 3")
                p.add_run(text)
                stats["headings"] += 1
            else:
                # # 一级标题在正文中不常见，按章标题处理
                p = doc.add_paragraph(style="Heading 1")
                p.add_run(text)
                stats["headings"] += 1
            stats["chinese_chars"] += len(re.findall(r"[\u4e00-\u9fff]", text))
            first_heading_seen = True
            i += 1
            continue
        m = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)(?:\{width=([\d.]+)(?:cm)?\})?\s*$", stripped)
        if m:
            alt, path, width = m.group(1), m.group(2), m.group(3)
            # 论文约定：图片下一行是编号图题（如“图 5-3 ...”），优先用图题并跳过该行，避免重复
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and is_caption_line(lines[j]):
                alt = lines[j].strip()
                i = j + 1
            else:
                i += 1
            add_image(doc, alt, path, float(width) if width else None)
            continue
        if is_caption_line(stripped):
            add_caption(doc, stripped, kind="table" if stripped.startswith("表") else "figure")
            i += 1
            continue
        if stripped.startswith(">"):
            p = doc.add_paragraph(style="Normal")
            p.paragraph_format.line_spacing = 1.5
            p.paragraph_format.left_indent = Cm(0.74)
            p.paragraph_format.right_indent = Cm(0.74)
            no_first_line(p)
            add_inline_runs(p, stripped.lstrip("> ").strip(), size=10.5, east=KAI)
            i += 1
            continue
        if re.match(r"^[-*]\s+", stripped):
            p = doc.add_paragraph(style="Normal")
            p.paragraph_format.line_spacing = 1.5
            p.paragraph_format.left_indent = Cm(0.74)
            no_first_line(p)
            run = p.add_run("• ")
            set_run_font(run)
            add_inline_runs(p, re.sub(r"^[-*]\s+", "", stripped))
            i += 1
            continue
        if re.match(r"^\d+\.\s+", stripped):
            p = doc.add_paragraph(style="Normal")
            p.paragraph_format.line_spacing = 1.5
            p.paragraph_format.left_indent = Cm(0.74)
            no_first_line(p)
            add_inline_runs(p, stripped)
            i += 1
            continue
        if re.match(r"^\s*[-*_]{3,}\s*$", stripped) or stripped.startswith("<!--"):
            i += 1
            continue
        # 普通段落
        add_body_paragraph(doc, stripped)
        stats["chinese_chars"] += len(re.findall(r"[\u4e00-\u9fff]", stripped))
        i += 1


# ----------------------------------------------------------------------------
# 封面、摘要、目录、参考文献、致谢
# ----------------------------------------------------------------------------

def add_cover(doc):
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.0)
    section.right_margin = Cm(2.5)
    section.header_distance = Cm(1.5)
    section.footer_distance = Cm(1.75)

    for _ in range(2):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("黄河科技学院")
    set_run_font(r, east=HEI, size=26, bold=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("本科毕业设计（论文）")
    set_run_font(r, east=HEI, size=22, bold=True)
    for _ in range(2):
        doc.add_paragraph()

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.line_spacing = 1.5
    r = p.add_run("DSH 插件 dsh-pentest 的探索链路数据")
    set_run_font(r, east=HEI, size=20, bold=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.line_spacing = 1.5
    r = p.add_run("可视化工具的设计与实现")
    set_run_font(r, east=HEI, size=20, bold=True)

    for _ in range(3):
        doc.add_paragraph()

    info = [
        ("学    院", "工学部"),
        ("专    业", "网络工程"),
        ("班    级", "＿＿＿＿＿＿＿＿"),
        ("学生姓名", "孙博奥"),
        ("学    号", "2301144050"),
        ("指导教师", "＿＿＿＿＿＿＿＿"),
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
        p0 = c0.paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r0 = p0.add_run(label + "：")
        set_run_font(r0, east=HEI, size=14)
        p1 = c1.paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r1 = p1.add_run(value)
        set_run_font(r1, east=SONG, size=14)
        # 下划线
        tcPr = c1._tc.get_or_add_tcPr()
        tcBorders = OxmlElement("w:tcBorders")
        bottom = OxmlElement("w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), "6")
        bottom.set(qn("w:space"), "0")
        bottom.set(qn("w:color"), "000000")
        tcBorders.append(bottom)
        tcPr.append(tcBorders)

    for _ in range(4):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("二〇二七年六月")
    set_run_font(r, east=HEI, size=14)


def add_front_matter(doc, path, fallback_title):
    if path.exists():
        text = path.read_text(encoding="utf-8")
        process_markdown(doc, text)
    else:
        warnings.append(f"缺少前置文件：{path.name}")
        p = doc.add_paragraph(style="Heading 1")
        p.add_run(fallback_title)
        p2 = doc.add_paragraph(style="Normal")
        p2.add_run("（待补）")
    # 摘要后分页
    doc.add_paragraph().add_run().add_break()


def add_references(doc, path):
    p = doc.add_paragraph(style="Heading 1")
    p.add_run("参考文献")
    stats["headings"] += 1
    if not path.exists():
        warnings.append("缺少参考文献.md")
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not re.match(r"^\[\d+\]", s):
            continue
        para = doc.add_paragraph(style="Normal")
        para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        para.paragraph_format.line_spacing = 1.25
        para.paragraph_format.left_indent = Cm(0.85)
        para.paragraph_format.first_line_indent = Cm(-0.85)
        para.paragraph_format.space_before = Pt(0)
        para.paragraph_format.space_after = Pt(3)
        add_inline_runs(para, s, size=CAPTION_PT)


def add_back_matter(doc, path, title):
    p = doc.add_paragraph(style="Heading 1")
    p.add_run(title)
    stats["headings"] += 1
    if not path.exists():
        warnings.append(f"缺少{title}文件：{path.name}")
        p2 = doc.add_paragraph(style="Normal")
        p2.add_run("（待补）")
        return
    text = path.read_text(encoding="utf-8")
    # 去掉文件内同名标题行
    lines = [ln for ln in text.splitlines() if not re.match(r"^#{1,4}\s*" + re.escape(title), ln.strip())]
    process_markdown(doc, "\n".join(lines))


def build(out_path: Path):
    global TOC_JSON
    TOC_JSON = SRC / "toc-entries.json"
    doc = Document()

    # ---------- 页面与样式 ----------
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.0)
    section.right_margin = Cm(2.5)

    normal = doc.styles["Normal"]
    set_style_font(normal, east=SONG, ascii_font=TIMES, size=BODY_PT)
    normal.paragraph_format.line_spacing = 1.5
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    h1 = doc.styles["Heading 1"]
    set_style_font(h1, east=HEI, ascii_font=TIMES, size=16, bold=True, color=RGBColor(0, 0, 0))
    h1.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    h1.paragraph_format.space_before = Pt(12)
    h1.paragraph_format.space_after = Pt(18)
    h1.paragraph_format.line_spacing = 1.5
    h1.paragraph_format.page_break_before = True

    h2 = doc.styles["Heading 2"]
    set_style_font(h2, east=HEI, ascii_font=TIMES, size=14, bold=True, color=RGBColor(0, 0, 0))
    h2.paragraph_format.space_before = Pt(12)
    h2.paragraph_format.space_after = Pt(6)
    h2.paragraph_format.line_spacing = 1.5

    h3 = doc.styles["Heading 3"]
    set_style_font(h3, east=HEI, ascii_font=TIMES, size=BODY_PT, bold=True, color=RGBColor(0, 0, 0))
    h3.paragraph_format.space_before = Pt(6)
    h3.paragraph_format.space_after = Pt(3)
    h3.paragraph_format.line_spacing = 1.5

    # ---------- 封面 ----------
    add_cover(doc)

    # ---------- 前置部分（罗马页码） ----------
    front_section = doc.add_section(WD_SECTION.NEW_PAGE)
    set_page_number_format(front_section, "lowerRoman", 1)
    add_page_number_footer(front_section)

    add_front_matter(doc, SRC / "04-摘要.md", "摘 要")
    add_front_matter(doc, SRC / "05-Abstract.md", "Abstract")

    # 目录
    p = doc.add_paragraph(style="Normal")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    no_first_line(p)
    p.paragraph_format.page_break_before = True
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(18)
    run = p.add_run("目 录")
    set_run_font(run, east=HEI, size=16, bold=True)
    used_static_toc = False
    if TOC_MODE != "field" and TOC_JSON and TOC_JSON.exists():
        try:
            toc_data = json.loads(TOC_JSON.read_text(encoding="utf-8"))
            used_static_toc = add_static_toc(doc, toc_data)
        except Exception as exc:  # 目录数据损坏时降级到 Word 域
            warnings.append(f"静态目录生成失败，降级为 Word 域：{exc}")
    if not used_static_toc:
        toc_p = doc.add_paragraph(style="Normal")
        toc_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        no_first_line(toc_p)
        add_toc_field(toc_p)
    doc.add_paragraph().add_run().add_break()

    # ---------- 正文（阿拉伯页码从 1 开始） ----------
    main_section = doc.add_section(WD_SECTION.NEW_PAGE)
    set_page_number_format(main_section, "decimal", 1)
    add_page_number_footer(main_section)
    add_header_text(main_section, "黄河科技学院本科毕业设计（论文）")

    chapter_files = [p for p in sorted(SRC.glob("0[1-7]-*.md")) if p.name not in ("04-摘要.md", "05-Abstract.md")]
    if not chapter_files:
        warnings.append("未找到章节文件（0[1-7]-*.md）")
    for idx, path in enumerate(chapter_files):
        text = path.read_text(encoding="utf-8")
        process_markdown(doc, text)

    # ---------- 后置部分 ----------
    add_references(doc, SRC / "参考文献.md")
    add_back_matter(doc, SRC / "致谢.md", "致谢")
    add_back_matter(doc, SRC / "附录.md", "附录")

    # ---------- 检查 ----------
    all_text = "\n".join(p.text for p in doc.paragraphs)
    for mark in ("待补", "TODO", "T0DO"):
        if mark in all_text:
            warnings.append(f"正文仍包含占位标记 {mark}，定稿前需替换")

    set_update_fields(doc) if not used_static_toc else None
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_path))
    report = {
        "output": str(out_path),
        "stats": stats,
        "warnings": warnings,
        "chapters": [p.name for p in chapter_files],
    }
    (out_path.parent / "build-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    out = DEFAULT_OUT
    if "--out" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--out") + 1]).resolve()
    if "--toc" in sys.argv:
        TOC_MODE = sys.argv[sys.argv.index("--toc") + 1]
    build(out)
