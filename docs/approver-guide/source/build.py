"""Builds the approver guide (docs/approver-guide): python3 build.py && node render.mjs

Fixed A4 pages of HTML (guide.html), printed to PDF by Chromium in render.mjs.
Screenshots come from capture.mjs (live demo, dark theme, 2x), with the boxes of the controls to mark.
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parents[2]
SHOTS = HERE / "shots"
FONT = REPO / "clubs-and-culturals-platform/app/frontend/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2"
BOXES = json.loads((SHOTS / "boxes.json").read_text())

# Per-mark tweaks: "at" puts a ring's badge l/r/t/b of the ring; "side" hangs a pin off the l/r edge
# of the screenshot; "n" renumbers; x/y/w/h retarget the mark.
OV = {
    "society-decision": {3: {"at": "b"}},
    "dean-decision": {1: {"at": "r"}},
    "review-full": {1: {"x": 265, "y": 230, "w": 980, "h": 125}, 2: {"side": "r"}, 3: {"x": 268}, 4: {"side": "r"}, 5: {"x": 268}},
    "venues-move": {1: {"n": 2}, 2: {"n": 3, "at": "b"}, 3: {"n": 4}},
    "calendar": {1: {"at": "r"}, 2: {"at": "b"}},
    "vc-proposal": {1: {"side": "r", "x": 888, "y": 335, "w": 60, "h": 20}, 2: {"x": 274}},
}
EXTRA = {"venues-move": [{"type": "ring", "n": 1, "x": 823, "y": 28, "w": 107, "h": 32}]}


def fig(name, crop=None, cls="", alt=""):
    """A screenshot with its marks. crop = (x, y, w, h) in the screen's CSS pixels."""
    d = BOXES[name]
    marks_in = [{**m, **OV.get(name, {}).get(m["n"], {})} for m in d["marks"]] + EXTRA.get(name, [])
    W, H = d["w"], d["h"]
    cx, cy, cw, ch = crop or (0, 0, W, H)
    img = (f'<img src="{(SHOTS / f"{name}.png").as_uri()}" alt="{alt}" style="width:{W / cw * 100:.4f}%;'
           f'left:{-cx / cw * 100:.4f}%;top:{-cy / ch * 100:.4f}%">')
    marks = []
    for m in marks_in:
        x, y, w, h = m["x"] - cx, m["y"] - cy, m["w"], m["h"]
        if x + w < 0 or y + h < 0 or x > cw or y > ch:
            continue  # outside this crop
        if m["type"] == "ring":
            p = 5
            marks.append(
                f'<span class="ring" style="left:{(x - p) / cw * 100:.3f}%;top:{(y - p) / ch * 100:.3f}%;'
                f'width:{(w + 2 * p) / cw * 100:.3f}%;height:{(h + 2 * p) / ch * 100:.3f}%">'
                f'<b class="badge at-{m.get("at", "l")}">{m["n"]}</b></span>')
        else:
            top = (y + h / 2) / ch * 100
            side = m.get("side", "l")
            lead = (f'left:0;width:{max(x, 0) / cw * 100:.3f}%' if side == "l"
                    else f'right:0;width:{max(cw - x - w, 0) / cw * 100:.3f}%')
            pin = 'left:0' if side == "l" else 'left:100%'
            marks.append(f'<i class="leader side-{side}" style="top:{top:.3f}%;{lead}"></i>'
                         f'<b class="pin side-{side}" style="top:{top:.3f}%;{pin}">{m["n"]}</b>')
    return (f'<figure class="shot {cls}"><div class="frame" style="aspect-ratio:{cw}/{ch}">'
            f'<div class="clip">{img}</div>{"".join(marks)}</div></figure>')


def steps(*items, kind="click"):
    """Numbered steps whose badges match the marks on the screenshot."""
    lis = "".join(f'<li><b class="{"badge" if kind == "click" else "pin"} inline">{n}</b><div>{t}</div></li>'
                  for n, t in items)
    return f'<ol class="steps {kind}">{lis}</ol>'


def title(text, who="all approvers"):
    return f'<header class="title"><h1>{text}</h1><span class="for">For <b>{who}</b></span></header>'


CHECK = '<svg viewBox="0 0 16 16" class="ic ok" aria-label="yes"><path d="M3.5 8.5l3 3 6-7" /></svg>'
DASH = '<svg viewBox="0 0 16 16" class="ic no" aria-label="no"><path d="M5 8h6" /></svg>'
ARROW = '<svg viewBox="0 0 16 16" class="arrow" aria-hidden="true"><path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" /></svg>'

PARTS = {1: "Getting started", 2: "Approving proposals", 3: "Venues and oversight", 4: "Help"}
pages = []


