"""Build the IEEE-format paper (Word .docx and IEEEtran .tex) from paper_ieee_source.md.

Steps
  1. Fill {{...}} placeholders from experiment outputs (tables/*.md, results/metrics_xdata.csv).
  2. DOCX: pandoc -> python-docx post-processing to IEEE layout (Times 10 pt, single-column title block,
     two-column body, full-width wide tables/figures, numbered equations, 8 pt captions/tables/references).
  3. TEX: IEEEtran journal source with tables, figures, equations, algorithm and bibliography.

Usage: python -I build_ieee.py RESULTS_DIR
"""
import copy
import re
import subprocess
import sys
from pathlib import Path

import pandas as pd
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

HERE = Path(__file__).parent
PAPER = HERE.parent
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
FULL_WIDTH_FIGS = {"fig1_system_architecture", "fig2_research_framework", "fig4_model_architecture",
                   "fig5_data_workflow"}
NAMES = {"lgbm_hand": "LightGBM (hand)", "cnn_sup": "CNN (supervised)", "cnn_ssl": "CNN (SSL + fine-tune)"}


# ----------------------------------------------------------------------------- 1. fill
def fill(src: str, results: Path) -> str:
    tables = PAPER / "tables"
    src = src.replace("{{table_main}}", (tables / "table5_soh_main.md").read_text(encoding="utf-8"))
    by_src = pd.read_csv(tables / "table5b_rmse_by_source.csv")
    by_src = by_src.assign(Labels=by_src.label_frac.map(lambda f: f"{int(f * 100)} %"),
                           Model=by_src.model.map({"ridge": "Ridge", "lgbm_hand": "LightGBM (hand)",
                                                   "lgbm_all": "LightGBM (hand+curves)", "cnn_sup": "CNN (sup.)",
                                                   "cnn_ssl": "CNN (SSL)"}))
    by_src = by_src.sort_values(["label_frac", "Model"], ascending=[False, True])
    cols = ["Labels", "Model", "CALCE", "HUST", "MATR", "NASA", "OXFORD", "SNL"]
    src = src.replace("{{table_source}}", md_table(by_src[cols].rename(columns={"OXFORD": "Oxford"})))
    xd_path = results / "metrics_xdata.csv"
    xd = pd.read_csv(xd_path) if xd_path.exists() else pd.DataFrame()
    xd = xd[xd.scope == "all"] if len(xd) else xd
    rows = []
    for _, r in xd.iterrows():
        rows.append({"Held-out source": r.holdout, "Model": NAMES.get(r.model, r.model), "Train cells": int(r.n_train_cells),
                     "Test cells": int(r.n_cells), "RMSE (% SOH)": f"{r.rmse_pct:.2f}", "MAE (% SOH)": f"{r.mae_pct:.2f}",
                     "R²": f"{r.r2:.2f}", "90 % PI coverage": f"{r.coverage:.3f}", "PI width (% SOH)": f"{r.width_pct:.2f}"})
    src = src.replace("{{table_xdata}}", md_table(pd.DataFrame(rows)) if rows else "[Cross-dataset runs pending]")
    x3_path = results / "metrics_xdata3.csv"
    if x3_path.exists():
        x3 = pd.read_csv(x3_path)
        x3 = x3[x3.scope == "all"]
        g = x3.groupby(["holdout", "model"], sort=False).agg(
            n=("seed", "nunique"), rm=("rmse_pct", "mean"), rs=("rmse_pct", "std"), r2=("r2", "max"),
            cm=("coverage", "mean"), cmin=("coverage", "min"), cmax=("coverage", "max")).reset_index()
        rows3 = [{"Held-out source": r.holdout, "Model": NAMES.get(r.model, r.model), "Seeds": int(r.n),
                  "RMSE (% SOH)": f"{r.rm:.2f} ± {r.rs:.2f}", "Max R²": f"{r.r2:.2f}",
                  "Coverage, mean (range)": f"{r.cm:.3f} ({r.cmin:.3f}–{r.cmax:.3f})"} for r in g.itertuples(index=False)]
        src = src.replace("{{table_xdata3}}", md_table(pd.DataFrame(rows3)))

    def token(m):
        _, hold, model, metric = m.group(0).strip("{}").split(":")
        hit = xd[(xd.holdout == hold) & (xd.model == model)] if len(xd) else xd
        if not len(hit):
            return "[pending]"
        v = float(hit.iloc[0][metric])
        return f"{v:.2f}" if metric.endswith("pct") else f"{v:.3f}"

    src = re.sub(r"\{\{xd:[A-Z]+:[a-z_]+:[a-z_]+\}\}", token, src)
    src = src.replace("{{xd_min_cov}}", f"{xd.coverage.min():.2f}" if len(xd) else "[pending]")
    left = re.findall(r"\{\{[^}]+\}\}", src)
    if left:
        print("WARNING unfilled placeholders:", left)
    return src


