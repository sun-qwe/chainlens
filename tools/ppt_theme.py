#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PPT 深色学术主题助手（python-pptx）。

用于开题答辩与毕业答辩两套幻灯片，保持与 ChainLens 深色控制台一致的视觉语言。
所有尺寸单位为英寸；画布 16:9（13.333 × 7.5）。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt
from pptx.oxml.ns import qn
from lxml import etree

# ---- 画布与色板 -------------------------------------------------------------
W = 13.333
H = 7.5

BG = RGBColor(0x07, 0x0B, 0x14)
BG_DEEP = RGBColor(0x05, 0x08, 0x10)
PANEL = RGBColor(0x0D, 0x15, 0x24)
PANEL_2 = RGBColor(0x11, 0x1C, 0x30)
PANEL_3 = RGBColor(0x15, 0x22, 0x38)
BORDER = RGBColor(0x1E, 0x2A, 0x44)
BORDER_SOFT = RGBColor(0x17, 0x21, 0x3A)
TEXT = RGBColor(0xE6, 0xED, 0xF7)
DIM = RGBColor(0x8D, 0xA2, 0xC0)
FAINT = RGBColor(0x5D, 0x72, 0x94)
CYAN = RGBColor(0x22, 0xD3, 0xEE)
VIOLET = RGBColor(0x8B, 0x5C, 0xF6)
AMBER = RGBColor(0xF5, 0x9E, 0x0B)
RED = RGBColor(0xEF, 0x44, 0x44)
GREEN = RGBColor(0x10, 0xB9, 0x81)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

FONT = "Microsoft YaHei UI"
FONT_NUM = "Segoe UI Semibold"
FONT_MONO = "Consolas"

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "thesis" / "figures"
SHOTS = ROOT / "screenshots" / "final"

CX = 0.75          # 内容左边界
CW = 11.83         # 内容宽度
TOP = 0.55
FOOTER_Y = 7.12


# ---- 基础工具 ---------------------------------------------------------------
def new_deck() -> Presentation:
    prs = Presentation()
    prs.slide_width = Inches(W)
    prs.slide_height = Inches(H)
    return prs


def _set_alpha(shape, alpha: float):
    """给纯色填充加透明度，alpha 0-1。"""
    fill = shape.fill
    fill.solid()
    tc = shape.fill.fore_color._xFill
    srgb = tc.find(qn("a:srgbClr"))
    if srgb is None:
        return
    a = etree.SubElement(srgb, qn("a:alpha"))
    a.set("val", str(int(max(0.0, min(1.0, alpha)) * 100000)))


def _no_line(shape):
    shape.line.fill.background()