def page(body, part=None, cls=""):
    n = len(pages) + 1
    extra = ""
    if part:
        extra = (f'<div class="tab" style="top:{30 + (part - 1) * 50}mm"><b>{part}</b><span>{PARTS[part]}</span></div>'
                 f'<footer><span>Part {part} · {PARTS[part]}</span><span>{n}</span></footer>')
    elif n > 1:
        extra = f'<footer><span>Culturals · Guide for approvers</span><span>{n}</span></footer>'
    pages.append(f'<section class="page {cls}">{body}{extra}</section>')


# ================================================================== cover
page(f"""
<div class="cover-top">
  <div class="wordmark">Culturals</div>
  <div class="cover-kind">Clubs &amp; events at your college</div>
</div>
<div class="cover-main">
  <h1>Guide for approvers</h1>
  <p class="cover-sub">For the <b>Cultural Society</b>, the <b>Dean of Student Affairs</b> and
  <b>Management (the Vice-Chancellor)</b>. Every page you use, step by step.</p>
</div>
<div class="cover-shot">{fig("review-full", crop=(250, 60, 1010, 830))}</div>
<div class="cover-foot">
  <div><span class="k">Open the app</span><b>culturals-clubs-events.vercel.app</b></div>
  <div><span class="k">Edition</span><b>Pilot · November 2026</b></div>
</div>
""", cls="cover")

# ================================================================== contents
TOC = [
    (1, [("How a proposal is approved", 3), ("Sign in", 4), ("Finding your way", 4)]),
    (2, [("Your approvals queue", 5), ("Review a proposal", 6), ("Decide", 7), ("The Dean: sanction by line", 7),
         ("Management: the last step", 8)]),
    (3, [("Venues and clashes", 9), ("Calendar", 10), ("This semester", 11), ("Semester report", 11)]),
    (4, [("Tags and statuses", 12), ("Quick answers", 13), ("Tell us what to improve", 13)]),
]
toc_html = "".join(
    f'<div class="toc-part"><div class="toc-num">{p}</div><div><h2>{PARTS[p]}</h2>'
    + "".join(f'<div class="toc-row"><span>{t}</span><i></i><b>{pg}</b></div>' for t, pg in rows)
    + "</div></div>" for p, rows in TOC)
page(f"""
<h1 class="solo">Contents</h1>
<div class="short">
  <h2>The short version</h2>
  <ol class="strip">
    <li><b>Sign in</b><span>with your password and the 6-digit code</span></li>
    <li><b>Open your queue</b><span>proposals waiting for you</span></li>
    <li><b>Review</b><span>route, budget, clashes, earlier decisions</span></li>
    <li><b>Decide</b><span>approve, return for changes, or reject</span></li>
  </ol>
</div>
<div class="toc">{toc_html}</div>
<div class="howto">
  <h2>How to read the pictures</h2>
  <div class="legend">
    <div><span class="ring demo"><b class="badge at-l">1</b></span><p><b>Amber ring: click here.</b> The number matches the step next to the picture.</p></div>
    <div><b class="pin static">1</b><p><b>Blue dot: look here.</b> It points out part of the page. Nothing to click.</p></div>
  </div>
  <p class="muted small">Pictures are from the pilot in dark mode, with made-up clubs and events.
  The app follows your device's light or dark setting.</p>
</div>
""")

# ================================================================== part 1
page(f"""
{title("How a proposal is approved")}
<p class="lead">Clubs propose events with a budget in Culturals. <b>Every proposal passes the approvers
below before students can see it.</b></p>
<div class="route">
  <div class="stop"><b>Club</b><span>proposes the event and budget</span></div>{ARROW}
  <div class="stop"><b>Cultural Society</b><span>cultural and literary clubs only</span></div>{ARROW}
  <div class="stop strong"><b>Dean</b><span>every event, always</span></div>{ARROW}
  <div class="stop"><b>Vice-Chancellor</b><span>only over <b>₹50,000</b> or part of a fest</span></div>{ARROW}
  <div class="stop end"><b>Published</b><span>students can register</span></div>
</div>

<h2 class="sec">Three decisions, at every step</h2>
<div class="decisions">
  <div class="d ok"><h3>Approve</h3><p>Sends it to the next approver, or publishes it if you are the last one.</p></div>
  <div class="d ret"><h3>Return for changes</h3><p>Back to the club to fix. When they send it again, <b>it starts again at the first step.</b></p></div>
  <div class="d bad"><h3>Reject</h3><p>Closed for good. <b>It can't be sent again.</b></p></div>
</div>
<div class="rules">
  <p><b>A comment is required</b> to return or reject. The club sees it. Approving needs no comment.</p>
  <p><b>48 hours per step.</b> A proposal that waits longer is marked <b>Past SLA</b>.</p>
</div>

<h2 class="sec">Which pages you have</h2>
<table class="who">
  <thead><tr><th>Page</th><th>Cultural Society</th><th>Dean</th><th>Management</th><th>See page</th></tr></thead>
  <tbody>
    <tr><td><b>Approvals</b> <span class="muted">· your queue</span></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>5</td></tr>
    <tr><td><b>Venues</b> <span class="muted">· moving clashing events</span></td><td>{DASH}</td><td>{CHECK}</td><td>{DASH}</td><td>9</td></tr>
    <tr><td><b>Calendar</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>10</td></tr>
    <tr><td><b>This semester</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>11</td></tr>
    <tr><td><b>Semester report</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>11</td></tr>
  </tbody>
</table>
""", part=1)