def md_table(df: pd.DataFrame) -> str:
    out = ["| " + " | ".join(map(str, df.columns)) + " |", "|" + "---|" * len(df.columns)]
    out += ["| " + " | ".join(map(str, row)) + " |" for row in df.itertuples(index=False)]
    return "\n".join(out)


def parse_front(src):
    m = re.match(r"---\n(.*?)\n---\n", src, re.S)
    meta = dict(re.findall(r'(\w+):\s*"(.*)"', m.group(1)))
    body = src[m.end():]
    abstract = re.search(r"^ABSTRACT:: (.*)$", body, re.M).group(1)
    keywords = re.search(r"^KEYWORDS:: (.*)$", body, re.M).group(1)
    body = re.sub(r"^(ABSTRACT|KEYWORDS):: .*\n", "", body, flags=re.M)
    return meta, abstract, keywords, body


# ----------------------------------------------------------------------------- 2. docx
def to_pandoc_md(body: str):
    """Number tables/figures, convert custom blocks; returns markdown and figure/table metadata."""
    lines, out, i = body.split("\n"), [], 0
    tab_n = fig_n = 0
    eq_tags = []
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("TABLE:: "):
            tab_n += 1
            out.append(f"::: {{custom-style=\"TableCaption\"}}\nTABLE {ROMAN[tab_n - 1]}\n\n{ln[8:].upper()}\n:::")
        elif ln.startswith("ALGORITHM:: "):
            out.append(f"::: {{custom-style=\"AlgoTitle\"}}\n**Algorithm 1:** {ln[12:]}\n:::")
            i += 1
            block = []
            while i < len(lines) and lines[i].strip():
                block.append(lines[i])
                i += 1
            out.append("::: {custom-style=\"Algo\"}\n" + "\\\n".join(block) + "\n:::")
            continue
        elif ln.startswith("!["):
            fig_n += 1
            m = re.match(r"!\[(.*)\]\((.*?)\)(\{.*\})?", ln)
            name = Path(m.group(2)).stem
            out.append(f"![Fig. {fig_n}. {m.group(1)}]({m.group(2)}){{#{name}}}")
        else:
            for t in re.findall(r"\\tag\{(\d+)\}", ln):
                eq_tags.append(t)
            out.append(re.sub(r"\s*\\tag\{\d+\}", "", ln))
        i += 1
    return "\n".join(out), eq_tags


def set_cols(sectPr, n):
    cols = sectPr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        sectPr.append(cols)
    cols.set(qn("w:num"), str(n))
    cols.set(qn("w:space"), "360")


def page_setup(sectPr):
    for tag in ("w:pgSz", "w:pgMar", "w:type"):
        el = sectPr.find(qn(tag))
        if el is not None:
            sectPr.remove(el)
    t = OxmlElement("w:type")
    t.set(qn("w:val"), "continuous")
    sz = OxmlElement("w:pgSz")
    sz.set(qn("w:w"), "12240")
    sz.set(qn("w:h"), "15840")
    mar = OxmlElement("w:pgMar")
    for k, v in {"top": "1080", "bottom": "1440", "left": "900", "right": "900", "header": "720", "footer": "720", "gutter": "0"}.items():
        mar.set(qn(f"w:{k}"), v)
    sectPr.insert(0, mar)
    sectPr.insert(0, sz)
    sectPr.insert(0, t)


