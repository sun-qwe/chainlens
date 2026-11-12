#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
pdf_toc.py — 从 LibreOffice 导出的 PDF 书签（Outlines）提取论文章节页码，生成静态目录数据。

用法：
    python tools/pdf_toc.py <input.pdf> --json thesis/source/toc-entries.json

原理：
    1. 解析 PDF 间接对象（LibreOffice 输出为未压缩对象表）；
    2. 沿 Catalog -> Pages -> Kids 递归得到页对象引用到页码的映射；
    3. 沿 Outlines 的 First/Next 链遍历书签，读取 /Title（UTF-16BE 十六进制）与 /Dest 页引用；
    4. 按标题模式判断层级，过滤到章/节两级；正文页码 = PDF 页码 - 正文起始前页数。
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

OBJ_RE = re.compile(rb"(\d+)\s+0\s+obj\b(.*?)\bendobj", re.S)
KIDS_RE = re.compile(rb"/Kids\s*\[(.*?)\]", re.S)
REF_RE = re.compile(rb"(\d+)\s+0\s+R")
TITLE_RE = re.compile(rb"/Title\s*<([0-9A-Fa-f]+)>")
DEST_RE = re.compile(rb"/Dest\s*\[\s*(\d+)\s+0\s+R")
FIRST_RE = re.compile(rb"/First\s+(\d+)\s+0\s+R")
NEXT_RE = re.compile(rb"/Next\s+(\d+)\s+0\s+R")
TYPE_PAGES_RE = re.compile(rb"/Type\s*/Pages")
TYPE_PAGE_RE = re.compile(rb"/Type\s*/Page\b")
CATALOG_PAGES_RE = re.compile(rb"/Pages\s+(\d+)\s+0\s+R")
COUNT_RE = re.compile(rb"/Count\s+(\d+)")


def decode_title(raw: bytes) -> str:
    text = raw.decode("ascii", "ignore")
    try:
        b = bytes.fromhex(text)
    except ValueError:
        return text
    if b.startswith(b"\xfe\xff"):
        try:
            return b[2:].decode("utf-16-be")
        except UnicodeDecodeError:
            return b[2:].decode("utf-16-be", "replace")
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        return b.decode("latin-1", "replace")


def parse_objects(data: bytes):
    objs = {}
    for m in OBJ_RE.finditer(data):
        objs[int(m.group(1))] = m.group(2)
    return objs


def page_order(objs):
    catalog = None
    for num, body in objs.items():
        if b"/Type/Catalog" in body or b"/Type /Catalog" in body:
            m = CATALOG_PAGES_RE.search(body)
            if m:
                catalog = int(m.group(1))
                break
    if catalog is None:
        raise SystemExit("未找到 Catalog/Pages")
    pages = []

    def walk(ref):
        body = objs.get(ref, b"")
        if TYPE_PAGE_RE.search(body):
            pages.append(ref)
            return
        m = KIDS_RE.search(body)
        if not m:
            return
        for child in REF_RE.findall(m.group(1)):
            walk(int(child))

    walk(catalog)
    return {ref: idx + 1 for idx, ref in enumerate(pages)}


def walk_outline(objs, root_ref):
    entries = []

    def node(ref, level_hint=0):
        body = objs.get(ref)
        if body is None:
            return
        tm = TITLE_RE.search(body)
        dm = DEST_RE.search(body)
        if tm:
            title = decode_title(tm.group(1))
            page_ref = int(dm.group(1)) if dm else None
            entries.append({"title": title, "page_ref": page_ref, "object": ref})
        first = FIRST_RE.search(body)
        if first:
            child = int(first.group(1))
            seen = set()
            while child and child not in seen:
                seen.add(child)
                node(child)
                nb = objs.get(child, b"")
                nm = NEXT_RE.search(nb)
                child = int(nm.group(1)) if nm else None

    first = FIRST_RE.search(objs.get(root_ref, b""))
    if first:
        child = int(first.group(1))
        seen = set()
        while child and child not in seen:
            seen.add(child)
            node(child)
            nm = NEXT_RE.search(objs.get(child, b""))
            child = int(nm.group(1)) if nm else None
    return entries


def level_of(title: str) -> int:
    t = title.strip()
    if re.match(r"^第\s*\d+\s*章", t):
        return 0
    if re.match(r"^\d+\.\d+\.\d+", t):
        return 3
    if re.match(r"^\d+\.\d+", t):
        return 1
    if re.match(r"^[A-Z]\.\d", t):
        return 1
    if re.match(r"^附录", t):
        return 0
    if t in ("摘要", "Abstract", "参考文献", "致谢"):
        return 0
    if t in ("目 录", "目录"):
        return -1
    return 0


def roman(n: int) -> str:
    vals = [(1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"),
            (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
    out = ""
    for v, s in vals:
        while n >= v:
            out += s
            n -= v
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--json", default=None)
    ap.add_argument("--max-level", type=int, default=2)
    args = ap.parse_args()

    data = Path(args.pdf).read_bytes()
    objs = parse_objects(data)
    pages = page_order(objs)
    # 找 Outlines 根
    outline_root = None
    for num, body in objs.items():
        if b"/Type/Catalog" in body or b"/Type /Catalog" in body:
            m = re.search(rb"/Outlines\s+(\d+)\s+0\s+R", body)
            if m:
                outline_root = int(m.group(1))
                break
    if outline_root is None:
        raise SystemExit("PDF 不含 Outlines（书签）")
    raw_entries = walk_outline(objs, outline_root)

    # 正文起始页（第1章）
    chapter1 = None
    for e in raw_entries:
        if level_of(e["title"]) == 0 and e["title"].strip().startswith("第1章"):
            chapter1 = pages.get(e["page_ref"])
            break
    if chapter1 is None:
        raise SystemExit("未找到第1章书签")
    front = chapter1 - 1  # 正文前一共有多少页（封面+摘要+Abstract+目录）

    entries = []
    for e in raw_entries:
        lvl = level_of(e["title"])
        if lvl < 0 or lvl > args.max_level:
            # 目录自身与三级标题不收录；但附录 A.1 这类二级要保留
            continue
        pdf_page = pages.get(e["page_ref"]) if e["page_ref"] else None
        if pdf_page is None:
            continue
        title = e["title"].strip()
        if title.replace(" ", "") == "摘要":
            label = roman(pdf_page)  # 封面为 1，摘要通常是 ii，但这里按实际 PDF 页转罗马
            # 封面不编号：摘要页实际是 i
            label = roman(pdf_page - 1)
        elif title == "Abstract":
            label = roman(pdf_page - 1)
        else:
            label = str(pdf_page - front)
        entries.append({"title": title, "level": lvl, "pdf_page": pdf_page, "page": label})

    result = {
        "source": str(Path(args.pdf).resolve()),
        "pdf_pages": len(pages),
        "front_pages": front,
        "chapter1_pdf_page": chapter1,
        "entries": entries,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
        print(f"written {args.json}")


if __name__ == "__main__":
    main()