page(f"""
{title("Sign in")}
<p class="lead">Approvers commit college money, so <b>you need a 6-digit code from your authenticator app
as well as your password.</b></p>
<div class="pair">
  <div>
    {fig("signin-link", alt="Sign-in form with the authenticator link")}
    {steps((1, "Type your <b>college email</b> and <b>password</b>, then click <b>I have an authenticator code</b>."))}
  </div>
  <div>
    {fig("signin", alt="Sign-in form with the code filled in")}
    {steps((1, "Type the <b>6-digit code</b> showing in your authenticator app."), (2, "Click <b>Sign in</b>."))}
  </div>
</div>
<p class="note"><b>On the pilot:</b> the password is <b>culturals-demo</b> and any 6-digit code works,
for example <b>123456</b>.</p>

<h2 class="sec">Finding your way</h2>
<div class="split menu-split">
  {fig("dean-menu", cls="menu", alt="The Dean's menu")}
  <div>
    <p>The menu on the left lists your pages. This is the <b>Dean's</b> menu. The Cultural Society and
    Management have the same pages <b>except Venues</b>.</p>
    {steps((1, "<b>Approvals</b>: proposals waiting for you. You start here."),
           (2, "<b>Venues</b>: every booking and any clashes. Dean only."),
           (3, "<b>Calendar</b>: every venue, hour by hour."),
           (4, "<b>This semester</b>: running totals and what needs chasing."),
           (5, "<b>Semester report</b>: attendance and money for the semester."), kind="look")}
  </div>
</div>
""", part=1)

# ================================================================== part 2
page(f"""
{title("Your approvals queue")}
<p class="lead">After signing in you land on your queue: <b>every proposal waiting at your step.</b></p>
{fig("society-queue", alt="Cultural Society approvals queue")}
{steps((1, "Click <b>Review</b> on a proposal to open it."))}
<div class="cols3">
  <div><h2 class="mini">The three figures</h2><p><b>Waiting</b> is how many proposals are with you. <b>Past SLA</b> is how many have waited
  over 48 hours. <b>Requested</b> is the total money they ask for.</p></div>
  <div><h2 class="mini">Tags on a card</h2><p><b class="tag red">Past SLA</b> waited too long.<br><b class="tag red">Venue clash</b> another event wants the same hall.<br>
  <b class="tag amber">Needs VC</b> goes on to the Vice-Chancellor.</p></div>
  <div><h2 class="mini">Only the late ones</h2><p>Turn on <b>Only items past the 48h SLA</b> to see just the overdue proposals.</p></div>
</div>
<p class="note">Same layout for everyone. In your menu it's called <b>Society approvals</b>, <b>Dean approvals</b> or
<b>Above-threshold</b> (Management).</p>
""", part=2)

page(f"""
{title("Review a proposal")}
<p class="lead">Everything you need to decide is on one page. <b>Read it from the top down.</b></p>
<div class="split tall">
  {fig("review-full", crop=(250, 60, 1010, 1264), alt="A proposal at the Cultural Society")}
  <div>
    {steps((1, "<b>The route.</b> Who has signed, who has it now, and who's next. "
               "<b>Not needed</b> means that approver is skipped for this event."),
           (2, "<b>Clash warning.</b> Another event wants the same venue and time. "
               "<b>It can't be approved until one event moves.</b> Click <b>Open the venue calendar</b> to see both."),
           (3, "<b>Budget.</b> Each line the club asks for. The <b>Sanctioned</b> column fills in once approved."),
           (4, "<b>Approval trail.</b> Every earlier decision, with its date and comment."),
           (5, "<b>Your decision.</b> At the bottom. See the next page."), kind="look")}
    <div class="aside"><h2 class="mini">The three boxes under the route</h2><p><b>Requested</b>: the total ask.
    <b>Expected</b>: how many people the club expects. <b>At this gate</b>: how long it has waited for you.
    <b>Red means past 48 hours.</b></p></div>
  </div>
</div>
""", part=2)