def section_break_after(paragraph_el, ncols):
    """Make paragraph_el the last paragraph of a section with ncols columns (continuous)."""
    pPr = paragraph_el.find(qn("w:pPr"))
    if pPr is None:
        pPr = OxmlElement("w:pPr")
        paragraph_el.insert(0, pPr)
    sp = OxmlElement("w:sectPr")
    page_setup(sp)
    set_cols(sp, ncols)
    pPr.append(sp)


def empty_par(doc):
    p = OxmlElement("w:p")
    return p


def style_doc(doc):
    st = doc.styles
    for name in ("Normal", "Body Text", "First Paragraph", "Compact"):
        if name in [s.name for s in st]:
            s = st[name]
            s.font.name = "Times New Roman"
            s.font.size = Pt(10)
            s.element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
            pf = s.paragraph_format
            pf.space_before = Pt(0)
            pf.space_after = Pt(0)
            pf.line_spacing = 1.0
            if name in ("Body Text", "First Paragraph"):
                pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
                pf.first_line_indent = Inches(0.17)
    for name, size, bold, italic, caps, align in (("Heading 1", 10, False, False, True, WD_ALIGN_PARAGRAPH.CENTER),
                                                  ("Heading 2", 10, False, True, False, WD_ALIGN_PARAGRAPH.LEFT)):
        s = st[name]
        s.font.name = "Times New Roman"
        s.element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
        s.element.rPr.rFonts.set(qn("w:ascii"), "Times New Roman")
        s.element.rPr.rFonts.set(qn("w:hAnsi"), "Times New Roman")
        s.font.size = Pt(size)
        s.font.bold = bold
        s.font.italic = italic
        s.font.small_caps = caps
        s.font.color.rgb = RGBColor(0, 0, 0)
        s.paragraph_format.alignment = align
        s.paragraph_format.space_before = Pt(8)
        s.paragraph_format.space_after = Pt(4)
        s.paragraph_format.keep_with_next = True
    for name in ("Image Caption", "Captioned Figure", "Figure"):
        if name in [s.name for s in st]:
            s = st[name]
            s.font.name = "Times New Roman"
            s.font.size = Pt(8)
            s.font.italic = False
            s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY if name == "Image Caption" else WD_ALIGN_PARAGRAPH.CENTER
            s.paragraph_format.space_after = Pt(6)


def fmt_runs(p, size=None, bold=None, italic=None, caps=None):
    for r in p.runs:
        r.font.name = "Times New Roman"
        if size:
            r.font.size = Pt(size)
        if bold is not None:
            r.font.bold = bold
        if italic is not None:
            r.font.italic = italic
        if caps is not None:
            r.font.small_caps = caps


