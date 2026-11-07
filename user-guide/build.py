"""Render docs/user-guide (Markdown, from the `prototype` branch) into this folder as static HTML.

The Pages site is a static publish with .nojekyll, so the guide is pre-rendered here.

    git archive prototype docs/user-guide | tar -x -C /tmp/ug
    pip install markdown==3.7
    python user-guide/build.py /tmp/ug/docs/user-guide
"""
import re
import shutil
import sys
from pathlib import Path

import markdown

SRC = Path(sys.argv[1])
OUT = Path(__file__).parent
CHAPTERS = [  # (source file, nav label) — README becomes index.html
    ("README.md", "Overview"),
    ("getting-started.md", "Getting started"),
    ("student.md", "Student"),
    ("club-officers.md", "Club officers"),
    ("treasurer.md", "Treasurer"),
    ("organiser.md", "Organiser & door"),
    ("cultural-society.md", "Cultural Society"),
    ("dean.md", "Dean"),
    ("vice-chancellor.md", "Vice-Chancellor"),
]


def out_name(md):
    return "index.html" if md == "README.md" else md[:-3] + ".html"


def render(md_text):
    html = markdown.markdown(md_text, extensions=["tables", "fenced_code", "toc", "sane_lists"])
    # chapter links: student.md#x -> student.html#x
    html = re.sub(r'href="([a-z-]+|README)\.md(#[^"]*)?"',
                  lambda m: f'href="{out_name(m[1] + ".md")}{m[2] or ""}"', html)
    # mermaid fences -> <pre class="mermaid"> for the client-side renderer
    html = re.sub(r'<pre><code class="language-mermaid">(.*?)</code></pre>',
                  r'<pre class="mermaid">\1</pre>', html, flags=re.S)
    # left-to-right is ~1900px wide and unreadable once scaled to the column; draw it top-down
    html = html.replace('<pre class="mermaid">flowchart LR', '<pre class="mermaid">flowchart TD')
    return html.replace("<img ", '<img loading="lazy" ')


PAGE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — Culturals user guide</title>
<style>
:root{{--bg:#f6f7fb;--panel:#fff;--ink:#111827;--muted:#5b6475;--line:#e3e6ee;--accent:#1d5fe0}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f141c;--panel:#161d28;--ink:#e7ebf2;--muted:#9aa4b5;--line:#263042;--accent:#7aa7ff}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}}
.wrap{{display:grid;grid-template-columns:230px minmax(0,1fr);max-width:1180px;margin:0 auto}}
nav{{position:sticky;top:0;align-self:start;height:100vh;overflow:auto;padding:28px 16px;border-right:1px solid var(--line)}}
nav .brand{{font-weight:700;font-size:18px;margin:0 8px 18px}}nav a{{display:block;padding:7px 10px;border-radius:8px;color:var(--muted);text-decoration:none}}
nav a:hover{{color:var(--ink)}}nav a.on{{background:var(--panel);color:var(--accent);font-weight:600;box-shadow:0 0 0 1px var(--line)}}
main{{padding:32px 40px 80px;min-width:0}}h1{{font-size:32px;line-height:1.2;margin:0 0 12px}}h2{{margin-top:40px;padding-top:8px;border-top:1px solid var(--line)}}
a{{color:var(--accent)}}img{{max-width:100%;height:auto;border:1px solid var(--line);border-radius:10px;margin:8px 0;display:block}}
table{{border-collapse:collapse;width:100%;margin:12px 0;display:block;overflow-x:auto}}th,td{{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}}th{{background:var(--panel)}}
code{{background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:1px 5px;font-size:.9em}}pre{{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto}}
pre code{{border:0;padding:0}}pre.mermaid{{text-align:center}}
@media (max-width:820px){{.wrap{{display:block}}nav{{position:static;height:auto;display:flex;flex-wrap:wrap;gap:4px;padding:14px 16px;border-right:0;border-bottom:1px solid var(--line)}}nav .brand{{width:100%;margin:0 0 6px}}main{{padding:20px 16px 60px}}}}
</style></head><body><div class="wrap">
<nav aria-label="Chapters"><div class="brand">Culturals guide</div>{nav}</nav>
<main>{body}</main></div>
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
mermaid.initialize({{startOnLoad:true,theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default"}});
</script></body></html>
"""

shutil.copytree(SRC / "img", OUT / "img", dirs_exist_ok=True)
for md, label in CHAPTERS:
    nav = "".join(f'<a href="{out_name(m)}"{" class=on aria-current=page" if m == md else ""}>{l}</a>'
                  for m, l in CHAPTERS)
    body = render((SRC / md).read_text(encoding="utf-8"))
    (OUT / out_name(md)).write_text(PAGE.format(title=label, nav=nav, body=body), encoding="utf-8")
    print("wrote", out_name(md))