page(f"""
{title("Decide")}
<p class="lead">Every approver has the same three buttons. <b>The club sees your decision and your comment.</b></p>
{fig("society-decision", alt="Decision panel for the Cultural Society")}
<div class="cols2">
  {steps((1, "<b>Comment.</b> Optional to approve. <b>Required to return or reject:</b> say what to change."),
         (2, "<b>Return for changes.</b> The club edits and sends it again. It restarts at the first step."))}
  {steps((3, "<b>Reject.</b> Final. The proposal is closed."),
         (4, "<b>Approve.</b> For the Cultural Society the button reads <b>Approve and send to Dean</b>."))}
</div>

<h2 class="sec">The Dean: sanction by line <span class="chip">Dean</span></h2>
<div class="split">
  {fig("dean-decision", alt="The Dean's decision panel with Sanction by line")}
  <div>
    <p>The Dean also decides <b>how much money each line gets</b>. Every line starts at the amount asked for.</p>
    {steps((1, "<b>Type a lower amount</b> to cut a line. You <b>can't raise</b> it above what was asked."),
           (2, "Add a comment if you like. <b>Required</b> to return or reject."),
           (3, "<b>Approve</b> publishes the event, or sends it to the Vice-Chancellor if it's over ₹50,000 or part of a fest."))}
  </div>
</div>
""", part=2)

page(f"""
{title("Management: the last step", "Management")}
<p class="lead">Only the largest proposals reach Management: <b>over ₹50,000, or part of a fest.</b>
By then the Cultural Society (if needed) and the Dean have approved, and <b>the Dean has set the amounts.</b></p>
{fig("vc-proposal", crop=(250, 70, 1030, 450), alt="A proposal that will need the Vice-Chancellor")}
<div class="cols2">
  {steps((1, "<b>The route</b> shows the <b>Vice-Chancellor</b> step whenever an event needs it."), kind="look")}
  {steps((2, "<b>The reason</b> is written under the amount, for example <b>budget over 50000</b>."), kind="look")}
</div>
<h2 class="sec">When it reaches you</h2>
<p>It appears in your <b>Above-threshold</b> queue with the <b class="tag amber">Needs VC</b> tag. Click
<b>Review</b>, check the <b>approval trail</b> (who approved before you, marked <b>MFA</b> when they signed in with
the code), then use the same three buttons as on <b>page 7</b>. When nothing needs you, the queue says
<b>Nothing waiting at this gate</b>.</p>
<p class="key"><b>Approve</b> publishes the event at <b>the amounts the Dean sanctioned</b>.</p>
<h2 class="sec">Looking early</h2>
{fig("vc-full", crop=(262, 884, 1006, 64), alt="Waiting at another step")}
<p class="after">You can open a proposal before it reaches you. The bottom of the page then says <b>which step it is
waiting at</b>, and there are no buttons until it's your turn.</p>
""", part=2)

# ================================================================== part 3
page(f"""
{title("Venues and clashes", "the Dean")}
<p class="lead">When two events want the same hall at the same time, <b>neither can be approved until one moves.</b>
The app never picks a winner: <b>the Dean moves one</b>, and the club sees the reason.</p>
{fig("venues", crop=(250, 60, 1030, 600), alt="The Venues page with a clash")}
{steps((1, "In the red <b>venue clash</b> panel, click <b>Move this one</b> under the event you want to move."))}

<h2 class="sec">Move an event</h2>
<div class="split">
  {fig("venues-move", alt="The move form")}
  <div>
    {steps((1, "Or click <b>Move venue</b> on any booking in the list."),
           (2, "<b>Move to:</b> pick a venue. Free ones say <b>free</b>."),
           (3, "<b>Reason:</b> the club sees this."),
           (4, "Click <b>Move</b>."))}
    <p class="note"><b>Everyone affected is notified:</b> the club's office bearers, the organisers and every
    registered student.</p>
  </div>
</div>
""", part=3)

page(f"""
{title("Calendar")}
<p class="lead">Every venue, in one-hour slots. <b>Use it to check a slot is free</b> before you approve.</p>
{fig("calendar", crop=(250, 196, 1010, 176), alt="Choosing a week and a day")}
<div class="cols2">
  {steps((1, "<b>Previous week</b>, <b>Today</b> and <b>Next week</b> move between weeks."))}
  {steps((2, "Click a <b>day</b>. The number is how many bookings it has. <b>A red dot means a clash.</b>"))}
</div>
<h2 class="sec">Reading a day</h2>
{fig("calendar", crop=(250, 632, 1010, 528), alt="The hour grid on a day with a clash in Seminar Hall A")}
<div class="cols2 tight">
  <div><p><b>Each column is a venue, each row is an hour.</b> A <b>dashed box</b> is a request still waiting for approval.</p>
  <p>A <b>red Clash</b> cell is a slot two bookings share. Clashes are also listed in red above the grid.</p></div>
  <p class="note flat"><b>Only the Dean can move an event</b>, from <b>Venues</b> (page 9).</p>
</div>
""", part=3)