def build_docx(meta, abstract, keywords, body, out_path):
    md, eq_tags = to_pandoc_md(body)
    tmp_md = HERE / "_build_docx.md"
    tmp_md.write_text(md, encoding="utf-8")
    raw = HERE / "_raw.docx"
    subprocess.run(["pandoc", str(tmp_md), "-f", "markdown+tex_math_dollars+pipe_tables+fenced_divs+implicit_figures",
                    "-t", "docx", "--resource-path", str(HERE), "-o", str(raw)], check=True)
    doc = Document(str(raw))
    style_doc(doc)
    body_el = doc.element.body
    first = body_el[0]

    def insert_before(el, text, size, bold=False, italic=False, align=WD_ALIGN_PARAGRAPH.CENTER, after=6):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_after = Pt(after)
        r = p.add_run(text)
        r.font.name = "Times New Roman"
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.italic = italic
        el.addprevious(p._p)
        return p

    insert_before(first, meta["title"], 22, after=10)
    insert_before(first, meta["author"], 11, after=2)
    insert_before(first, meta["affiliation"], 9, italic=True, after=12)
    pa = doc.add_paragraph()
    pa.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r = pa.add_run("Abstract—")
    r.font.bold, r.font.italic = True, True
    r2 = pa.add_run(abstract)
    r2.font.bold = True
    fmt_runs(pa, size=9)
    first.addprevious(pa._p)
    pk = doc.add_paragraph()
    pk.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pk.paragraph_format.space_before = Pt(6)
    pk.paragraph_format.space_after = Pt(10)
    r = pk.add_run("Index Terms—")
    r.font.bold, r.font.italic = True, True
    rk = pk.add_run(keywords)
    rk.font.bold = True
    fmt_runs(pk, size=9)
    first.addprevious(pk._p)
    section_break_after(pk._p, 1)

    # headings: IEEE numbering already in text; references in 8 pt
    in_refs = False
    eq_i = 0
    for p in doc.paragraphs:
        sname = p.style.name if p.style is not None else ""
        if sname == "Heading 1":
            in_refs = p.text.strip().lower() == "references"
            if in_refs:
                p.text = "References"
            fmt_runs(p, size=10, caps=True, bold=False)
            continue
        if sname == "Heading 2":
            fmt_runs(p, size=10, italic=True, bold=False)
            continue
        if in_refs and p.text.strip():
            p.paragraph_format.first_line_indent = Inches(-0.25)
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
            fmt_runs(p, size=8)
            continue
        if re.match(r"^TABLE [IVX]+$", p.text.strip()) or sname == "TableCaption":
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.first_line_indent = Inches(0)
            p.paragraph_format.keep_with_next = True
            fmt_runs(p, size=8, caps=False)
        if sname in ("AlgoTitle", "Algo"):
            fmt_runs(p, size=8.5)
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.first_line_indent = Inches(0)
            p.paragraph_format.keep_together = True
            p.paragraph_format.keep_with_next = sname == "AlgoTitle"
            pPr = p._p.get_or_add_pPr()
            bdr = OxmlElement("w:pBdr")
            for edge, sz in (("top", "8") if sname == "AlgoTitle" else ("bottom", "8"),):
                e = OxmlElement(f"w:{edge}")
                e.set(qn("w:val"), "single")
                e.set(qn("w:sz"), sz)
                e.set(qn("w:space"), "2")
                e.set(qn("w:color"), "000000")
                bdr.append(e)
            if sname == "AlgoTitle":
                e = OxmlElement("w:bottom")
                for k, v in (("val", "single"), ("sz", "4"), ("space", "2"), ("color", "000000")):
                    e.set(qn(f"w:{k}"), v)
                bdr.append(e)
            pPr.append(bdr)
            p.paragraph_format.space_before = Pt(6) if sname == "AlgoTitle" else Pt(2)
            p.paragraph_format.space_after = Pt(6) if sname == "Algo" else Pt(2)

    # tables: 8 pt, borders, full width section for wide tables
    for t in doc.tables:
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        tblPr = t._tbl.tblPr
        borders = OxmlElement("w:tblBorders")
        for edge in ("top", "bottom", "insideH"):
            e = OxmlElement(f"w:{edge}")
            e.set(qn("w:val"), "single")
            e.set(qn("w:sz"), "4")
            e.set(qn("w:color"), "000000")
            borders.append(e)
        tblPr.append(borders)
        for row in t.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    p.paragraph_format.first_line_indent = Inches(0)
                    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    fmt_runs(p, size=7.5)
        for cell in t.rows[0].cells:
            for p in cell.paragraphs:
                fmt_runs(p, bold=True)
        if len(t.columns) > 3:
            cap = t._tbl.getprevious()
            anchor = t._tbl
            if cap is not None and cap.getprevious() is not None and re.match(
                    r"^TABLE [IVX]+$", "".join(cap.getprevious().itertext()).strip()):
                anchor = cap.getprevious()
            elif cap is not None and "TABLE" in "".join(cap.itertext()):
                anchor = cap
            pre = empty_par(doc)
            anchor.addprevious(pre)
            section_break_after(pre, 2)
            post = empty_par(doc)
            t._tbl.addnext(post)
            section_break_after(post, 1)

    # figures: width; full-width section for wide ones
    for p in list(doc.paragraphs):
        blips = p._p.findall(".//" + qn("a:blip"))
        if not blips:
            continue
        docpr = p._p.find(".//" + qn("wp:docPr"))
        name = Path(docpr.get("descr", "") or docpr.get("name", "")).stem if docpr is not None else ""
        rel = blips[0].get(qn("r:embed"))
        target = Path(doc.part.related_parts[rel].partname).stem
        wide = any(k in (name + target) for k in FULL_WIDTH_FIGS) or _is_wide(p, doc)
        width = Inches(4.4 if "fig1_system" in (name + target) else 7.0) if wide else Inches(3.45)
        for inline in p._p.findall(".//" + qn("wp:extent")):
            cx, cy = int(inline.get("cx")), int(inline.get("cy"))
            inline.set("cx", str(int(width)))
            inline.set("cy", str(int(cy * int(width) / cx)))
        for ext in p._p.findall(".//" + qn("a:ext")):
            cx, cy = int(ext.get("cx")), int(ext.get("cy"))
            ext.set("cx", str(int(width)))
            ext.set("cy", str(int(cy * int(width) / cx)))
        if wide:
            cap = p._p.getnext()
            pre = empty_par(doc)
            p._p.addprevious(pre)
            section_break_after(pre, 2)
            post = empty_par(doc)
            (cap if cap is not None else p._p).addnext(post)
            section_break_after(post, 1)

    number_equations(doc, eq_tags)
    final = body_el.find(qn("w:sectPr"))
    page_setup(final)
    set_cols(final, 2)
    _fix_alternation(doc)
    doc.save(str(out_path))
    tmp_md.unlink()
    raw.unlink()