def add_rect(slide, x, y, w, h, fill=None, line=None, radius=True, alpha=None):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    shape = slide.shapes.add_shape(shape_type, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
        if alpha is not None:
            _set_alpha(shape, alpha)
    if line is None:
        _no_line(shape)
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(0.75)
    if radius:
        try:
            shape.adjustments[0] = 0.08
        except Exception:
            pass
    return shape


def add_oval(slide, x, y, w, h, fill, alpha=1.0):
    shape = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    _no_line(shape)
    if alpha < 1:
        _set_alpha(shape, alpha)
    return shape


def style_run(run, size=14, color=TEXT, bold=False, italic=False, font=FONT):
    f = run.font
    f.size = Pt(size)
    f.bold = bold
    f.italic = italic
    f.color.rgb = color
    f.name = font
    rPr = run._r.get_or_add_rPr()
    for tag in ("a:ea", "a:latin"):
        el = rPr.find(qn(tag))
        if el is None:
            el = etree.SubElement(rPr, qn(tag))
        el.set("typeface", font)


def add_text(slide, x, y, w, h, text, size=14, color=TEXT, bold=False, align=PP_ALIGN.LEFT,
             anchor=MSO_ANCHOR.TOP, font=FONT, line_spacing=1.2, italic=False, margins=(0, 0, 0, 0)):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    tf.vertical_anchor = anchor
    tf.margin_left, tf.margin_right, tf.margin_top, tf.margin_bottom = [Inches(v) for v in margins]
    p = tf.paragraphs[0]
    p.alignment = align
    p.line_spacing = line_spacing
    run = p.add_run()
    run.text = text
    style_run(run, size=size, color=color, bold=bold, italic=italic, font=font)
    return box


def add_runs(slide, x, y, w, h, paragraphs, anchor=MSO_ANCHOR.TOP, margins=(0, 0, 0, 0)):
    """paragraphs: [[(text, dict), ...], ...]，每个内层列表是一段多 run 文本。"""
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    tf.vertical_anchor = anchor
    tf.margin_left, tf.margin_right, tf.margin_top, tf.margin_bottom = [Inches(v) for v in margins]
    for i, runs in enumerate(paragraphs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        opts = {}
        for text, fmt in runs:
            if fmt.get("para"):
                opts = fmt["para"]
                continue
            r = p.add_run()
            r.text = text
            style_run(r, size=fmt.get("size", 14), color=fmt.get("color", TEXT),
                      bold=fmt.get("bold", False), italic=fmt.get("italic", False),
                      font=fmt.get("font", FONT))
        p.alignment = opts.get("align", PP_ALIGN.LEFT)
        p.line_spacing = opts.get("line_spacing", 1.2)
        p.space_before = Pt(opts.get("space_before", 0))
        p.space_after = Pt(opts.get("space_after", 0))
    return box


def add_bullets(slide, x, y, w, h, items, size=13, color=TEXT, accent=CYAN, line_spacing=1.32,
                space=7, bullet="•"):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.line_spacing = line_spacing
        p.space_before = Pt(0 if i == 0 else space)
        p.space_after = Pt(0)
        # bullet
        pPr = p._p.get_or_add_pPr()
        pPr.set("marL", str(Emu(Inches(0.22)).emu))
        pPr.set("indent", str(-Emu(Inches(0.22)).emu))
        buClr = etree.SubElement(pPr, qn("a:buClr"))
        srgb = etree.SubElement(buClr, qn("a:srgbClr"))
        srgb.set("val", str(accent))
        buFont = etree.SubElement(pPr, qn("a:buFont"))
        buFont.set("typeface", "Arial")
        buChar = etree.SubElement(pPr, qn("a:buChar"))
        buChar.set("char", bullet)
        if isinstance(item, str):
            runs = [(item, {"size": size, "color": color})]
        else:
            runs = item
        for text, fmt in runs:
            r = p.add_run()
            r.text = text
            style_run(r, size=fmt.get("size", size), color=fmt.get("color", color),
                      bold=fmt.get("bold", False), font=fmt.get("font", FONT))
    return box


def bg(slide, section="", page=None, total=None):
    # 底色
    fill = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(W), Inches(H))
    fill.fill.solid()
    fill.fill.fore_color.rgb = BG
    _no_line(fill)
    # 角落光晕
    add_oval(slide, -2.2, -2.6, 7.2, 7.2, RGBColor(0x0B, 0x1F, 0x33), 0.55)
    add_oval(slide, 9.2, 4.1, 6.4, 6.4, RGBColor(0x14, 0x0F, 0x2B), 0.55)
    # 顶部强调线
    add_rect(slide, 0, 0, W, 0.045, CYAN, radius=False)
    add_rect(slide, 0, 0, 2.2, 0.045, VIOLET, radius=False)
    add_rect(slide, 2.2, 0, 1.1, 0.045, AMBER, radius=False)
    # 页脚
    add_rect(slide, CX, FOOTER_Y - 0.04, CW, 0.008, BORDER, radius=False)
    add_text(slide, CX, FOOTER_Y + 0.02, 8.0, 0.25, "ChainLens · DSH 探索链路数据可视化", 8.5, FAINT)
    if page is not None:
        add_text(slide, W - 1.0, FOOTER_Y + 0.02, 0.55, 0.25, f"{page:02d}", 9, FAINT,
                 align=PP_ALIGN.RIGHT, font=FONT_NUM)
    if section:
        add_text(slide, W - 4.4, FOOTER_Y + 0.02, 3.3, 0.25, section, 8.5, FAINT,
                 align=PP_ALIGN.RIGHT)


def kicker_title(slide, kicker, title, subtitle=None, title_size=27, y=0.55):
    add_text(slide, CX, y, CW, 0.28, kicker.upper(), 10.5, CYAN, bold=True)
    add_text(slide, CX, y + 0.30, CW, 0.66, title, title_size, TEXT, bold=True)
    add_rect(slide, CX, y + 0.98, 0.55, 0.035, CYAN, radius=False)
    if subtitle:
        add_text(slide, CX, y + 1.08, CW, 0.34, subtitle, 11.5, DIM, line_spacing=1.1)


def card(slide, x, y, w, h, title=None, body=None, accent=CYAN, title_size=15, body_size=11.5,
         kicker=None, big=None, big_size=30, line_spacing=1.28, fill=PANEL, border=BORDER):
    add_rect(slide, x, y, w, h, fill, border)
    add_rect(slide, x, y, 0.055, h, accent, radius=False)
    cursor = y + 0.16
    if kicker:
        add_text(slide, x + 0.22, cursor, w - 0.34, 0.22, kicker.upper(), 8.5, accent, bold=True)
        cursor += 0.24
    if big is not None:
        add_text(slide, x + 0.22, cursor - 0.02, w - 0.34, 0.55, str(big), big_size, accent, bold=True,
                 font=FONT_NUM)
        cursor += 0.50
    if title:
        add_text(slide, x + 0.22, cursor, w - 0.34, 0.28, title, title_size, TEXT, bold=True)
        cursor += 0.32
    if body:
        add_text(slide, x + 0.22, cursor, w - 0.34, h - (cursor - y) - 0.12, body, body_size, DIM,
                 line_spacing=line_spacing)


def pill(slide, x, y, w, h, text, color=CYAN, size=10, fill=None):
    add_rect(slide, x, y, w, h, fill or PANEL_2, color, radius=True)
    add_text(slide, x + 0.08, y + 0.03, w - 0.16, h - 0.06, text, size, color, bold=True,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def metric(slide, x, y, w, h, value, label, sub=None, accent=CYAN):
    add_rect(slide, x, y, w, h, PANEL, BORDER)
    add_rect(slide, x, y, w, 0.045, accent, radius=False)
    add_text(slide, x + 0.18, y + 0.14, w - 0.3, 0.55, value, 26, accent, bold=True, font=FONT_NUM)
    add_text(slide, x + 0.18, y + 0.68, w - 0.3, 0.28, label, 11.5, TEXT, bold=True)
    if sub:
        add_text(slide, x + 0.18, y + 0.94, w - 0.3, h - 1.0, sub, 9.5, DIM, line_spacing=1.2)


def add_image(slide, path, x, y, w, h, frame=True, caption=None, pad=0.0):
    path = Path(path)
    if not path.exists():
        add_rect(slide, x, y, w, h, PANEL, BORDER)
        add_text(slide, x + 0.1, y + h / 2 - 0.15, w - 0.2, 0.3, f"缺失图片：{path.name}", 10, RED,
                 align=PP_ALIGN.CENTER)
        return
    if frame:
        add_rect(slide, x, y, w, h, PANEL_2, BORDER)
    with Image.open(path) as im:
        iw, ih = im.size
    avail_w = w - pad * 2
    avail_h = h - pad * 2
    scale = min(avail_w / iw, avail_h / ih)
    dw, dh = iw * scale, ih * scale
    dx = x + (w - dw) / 2
    dy = y + (h - dh) / 2
    slide.shapes.add_picture(str(path), Inches(dx), Inches(dy), Inches(dw), Inches(dh))
    if caption:
        add_text(slide, x, y + h + 0.05, w, 0.25, caption, 9, FAINT, align=PP_ALIGN.CENTER)


def _cell_border(cell, color=BORDER, width=0.75):
    tcPr = cell._tc.get_or_add_tcPr()
    for tag in ("a:lnL", "a:lnR", "a:lnT", "a:lnB"):
        ln = tcPr.find(qn(tag))
        if ln is None:
            ln = etree.SubElement(tcPr, qn(tag))
        ln.set("w", str(int(width * 12700)))
        for child in list(ln):
            ln.remove(child)
        fill = etree.SubElement(ln, qn("a:solidFill"))
        srgb = etree.SubElement(fill, qn("a:srgbClr"))
        srgb.set("val", str(color))


def add_table(slide, x, y, w, h, headers, rows, col_widths=None, font_size=10.5, header_size=10.5,
              header_fill=PANEL_3, body_fill=PANEL, accent=CYAN, row_height=0.34):
    nrows, ncols = len(rows) + 1, len(headers)
    table = slide.shapes.add_table(nrows, ncols, Inches(x), Inches(y), Inches(w), Inches(h)).table
    if col_widths:
        for i, cw in enumerate(col_widths):
            table.columns[i].width = Inches(cw)
    table.rows[0].height = Inches(row_height)
    for r in range(1, nrows):
        table.rows[r].height = Inches(row_height)
    for c, head in enumerate(headers):
        cell = table.cell(0, c)
        cell.fill.solid()
        cell.fill.fore_color.rgb = header_fill
        cell.margin_left = cell.margin_right = Inches(0.08)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = cell.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = head
        style_run(run, size=header_size, color=accent, bold=True)
        _cell_border(cell)
    for r, row in enumerate(rows, start=1):
        for c, val in enumerate(row):
            cell = table.cell(r, c)
            cell.fill.solid()
            cell.fill.fore_color.rgb = body_fill
            cell.margin_left = cell.margin_right = Inches(0.08)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER if c > 0 else PP_ALIGN.LEFT
            run = p.add_run()
            run.text = str(val)
            style_run(run, size=font_size, color=TEXT if c == 0 else DIM)
            _cell_border(cell)
    return table


def add_notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def section_cover(slide, num, title, en, bullets):
    add_rect(slide, CX, 1.65, 0.09, 3.9, CYAN, radius=False)
    add_text(slide, CX + 0.35, 1.6, 2.2, 0.4, num, 14, CYAN, bold=True, font=FONT_NUM)
    add_text(slide, CX + 0.35, 2.0, 7.2, 0.8, title, 34, TEXT, bold=True)
    add_text(slide, CX + 0.37, 2.92, 7.2, 0.35, en, 12, FAINT)
    add_bullets(slide, CX + 0.37, 3.55, 7.0, 1.8, bullets, size=13, color=DIM)
    add_oval(slide, 8.8, 1.35, 4.0, 4.0, RGBColor(0x0B, 0x1F, 0x33), 0.5)
    add_text(slide, 9.15, 2.6, 3.3, 1.2, num, 96, RGBColor(0x11, 0x2C, 0x45), bold=True,
             align=PP_ALIGN.CENTER, font=FONT_NUM)