page(f"""
{title("This semester and the report")}
<p class="lead">Two pages for keeping an eye on things. <b>Nothing here needs a decision.</b></p>
<h2>This semester: what needs chasing</h2>
{fig("overview", crop=(250, 60, 1010, 420), alt="This semester")}
<div class="cols2 tight">
  {steps((1, "<b>Open calendar</b> takes you to the clashes."))}
  <p>At the top: <b>pending approvals</b>, <b>past SLA</b>, <b>venue clashes</b> and <b>active clubs</b>.
  Further down: proposals <b>waiting past the SLA</b>, events with <b>missing evidence</b> (no photos or links),
  venue use and <b>inactive clubs</b>.</p>
</div>
<h2 class="sec">Semester report: attendance and money</h2>
<div class="split">
  {fig("report", crop=(250, 60, 1010, 740), alt="Semester report")}
  <div>
    <p><b>Events run, participation and attendance</b>, by club, category and department.</p>
    <p><b>Money:</b> what clubs requested, what was sanctioned, what was spent and what is left.</p>
    {steps((1, "<b>Download CSV</b> to open the figures in a spreadsheet."))}
    <p class="note">Totals only. <b>No individual student's records</b> appear.</p>
  </div>
</div>
""", part=3)

# ================================================================== part 4
GLOSS = [
    ("Where a proposal is", [
        ('<b class="tag amber">At Cultural Society</b>', "Waiting at that step. The route shows which."),
        ('<b class="tag blue">Waiting · 2 days</b>', "How long it has been at the current step."),
        ('<b class="tag grey">Not needed</b>', "This approver is skipped for this event."),
        ('<b class="tag green">Sanctioned · Published</b>', "Every step approved. Students can register."),
    ]),
    ("Warnings", [
        ('<b class="tag red">Past SLA</b>', "Waited more than 48 hours at one step."),
        ('<b class="tag red">Venue clash</b>', "Another event wants the same venue and time. One has to move."),
        ('<b class="tag amber">Needs VC</b>', "Over ₹50,000 or part of a fest, so the Vice-Chancellor approves last."),
    ]),
    ("Bookings", [
        ('<b class="tag blue">Pending request</b>', "Booked for an event still being approved. Holds the slot for now."),
        ('<b class="tag green">Published</b> <b class="tag green">Confirmed</b>', "An approved event with a confirmed booking."),
    ]),
    ("In the approval trail", [
        ('<b class="tag green">Approved</b>', "That approver said yes. Their comment is underneath."),
        ('<b class="tag green">MFA</b>', "They signed in with the 6-digit code."),
    ]),
]
gloss_html = "".join(f'<h2 class="sec">{g}</h2><dl class="gloss">'
                     + "".join(f"<dt>{t}</dt><dd>{d}</dd>" for t, d in rows) + "</dl>" for g, rows in GLOSS)
page(f"""
{title("Tags and statuses")}
<p class="lead">The small coloured labels you see on cards and pages, and what they mean.</p>
{gloss_html}
""", part=4)

page(f"""
{title("Quick answers")}
<dl class="qa">
  <dt>A proposal is marked Past SLA.</dt><dd>It has waited <b>more than 48 hours</b> at one step. Nothing is broken; it just needs attention.</dd>
  <dt>I can't approve: there's a venue clash.</dt><dd>One of the two events has to move first. <b>The Dean</b> moves it from <b>Venues</b>.</dd>
  <dt>I returned a proposal. What now?</dt><dd>The club edits it and sends it again. <b>It starts from the first step</b>, so earlier approvers see it again.</dd>
  <dt>Can a rejected proposal come back?</dt><dd><b>No.</b> The club has to propose a new event.</dd>
  <dt>Why does this event need the Vice-Chancellor?</dt><dd>Its budget is <b>over ₹50,000</b>, or it's <b>part of a fest</b>. The proposal page says which.</dd>
  <dt>Can the Dean give more than the club asked?</dt><dd><b>No.</b> A line can be lowered, never raised.</dd>
  <dt>Where do I get the 6-digit code?</dt><dd>From the <b>authenticator app</b> on your phone. Type the code showing at that moment.</dd>
</dl>

<div class="feedback">
  <h2>Tell us what to improve</h2>
  <p>This is a pilot, built for you. If a page is confusing, a step is missing, or the students' side could
  work better, <b>note the page and what you expected</b>, and pass it on to the Culturals team.</p>
</div>
""", part=4)