def number_equations(doc, tags):
    """IEEE Word convention: each display equation sits in a borderless 1x2 table, number right-aligned."""
    k = 0
    for p in list(doc.paragraphs):
        if p._p.find(".//" + qn("m:oMathPara")) is None or k >= len(tags):
            continue
        t = doc.add_table(rows=1, cols=2)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = False
        borders = OxmlElement("w:tblBorders")
        for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
            e = OxmlElement(f"w:{edge}")
            e.set(qn("w:val"), "nil")
            borders.append(e)
        t._tbl.tblPr.append(borders)
        for cell, w in zip(t.rows[0].cells, (Inches(3.1), Inches(0.35))):
            cell.width = w
            va = OxmlElement("w:vAlign")
            va.set(qn("w:val"), "center")
            cell._tc.get_or_add_tcPr().append(va)
        p._p.addprevious(t._tbl)
        c0 = t.rows[0].cells[0]
        c0._tc.remove(c0.paragraphs[0]._p)
        c0._tc.append(p._p)
        p.paragraph_format.first_line_indent = Inches(0)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        num = t.rows[0].cells[1].paragraphs[0]
        num.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r = num.add_run(f"({tags[k]})")
        r.font.name, r.font.size = "Times New Roman", Pt(10)
        k += 1


def _is_wide(p, doc):
    ext = p._p.find(".//" + qn("wp:extent"))
    return ext is not None and int(ext.get("cx")) / int(ext.get("cy")) > 1.6


def _fix_alternation(doc):
    """After inserting breaks, every section must alternate correctly: section ending with a 1-col break holds
    full-width content; the next section (text) is 2-col. Ensure consecutive empty breaks don't create blank sections."""
    body = doc.element.body
    prev_cols = None
    for p in body.iterchildren(qn("w:p")):
        sp = p.find(qn("w:pPr") + "/" + qn("w:sectPr"))
        if sp is None:
            continue
        n = sp.find(qn("w:cols")).get(qn("w:num"))
        if n == prev_cols and not "".join(p.itertext()).strip():
            body.remove(p)
            continue
        prev_cols = n