CSS = f"""
@font-face {{ font-family: 'Jakarta'; src: url('{FONT.as_uri()}') format('woff2'); font-weight: 200 800; }}
@page {{ size: A4; margin: 0; }}
:root {{ --ink:#0e1a2f; --muted:#4d5970; --navy:#0b1f4d; --blue:#1b5fe4; --blue-soft:#e3ecff; --line:#dde2ec;
  --bg:#f3f5fa; --amber:#f5a300; --amber-ink:#3d2600; --look:#2563eb; --ok:#13773a; --bad:#c21d2c; --warn:#985400; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
body {{ font-family: 'Jakarta', system-ui, sans-serif; color: var(--ink); font-size: 10pt; line-height: 1.5; background: #8a93a3; }}
::selection {{ background: var(--blue-soft); }}
b {{ font-weight: 700; }}
.page {{ width: 210mm; height: 297mm; padding: 17mm 20mm 20mm 17mm; position: relative; background: #fff;
  overflow: hidden; page-break-after: always; margin: 0 auto 8mm; }}
@media print {{ body {{ background: none; }} .page {{ margin: 0; }} }}
footer {{ position: absolute; left: 17mm; right: 20mm; bottom: 9mm; display: flex; justify-content: space-between;
  font-size: 7.5pt; color: var(--muted); border-top: .4pt solid var(--line); padding-top: 2.5mm; }}
footer span:last-child {{ font-weight: 800; color: var(--navy); }}

/* thumb index: one tab per part, stepping down the right edge like a printed manual */
.tab {{ position: absolute; right: 0; width: 9mm; height: 47mm; background: var(--navy); color: #fff;
  border-radius: 2mm 0 0 2mm; display: flex; flex-direction: column; align-items: center; padding-top: 2.5mm; gap: 2mm; }}
.tab b {{ font-size: 10pt; }}
.tab span {{ writing-mode: vertical-rl; font-size: 7pt; font-weight: 700; letter-spacing: .02em; white-space: nowrap; }}

/* hierarchy: page title > section (h2) > block (h3) > steps */
.title {{ display: flex; align-items: baseline; justify-content: space-between; gap: 6mm; margin-bottom: 2.5mm; }}
h1 {{ font-size: 23pt; line-height: 1.12; letter-spacing: -.025em; color: var(--navy); font-weight: 800; text-wrap: balance; }}
h1.solo {{ margin-bottom: 6mm; }}
.for {{ flex: none; font-size: 8pt; color: var(--muted); border: .6pt solid var(--line); border-radius: 10mm; padding: .8mm 3mm; }}
.for b {{ color: var(--navy); }}
h2 {{ font-size: 12.5pt; color: var(--navy); font-weight: 750; margin: 6mm 0 2.5mm; letter-spacing: -.01em; }}
h2.sec {{ margin-top: 8mm; padding-top: 5mm; border-top: .6pt solid var(--line); }}
h3, h2.mini {{ font-size: 10pt; font-weight: 750; color: var(--navy); margin: 0 0 1mm; letter-spacing: 0; }}
.chip {{ font-size: 7.5pt; font-weight: 700; color: var(--navy); background: var(--blue-soft); padding: .6mm 2.4mm;
  border-radius: 10mm; vertical-align: middle; margin-left: 1.5mm; position: relative; top: -.4mm; }}
p + p {{ margin-top: 2mm; }}
.lead {{ font-size: 11.5pt; line-height: 1.45; color: var(--muted); max-width: 150mm; margin-bottom: 5mm; }}
.lead b {{ color: var(--ink); }}
.muted {{ color: var(--muted); font-weight: 400; }}
.small {{ font-size: 8.5pt; margin-top: 3mm; }}
.note {{ margin-top: 4mm; padding: 3mm 4mm; background: var(--bg); border-radius: 2.5mm; font-size: 9.3pt; }}
.key {{ margin-top: 3mm; padding: 3mm 4mm; background: #e7f6ec; color: #0c4d26; border-radius: 2.5mm; }}

/* screenshots (dark theme) on white paper */
.shot {{ margin: 0; }}
.frame {{ position: relative; }}
.clip {{ position: absolute; inset: 0; overflow: hidden; border-radius: 2.2mm; background: #0d1219;
  box-shadow: 0 1.2mm 3.5mm rgba(14,26,47,.18), 0 .2mm .6mm rgba(14,26,47,.12); }}
.clip img {{ position: absolute; display: block; height: auto; max-width: none; }}
.ring {{ position: absolute; border: .75mm solid var(--amber); border-radius: 1.6mm; }}
.badge {{ display: inline-grid; place-items: center; width: 5.6mm; height: 5.6mm; border-radius: 50%;
  background: var(--amber); color: var(--amber-ink); font-size: 8.5pt; font-weight: 800; line-height: 1;
  box-shadow: 0 .3mm .8mm rgba(0,0,0,.35); }}
.ring > .badge {{ position: absolute; }}
.ring > .at-l {{ right: 100%; top: 50%; margin: -2.8mm 1.2mm 0 0; }}
.ring > .at-r {{ left: 100%; top: 50%; margin: -2.8mm 0 0 1.2mm; }}
.ring > .at-b {{ top: 100%; left: 50%; margin: 1.2mm 0 0 -2.8mm; }}
.leader {{ position: absolute; height: 0; border-top: .5mm solid var(--look); margin-top: -.25mm; }}
.leader::after {{ content: ''; position: absolute; top: -1.15mm; width: 1.8mm; height: 1.8mm; border-radius: 50%;
  background: var(--look); box-shadow: 0 0 0 .4mm #fff; }}
.leader.side-l::after {{ right: -.9mm; }} .leader.side-r::after {{ left: -.9mm; }}
.pin {{ position: absolute; display: grid; place-items: center; width: 5.4mm; height: 5.4mm; margin-top: -2.7mm;
  border-radius: 50%; background: var(--look); color: #fff; font-size: 8.3pt; font-weight: 800; line-height: 1;
  box-shadow: 0 0 0 .6mm #fff, 0 .4mm 1.2mm rgba(14,26,47,.3); z-index: 2; }}
.pin.side-l {{ margin-left: -7mm; }} .pin.side-r {{ margin-left: 1.6mm; }}
.badge.inline, .pin.inline, .pin.static {{ position: static; margin: 0; flex: none; }}

/* steps */
.steps {{ list-style: none; display: grid; gap: 2.4mm; margin-top: 4mm; }}
.steps li {{ display: flex; gap: 2.8mm; align-items: flex-start; }}
.shot + .steps {{ margin-top: 4.5mm; }}

/* layouts */
.pair {{ display: grid; grid-template-columns: 1fr 1fr; gap: 9mm; align-items: start; }}
.pair .shot {{ width: 80%; }}
.split {{ display: grid; grid-template-columns: 1.25fr 1fr; gap: 8mm; align-items: start; }}
.split > div > .steps:first-child {{ margin-top: 0; }}
.split.tall {{ grid-template-columns: 1.55fr 1fr; gap: 11mm; }}
.split.cal {{ grid-template-columns: 1.4fr 1fr; }}
.split.menu-split {{ grid-template-columns: 44mm 1fr; gap: 9mm; }}
.cols2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; }}
.cols2.tight {{ margin-top: 4mm; align-items: start; }}
.cols2.tight > .steps {{ margin-top: 0; }}
.cols3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; margin-top: 7mm; padding-top: 5mm;
  border-top: .6pt solid var(--line); font-size: 9.3pt; }}
.after {{ margin-top: 4mm; }}
.note.flat {{ margin-top: 0; align-self: start; }}
.aside {{ margin-top: 6mm; padding-top: 4mm; border-top: .6pt solid var(--line); font-size: 9.3pt; }}
.tag {{ display: inline-block; font-size: 7.6pt; font-weight: 700; padding: .3mm 1.8mm; border-radius: 10mm; margin: .3mm .6mm .3mm 0; white-space: nowrap; }}
.tag.red {{ background: #fde4e6; color: var(--bad); }}
.tag.amber {{ background: #fff0d4; color: var(--warn); }}
.tag.blue {{ background: var(--blue-soft); color: #0b3a9e; }}
.tag.green {{ background: #ddf4e5; color: var(--ok); }}
.tag.grey {{ background: #eceff4; color: var(--muted); }}

/* contents */
.short {{ background: var(--navy); color: #fff; border-radius: 3mm; padding: 5mm 6mm 6mm; }}
.short h2 {{ color: #fff; margin: 0 0 3.5mm; }}
.strip {{ list-style: none; display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; counter-reset: s; }}
.strip li {{ counter-increment: s; border-top: .5mm solid rgba(255,255,255,.35); padding-top: 2.5mm; }}
.strip li::before {{ content: counter(s); display: block; font-size: 15pt; font-weight: 800; color: var(--amber); line-height: 1.1; }}
.strip b {{ display: block; font-size: 10pt; }}
.strip span {{ display: block; font-size: 8.3pt; color: #c3cfea; line-height: 1.35; margin-top: .6mm; }}
.toc {{ margin-top: 7mm; display: grid; gap: 3.5mm; }}
.toc-part {{ display: grid; grid-template-columns: 11mm 1fr; gap: 4mm; }}
.toc-num {{ width: 9mm; height: 9mm; border-radius: 2mm; background: var(--navy); color: #fff; font-weight: 800;
  display: grid; place-items: center; font-size: 11pt; }}
.toc-part h2 {{ margin: 1mm 0 1.5mm; }}
.toc-row {{ display: flex; align-items: baseline; gap: 2mm; padding: .9mm 0; font-size: 10pt; }}
.toc-row i {{ flex: 1; border-bottom: .6pt dotted #b7bfcc; transform: translateY(-1mm); }}
.toc-row b {{ color: var(--navy); min-width: 6mm; text-align: right; }}
.howto {{ margin-top: 6mm; padding-top: 5mm; border-top: .6pt solid var(--line); }}
.howto h2 {{ margin-top: 0; }}
.legend {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }}
.legend > div {{ display: flex; gap: 4mm; align-items: center; font-size: 9.3pt; }}
.ring.demo {{ position: relative; flex: none; width: 15mm; height: 7mm; display: block; margin-left: 7mm; }}

/* part 1 */
.route {{ display: flex; align-items: stretch; gap: 1.2mm; }}
.stop {{ flex: 1; padding: 3mm 3mm 3.2mm; border-radius: 2.5mm; background: var(--bg); }}
.stop b {{ display: block; color: var(--navy); font-size: 9.6pt; }}
.stop span {{ display: block; font-size: 8pt; color: var(--muted); line-height: 1.35; margin-top: .8mm; }}
.stop span b {{ display: inline; font-size: inherit; }}
.stop.strong {{ background: var(--blue-soft); }}
.stop.end {{ background: var(--navy); }} .stop.end b, .stop.end span {{ color: #fff; }}
.arrow {{ width: 4mm; flex: none; align-self: center; fill: none; stroke: var(--muted); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }}
.decisions {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }}
.d {{ padding: 3.5mm 4mm; border-radius: 2.5mm; font-size: 9.3pt; }}
.d.ok {{ background: #e7f6ec; }} .d.ok h3 {{ color: var(--ok); }}
.d.ret {{ background: var(--blue-soft); }} .d.ret h3 {{ color: var(--blue); }}
.d.bad {{ background: #fdeaec; }} .d.bad h3 {{ color: var(--bad); }}
.rules {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 4mm; font-size: 9.3pt; }}
.who {{ width: 100%; border-collapse: collapse; font-size: 9.3pt; }}
.who th {{ text-align: left; font-size: 8pt; color: var(--muted); font-weight: 700; padding: 0 0 1.5mm; border-bottom: .6pt solid var(--line); }}
.who th:not(:first-child), .who td:not(:first-child) {{ text-align: center; width: 24mm; }}
.who td:last-child {{ font-weight: 700; color: var(--navy); }}
.who td {{ padding: 1.8mm 0; border-bottom: .4pt solid var(--line); }}
.ic {{ width: 4.2mm; height: 4.2mm; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vertical-align: middle; }}
.ic.ok {{ stroke: var(--ok); }} .ic.no {{ stroke: #a6afbf; }}

/* part 4 */
.gloss {{ display: grid; grid-template-columns: 58mm 1fr; column-gap: 6mm; font-size: 9.6pt; }}
.gloss dt, .gloss dd {{ padding: 1.9mm 0; border-bottom: .4pt solid var(--line); }}
.qa {{ display: grid; grid-template-columns: 60mm 1fr; column-gap: 7mm; }}
.qa dt {{ font-weight: 750; color: var(--navy); padding: 3.2mm 0; border-top: .5pt solid var(--line); }}
.qa dd {{ padding: 3.2mm 0; border-top: .5pt solid var(--line); }}
.feedback {{ margin-top: 10mm; padding: 6mm 7mm; border-radius: 3mm; background: var(--blue-soft); }}
.feedback h2 {{ margin-top: 0; }}

/* cover */
.cover {{ background: var(--navy); color: #fff; padding: 20mm 18mm; }}
.wordmark {{ font-size: 15pt; font-weight: 800; letter-spacing: -.01em; }}
.cover-kind {{ font-size: 9pt; color: #b9c6e4; }}
.cover-main {{ margin-top: 26mm; }}
.cover h1 {{ color: #fff; font-size: 40pt; letter-spacing: -.03em; line-height: 1.02; margin-bottom: 6mm; }}
.cover-sub {{ font-size: 13pt; line-height: 1.45; color: #c9d5ef; max-width: 140mm; }}
.cover-sub b {{ color: #fff; }}
.cover-shot {{ position: absolute; left: 18mm; right: -30mm; top: 132mm; }}
.cover-shot .clip {{ border: .5pt solid rgba(255,255,255,.22); border-radius: 3mm; box-shadow: none; }}
.cover-shot .pin, .cover-shot .leader {{ display: none; }}
.cover-foot {{ position: absolute; left: 0; right: 0; bottom: 0; padding: 7mm 18mm 9mm; background: var(--navy);
  display: flex; gap: 16mm; font-size: 10pt; }}
.cover-foot::before {{ content: ''; position: absolute; left: 0; right: 0; bottom: 100%; height: 22mm;
  background: linear-gradient(to bottom, rgba(11,31,77,0), var(--navy)); }}
.cover-foot .k {{ display: block; font-size: 7.5pt; color: #9fb0d6; font-weight: 600; margin-bottom: .6mm; }}
"""

html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Culturals: Guide for approvers</title><style>{CSS}</style></head><body>{''.join(pages)}</body></html>"""
(HERE / "guide.html").write_text(html, encoding="utf-8")
print("pages:", len(pages))