# ----------------------------------------------------------------------------- 3. tex
UNI = {"–": "--", "—": "---", "±": r"$\pm$", "≤": r"$\le$", "≥": r"$\ge$", "×": r"$\times$", "°": r"$^\circ$",
       "≈": r"$\approx$", "²": r"$^2$", "³": r"$^3$", "⁻": r"$^-$", "¹": r"$^1$", "⁴": r"$^4$", "→": r"$\rightarrow$",
       "Δ": r"$\Delta$", "α": r"$\alpha$", "τ": r"$\tau$", "μ": r"$\mu$", "é": r"\'e", "à": r"\`a", "ö": r'\"o', "ü": r'\"u',
       "−": r"$-$", "á": r"\'a", "è": r"\`e", "Q̂": r"$\hat{Q}$", "q̂": r"$\hat{q}$", "’": "'", "“": "``", "”": "''"}


def pandoc_inline(md: str) -> str:
    res = subprocess.run(["pandoc", "-f", "markdown+tex_math_dollars", "-t", "latex", "--wrap=none"], input=md.encode("utf-8"),
                         capture_output=True, check=True)
    tex = res.stdout.decode("utf-8").strip()
    tex = re.sub(r"\{\[\}(\d+)\{\]\}", r"\\cite{b\1}", tex)
    tex = tex.replace(r"\cite{b", r"\cite{b")
    for k, v in UNI.items():
        tex = tex.replace(k, v)
    return tex


def table_tex(caption, rows, idx):
    header, data = rows[0], rows[2:]
    ncol = len(header)
    wide = ncol > 3
    env = "table*" if wide else "table"
    width = r"\textwidth" if wide else r"\columnwidth"
    spec = "@{}" + "".join(r">{\raggedright\arraybackslash}X" for _ in range(ncol)) + "@{}"
    cells = lambda r: " & ".join(pandoc_inline(c.strip()) if c.strip() else "" for c in r)
    body = [r"\toprule", cells(header) + r" \\", r"\midrule"] + [cells(r) + r" \\" for r in data] + [r"\bottomrule"]
    return "\n".join([rf"\begin{{{env}}}[!t]", r"\centering", rf"\caption{{{pandoc_inline(caption)}}}", rf"\label{{tab:{idx}}}",
                      r"\scriptsize", rf"\begin{{tabularx}}{{{width}}}{{{spec}}}"] + body + [r"\end{tabularx}", rf"\end{{{env}}}"])


def build_tex(meta, abstract, keywords, body, out_path):
    lines = body.split("\n")
    out, i, tab_n = [], 0, 0
    para = []

    def flush():
        if para:
            out.append(pandoc_inline("\n".join(para)))
            out.append("")
            para.clear()

    while i < len(lines):
        ln = lines[i]
        if ln.startswith("# "):
            flush()
            title = re.sub(r"^[IVX]+\.\s+", "", ln[2:])
            if title.lower() == "references":
                break
            out.append(rf"\section{{{pandoc_inline(title)}}}")
        elif ln.startswith("## "):
            flush()
            out.append(rf"\subsection{{{pandoc_inline(re.sub(r'^[A-H]\.\s+', '', ln[3:]))}}}")
        elif ln.startswith("TABLE:: "):
            flush()
            tab_n += 1
            cap = ln[8:]
            i += 1
            while not lines[i].startswith("|"):
                i += 1
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c for c in lines[i].strip().strip("|").split("|")])
                i += 1
            out.append(table_tex(cap, rows, tab_n))
            continue
        elif ln.startswith("ALGORITHM:: "):
            flush()
            out += [r"\begin{figure}[!t]", r"\footnotesize", r"\noindent\rule{\columnwidth}{0.6pt}\\",
                    rf"\textbf{{Algorithm 1:}} {pandoc_inline(ln[12:])}\\[-2pt]", r"\noindent\rule{\columnwidth}{0.4pt}"]
            i += 1
            items = []
            while i < len(lines) and lines[i].strip():
                items.append(lines[i].strip())
                i += 1
            out.append(pandoc_inline(items[0]) + r"\\")
            out.append(r"\begin{enumerate}[leftmargin=*,nosep]")
            out += [rf"\item {pandoc_inline(re.sub(r'^\d+\.\s*', '', it))}" for it in items[1:]]
            out += [r"\end{enumerate}", r"\noindent\rule{\columnwidth}{0.6pt}", r"\end{figure}"]
            continue
        elif ln.startswith("!["):
            flush()
            m = re.match(r"!\[(.*)\]\((.*?)\)", ln)
            name = Path(m.group(2)).stem
            env = "figure*" if name in FULL_WIDTH_FIGS else "figure"
            w = r"\textwidth" if env == "figure*" else r"\columnwidth"
            out += [rf"\begin{{{env}}}[!t]", r"\centering", rf"\includegraphics[width={w}]{{figures/{name}.png}}",
                    rf"\caption{{{pandoc_inline(m.group(1))}}}", rf"\label{{fig:{name}}}", rf"\end{{{env}}}", ""]
        elif ln.startswith("$$"):
            flush()
            mtag = re.search(r"\\tag\{(\d+)\}", ln)
            eq = re.sub(r"\s*\\tag\{\d+\}", "", ln.strip("$ ").rstrip("$"))
            eq = eq.rstrip(" .,")
            out += [r"\begin{equation}", eq, rf"\label{{eq:{mtag.group(1) if mtag else len(out)}}}", r"\end{equation}"]
        elif re.match(r"^\d+\. ", ln):
            flush()
            items = []
            while i < len(lines) and re.match(r"^\d+\. ", lines[i]):
                items.append(re.sub(r"^\d+\.\s*", "", lines[i]))
                i += 1
            out += [r"\begin{enumerate}"] + [rf"\item {pandoc_inline(t)}" for t in items] + [r"\end{enumerate}", ""]
            continue
        elif ln.strip() == "":
            flush()
        else:
            para.append(ln)
        i += 1
    flush()
    refs = re.findall(r"^\[(\d+)\] (.*)$", body, re.M)
    bib = [r"\begin{thebibliography}{99}"] + [rf"\bibitem{{b{n}}} {pandoc_inline(t)}" for n, t in refs] + [r"\end{thebibliography}"]
    authors = meta["author"]
    head = rf"""\documentclass[journal]{{IEEEtran}}
\usepackage{{amsmath,amssymb}}
\usepackage{{graphicx}}
\usepackage{{booktabs,tabularx,array}}
\usepackage[hidelinks]{{hyperref}}
\usepackage{{enumitem}}
\usepackage[utf8]{{inputenc}}
\usepackage[T1]{{fontenc}}
\providecommand{{\tightlist}}{{\setlength{{\itemsep}}{{0pt}}\setlength{{\parskip}}{{0pt}}}}
\begin{{document}}
\title{{{pandoc_inline(meta["title"])}}}
\author{{{pandoc_inline(authors)}%
\thanks{{{pandoc_inline(meta["affiliation"])}}}}}
\maketitle
\begin{{abstract}}
{pandoc_inline(abstract)}
\end{{abstract}}
\begin{{IEEEkeywords}}
{pandoc_inline(keywords)}
\end{{IEEEkeywords}}
"""
    out_path.write_text(head + "\n".join(out) + "\n" + "\n".join(bib) + "\n\\end{document}\n", encoding="utf-8")


if __name__ == "__main__":
    results = Path(sys.argv[1])
    src = fill((HERE / "paper_ieee_source.md").read_text(encoding="utf-8"), results)
    (HERE / "paper_ieee_filled.md").write_text(src, encoding="utf-8")
    meta, abstract, keywords, body = parse_front(src)
    build_docx(meta, abstract, keywords, body, HERE / "SmartEV_SOH_IEEE.docx")
    build_tex(meta, abstract, keywords, body, HERE / "SmartEV_SOH_IEEE.tex")
    print("IEEE BUILD DONE")
