"""Builds the club officers' guide: python3 build.py && node render.mjs

Same layout as the approver guide (docs/approver-guide): fixed A4 pages of HTML, with amber
rings for "click here" and blue pins for "look here". The page is written to ../index.html so
GitHub Pages serves it at /user-guide/officers/, and render.mjs prints the same file to PDF.
Screenshots come from capture.mjs (a local stack seeded by seed_demo + seed_guide.py).
"""
import json
import shutil
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE.parent
REPO = HERE.parents[3]
SHOTS = OUT / "shots"
FONT_SRC = REPO / "clubs-and-culturals-platform/app/frontend/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2"
FONT = OUT / "fonts" / "plus-jakarta-sans.woff2"
if FONT_SRC.exists():
    FONT.parent.mkdir(exist_ok=True)
    shutil.copyfile(FONT_SRC, FONT)
BOXES = json.loads((SHOTS / "boxes.json").read_text())

# Per-mark tweaks: "at" puts a ring's badge l/r/t/b of the ring; "side" hangs a pin off the l/r edge
# of the screenshot; "n" renumbers; x/y/w/h retarget the mark; "drop" leaves it out.
OV = {
    "go-live": {1: {"at": "l"}, 2: {"at": "t"}},
    "scan": {5: {"side": "r"}, 6: {"side": "r"}},
    "calendar": {2: {"at": "b"}, 3: {"at": "b"}},
    "events": {2: {"drop": True}},
    "roster": {3: {"at": "t"}, 4: {"side": "r"}},
    "join": {3: {"at": "t"}, 4: {"at": "l"}},
    "budget-edit": {5: {"at": "b"}},
    "new-event": {5: {"at": "t"}, 6: {"at": "r"}, 7: {"at": "r"}, 8: {"at": "r"}},
    "budget-sanctioned": {1: {"side": "l"}, 2: {"side": "r"}},
}
EXTRA = {}


def fig(name, crop=None, cls="", alt=""):
    """A screenshot with its marks. crop = (x, y, w, h) in the screen's CSS pixels."""
    d = BOXES[name]
    marks_in = [{**m, **OV.get(name, {}).get(m["n"], {})} for m in d["marks"]] + EXTRA.get(name, [])
    marks_in = [m for m in marks_in if not m.get("drop")]
    W, H = d["w"], d["h"]
    cx, cy, cw, ch = crop or (0, 0, W, H)
    img = (f'<img src="shots/{name}.png" alt="{alt}" style="width:{W / cw * 100:.4f}%;'
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


def title(text, who="all office bearers"):
    return f'<header class="title"><h1>{text}</h1><span class="for">For <b>{who}</b></span></header>'


CHECK = '<svg viewBox="0 0 16 16" class="ic ok" aria-label="yes"><path d="M3.5 8.5l3 3 6-7" /></svg>'
DASH = '<svg viewBox="0 0 16 16" class="ic no" aria-label="no"><path d="M5 8h6" /></svg>'
ARROW = '<svg viewBox="0 0 16 16" class="arrow" aria-hidden="true"><path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" /></svg>'

PARTS = {1: "Getting started", 2: "Proposing an event", 3: "Approval and changes", 4: "Budget",
         5: "Event day and after", 6: "Members and help"}
pages = []


def page(body, part=None, cls=""):
    n = len(pages) + 1
    extra = ""
    if part:
        extra = (f'<div class="tab" style="top:{22 + (part - 1) * 43}mm;height:41mm"><b>{part}</b><span>{PARTS[part]}</span></div>'
                 f'<footer><span>Part {part} · {PARTS[part]}</span><span>{n}</span></footer>')
    elif n > 1:
        extra = f'<footer><span>Culturals · Guide for club officials</span><span>{n}</span></footer>'
    pages.append(f'<section class="page {cls}">{body}{extra}</section>')


MAIN = (250, 60, 1020, 740)  # a viewport shot without the side menu and the top bar

# ================================================================== cover
page(f"""
<div class="cover-top">
  <div class="wordmark">Culturals</div>
  <div class="cover-kind">Clubs &amp; events at your college</div>
</div>
<div class="cover-main">
  <h1>Guide for club officials</h1>
  <p class="cover-sub">For every club's <b>President</b>, <b>Vice-President</b>, <b>Secretary</b> and
  <b>Treasurer</b>. Every page you use, step by step: proposing, budgets, approvals, the door and the report.</p>
</div>
<div class="cover-shot">{fig("events", crop=(250, 60, 1020, 830))}</div>
<div class="cover-foot">
  <div><span class="k">Open the app</span><b>culturals-clubs-events.vercel.app</b></div>
  <div><span class="k">Edition</span><b>Pilot · November 2026</b></div>
</div>
""", cls="cover")

# ================================================================== contents
TOC = [
    (1, [("Who does what", 3), ("Sign in and find your way", 4)]),
    (2, [("Club events", 5), ("Propose a new event", 6), ("The budget and the proposal document", 7)]),
    (3, [("Following your proposal", 8), ("Notifications", 9), ("When an approver changes something", 10),
         ("Returned for changes", 11), ("Rejected", 12), ("The calendar", 13)]),
    (4, [("Build the budget", 14), ("After approval: spend and receipts", 15)]),
    (5, [("Open the door", 16), ("Check people in", 17), ("The post-event report", 18)]),
    (6, [("Members, roles and join requests", 19), ("Tags and statuses", 20), ("Quick answers", 21)]),
]
toc_html = "".join(
    f'<div class="toc-part"><div class="toc-num">{p}</div><div><h2>{PARTS[p]}</h2>'
    + "".join(f'<div class="toc-row"><span>{t}</span><i></i><b>{pg}</b></div>' for t, pg in rows)
    + "</div></div>" for p, rows in TOC)
page(f"""
<h1 class="solo">Contents</h1>
<div class="toc">{toc_html}</div>
<div class="howto">
  <h2>How to read the pictures</h2>
  <div class="legend">
    <div><span class="ring demo"><b class="badge at-l">1</b></span><p><b>Amber ring: click or type here.</b> The number matches the step next to the picture.</p></div>
    <div><b class="pin static">1</b><p><b>Blue dot: look here.</b> It points out part of the page. Nothing to click. Pictures are from the pilot, with made-up names.</p></div>
  </div>
</div>
""")

# ================================================================== part 1
page(f"""
{title("Who does what")}
<p class="lead">A club runs an event in four stages. <b>Each stage leaves a record</b>, so the semester
report is built from the app and nobody collects it by hand.</p>
<div class="route">
  <div class="stop"><b>Propose</b><span>event, proposal document, budget</span></div>{ARROW}
  <div class="stop strong"><b>Approval</b><span>Cultural Society, Dean, sometimes the Vice-Chancellor</span></div>{ARROW}
  <div class="stop"><b>Published</b><span>students register and get a pass</span></div>{ARROW}
  <div class="stop"><b>Event day</b><span>passes scanned at the door</span></div>{ARROW}
  <div class="stop end"><b>Reported</b><span>report in, bills attached, budget settled</span></div>
</div>

<h2 class="sec">What each office bearer can do</h2>
<table class="who">
  <thead><tr><th>Task</th><th>President</th><th>Vice-President</th><th>Secretary</th><th>Treasurer</th><th>See page</th></tr></thead>
  <tbody>
    <tr><td><b>Propose an event</b> <span class="muted">· and send it for approval</span></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>6</td></tr>
    <tr><td><b>Attach the proposal document</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>7</td></tr>
    <tr><td><b>Build the budget</b> <span class="muted">· lines or an uploaded sheet</span></td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>{CHECK}</td><td>14</td></tr>
    <tr><td><b>Enter spend, attach bills, settle</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>{CHECK}</td><td>15</td></tr>
    <tr><td><b>Go live and close the event</b> <span class="muted">· the post-event report</span></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>18</td></tr>
    <tr><td><b>Scan passes at the door</b> <span class="muted">· core team too</span></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>16</td></tr>
    <tr><td><b>See the calendar, book the Wednesday open block</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>{DASH}</td><td>13</td></tr>
    <tr><td><b>Assign roles, accept join requests</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>{DASH}</td><td>19</td></tr>
  </tbody>
</table>
<div class="rules">
  <p><b>Nobody in the club approves the club's own proposal</b>, and nobody in the club can move an event's
  time or venue once it is sent. The approvers do that, and you are told when they do.</p>
  <p><b>Plain members</b> see the club's events and roster. They never see budgets or the proposal document.</p>
</div>
""", part=1)

page(f"""
{title("Sign in and find your way")}
<p class="lead">Use your <b>college email and password</b>. Office bearers do not need an authenticator code;
only approvers do.</p>
<div class="split menu-split">
  {fig("signin", alt="The sign-in form")}
  <div>
    {steps((1, "Type your <b>institutional email</b>."), (2, "Type your <b>password</b>."), (3, "Click <b>Sign in</b>."))}
    <p class="note"><b>On the pilot:</b> every account's password is <b>culturals-demo</b>. The sign-in page lists
    one pilot account per role.</p>
  </div>
</div>

<h2 class="sec">Your menu</h2>
<div class="split menu-split">
  {fig("menu", crop=(0, 370, 240, 420), cls="menu", alt="The club part of a President's menu")}
  <div>
    <p>The <b>Club</b> part of the menu is what this guide covers. This is a <b>President's</b> menu;
    you see only the pages your role has.</p>
    {steps((1, "<b>Club events</b>: every event your club has proposed. You will use this most."),
           (2, "<b>New event</b>: propose one."),
           (3, "<b>Budget</b>: every budget, from draft to settled. Not for the Secretary."),
           (4, "<b>Members &amp; roles</b>: the roster. Presidents and Vice-Presidents assign roles."),
           (5, "<b>Join requests</b>: students waiting to join. President and Vice-President."),
           (6, "<b>Scan station</b>: the door on event day."),
           (7, "<b>Calendar</b>: every venue booking. President and Vice-President."), kind="look")}
  </div>
</div>
<p class="note">The pages above <b>Club</b> (Feed, What's on, My passes, Profile QR, Clubs) are the student pages
everyone has.</p>
""", part=1)

# ================================================================== part 2
page(f"""
{title("Club events")}
<p class="lead">Every event your club has proposed, newest first.</p>
<div style="width:86%;margin:0 auto">{fig("events", crop=(250, 60, 1020, 840), alt="Club events for the Music Club")}</div>
<div class="cols2">
  {steps((1, "<b>New event</b> starts a proposal."),
         (3, "<b>Send for approval</b> appears on a draft or a returned proposal once it has a budget."))}
  {steps((4, "<b>Open</b> shows the event's page: its approval trail, budget, proposal document and report."))}
</div>
<div class="cols3">
  <div><h2 class="mini">The two labels on a card</h2><p>The first is the <b>event's status</b> (Draft, Awaiting approval,
  Published…). The second is the <b>budget's stage</b> (With the Cultural Society, Sanctioned, Settled…).</p></div>
  <div><h2 class="mini">The tabs</h2><p><b>Drafts</b> are not sent yet. <b>With approvers</b> are waiting for a decision.
  <b>Upcoming</b> are approved. <b>Past</b> have run.</p></div>
  <div><h2 class="mini">The bar</h2><p>How many students have registered, out of the capacity, and what was requested.</p></div>
</div>

<h2 class="sec">Wednesday open block <span class="chip">President · Vice-President</span></h2>
<p>The card at the top of the page. Choose a <b>venue</b> for the 3–4 pm or the 4–5 pm hour and click <b>Book</b>:
it is yours at once. <b>No proposal, no budget, no approval.</b> First come, first served, and <b>one slot per
club each Wednesday</b>.</p>
""", part=2)

page(f"""
{title("Propose a new event")}
<p class="lead">One form. <b>Fill it top to bottom, attach the proposal, choose how the budget comes in,</b>
then send it or save it as a draft.</p>
<div class="split tall">
  {fig("new-event", crop=(250, 60, 1020, 819), alt="The New event form, filled in")}
  <div>
    {steps((1, "<b>Title</b>, and the kind of event."),
           (2, "<b>Venue.</b> Each option shows how many it seats."),
           (3, "<b>Start date and hours.</b> Venues are booked in whole hours."),
           (4, "<b>Capacity</b> fills in from the venue you chose. <b>Lower it</b> if you are admitting fewer."),
           (5, "<b>Budget.</b> Pick a template, <b>Upload the budget sheet (CSV)</b>, or leave it for the Treasurer."),
           (6, "<b>Budget sheet.</b> Appears when you choose to upload."),
           (7, "<b>Proposal document.</b> A PDF or Word file, up to 10 MB."),
           (8, "<b>Propose and send</b> sends it for approval. With no budget chosen the button reads <b>Save draft</b>."))}
    <div class="aside"><h2 class="mini">If two events want the same hall</h2><p>A slot another club has <b>already
    been approved for</b> is refused. A slot another club has only <b>asked for</b> is allowed, and the approvers
    see the clash. One of the two will be moved.</p></div>
  </div>
</div>
""", part=2)

page(f"""
{title("The budget and the proposal document")}
<p class="lead">A proposal is sent with <b>a document that explains it</b> and <b>a budget that prices it</b>.</p>

<h2 class="mini">Three ways to give the budget</h2>
<div class="decisions">
  <div class="d ok"><h3>A template</h3><p>Choose <b>Performance, Workshop, Competition</b> or <b>Exhibition</b>. The lines are
  priced from your expected attendance. Fastest.</p></div>
  <div class="d ret"><h3>Upload the budget sheet</h3><p>A CSV with the columns <b>head, amount</b> (and optionally
  <b>basis</b>). <b>Download the budget template</b> gives you the layout. President, Vice-President, Treasurer.</p></div>
  <div class="d"><h3>The Treasurer enters it</h3><p>Choose <b>None</b>. The event is saved as a <b>draft</b> and the
  Treasurer adds the lines on the Budget page (page 14).</p></div>
</div>

<h2 class="sec">Check the sheet before you send it</h2>
<p>Click <b>Preview the sheet</b> to read your CSV as a table before anything is uploaded.</p>
{fig("sheet-preview", crop=(0, 560, 1280, 230), alt="Preview of a budget sheet")}
<div class="cols2">
  {steps((1, "Each row becomes one budget line."), kind="look")}
  <p class="note"><b>Every row is checked.</b> If one row is wrong, nothing is imported, the event is kept as a
  draft, and you are told which row to fix.</p>
</div>

<h2 class="sec">The proposal document</h2>
<div class="cols3">
  <div><h2 class="mini">Who reads it</h2><p>Your club's office bearers, the <b>Cultural Society</b>, the <b>Dean</b> and the
  <b>Vice-Chancellor</b>. <b>Students and plain members never see it.</b></p></div>
  <div><h2 class="mini">Reading it in the app</h2><p>Click the file name on the event page. A <b>PDF</b> opens in the
  page; a <b>Word .docx</b> shows as its text. An old <b>.doc</b> can only be downloaded.</p></div>
  <div><h2 class="mini">Changing it</h2><p>Replace it while the event is a <b>draft</b> or <b>returned</b>. Once sent, it is
  <b>locked</b>, so approvers read what you sent.</p></div>
</div>
""", part=2)

# ================================================================== part 3
page(f"""
{title("Following your proposal")}
<p class="lead">Open the event from <b>Club events</b>. <b>The page tells you where the proposal is and what
happened to it.</b></p>
{fig("event-top", crop=MAIN, alt="An event that is awaiting approval")}
{steps((1, "<b>Status.</b> <b>Awaiting approval</b> means an approver has it."),
       (2, "<b>When and where.</b> If an approver moved it, the old value is struck through (page 10)."),
       (3, "<b>Open budget</b> shows every line and what was sanctioned."),
       (4, "<b>Proposal document.</b> Click the file name to read it."), kind="look")}

<h2 class="sec">The approval route</h2>
<div class="route">
  <div class="stop"><b>Club</b><span>you send it</span></div>{ARROW}
  <div class="stop"><b>Cultural Society</b><span>its Secretary or Vice-Secretary</span></div>{ARROW}
  <div class="stop strong"><b>Dean</b><span>every event; may lower a budget line</span></div>{ARROW}
  <div class="stop"><b>Vice-Chancellor</b><span>only over <b>₹50,000</b> or part of a fest</span></div>{ARROW}
  <div class="stop end"><b>Published</b><span>students can register</span></div>
</div>
<div class="rules">
  <p><b>Each approver can approve, return for changes, or reject.</b> To return or reject they must write a
  comment, and you see it.</p>
  <p><b>While it is with an approver you cannot edit it.</b> That way they approve exactly what they read.</p>
</div>
""", part=3)

page(f"""
{title("Notifications")}
<p class="lead">Every decision and every change an approver makes <b>reaches you twice: in the app, and by email</b>
to your institutional address.</p>
<div class="split menu-split">
  {fig("bell", crop=(120, 0, 200, 64), alt="The bell in the top bar")}
  {steps((1, "The <b>bell</b> in the top bar shows how many you have not read. Click it."))}
</div>
{fig("notifications", crop=MAIN, alt="The Notifications page")}
{steps((1, "<b>Colour key.</b> Violet <b>A</b> is a change by the Cultural Society or the Dean. Teal <b>M</b> is the Vice-Chancellor."),
       (2, "<b>Filters.</b> <b>Decisions</b>, or only <b>Changes by approvers</b>."),
       (3, "<b>Venue or time changed.</b> The new slot, the old one, the reason, and who moved it."),
       (4, "<b>Rejected</b>, with the approver's comment."),
       (5, "<b>Returned for changes</b>, with what to fix."), kind="look")}
<p class="note"><b>New</b> marks what you had not read. <b>Open it</b> on a notification takes you to the event.
Decisions go to the President, Vice-President and Treasurer; a move also goes to the Secretary and to
every student who registered.</p>
""", part=3)

page(f"""
{title("When an approver changes something")}
<p class="lead">Approvers can change two things: <b>when and where</b> the event is, and <b>how much money</b> it
gets. <b>The old value is struck through and the new one is in the approver's colour.</b></p>

<h2 class="mini">A new venue or time <span class="chip">Cultural Society officers · Dean</span></h2>
<div class="split">
  {fig("event-moved", alt="An event page after the Cultural Society moved it")}
  <div>
    {steps((1, "<b>When and where</b> shows the old slot struck out and the new one beside it."),
           (2, "<b>Changes by approvers</b> lists each change: what it was, what it is now."),
           (3, "<b>The reason</b> the approver gave."), kind="look")}
    <p class="note">The Society's Secretary and Vice-Secretary can move an event <b>while it is with the
    Society</b>. After that, only the <b>Dean</b> can. Students who registered are told too.</p>
  </div>
</div>

<h2 class="sec">A smaller budget <span class="chip">Dean</span></h2>
<div class="split">
  {fig("approved-trail", crop=(0, 290, 996, 368), alt="An approval trail where the Dean lowered the budget")}
  <div>
    {steps((1, "<b>Cultural Society</b> approved, with a comment."),
           (2, "<b>The Dean lowered the total.</b> Struck figure: what you asked. Violet figure: what you have."),
           (3, "<b>Vice-Chancellor</b> approved. Their mark is the teal <b>M</b>."), kind="look")}
    <p class="note">The Dean can <b>lower a line, never raise it</b>. You get a notification naming each line
    that changed. The budget page shows the lines (page 15).</p>
  </div>
</div>
""", part=3)

page(f"""
{title("Returned for changes")}
<p class="lead">An approver wants something fixed. <b>The proposal is yours again: edit it and send it back.</b></p>
{fig("returned-top", crop=MAIN, alt="A returned proposal")}
<div class="cols2">
  {steps((1, "<b>Returned for changes</b>: the status."),
         (3, "<b>Open budget</b> to change the lines. Every field is open again."))}
  {steps((4, "<b>Replace</b> the proposal document if the comment asks for it."),
         (5, "<b>Send for approval</b> when it is fixed."))}
</div>

<h2 class="sec">What they asked for</h2>
<div class="split">
  {fig("returned-trail", alt="The approval trail of a returned proposal")}
  <div>
    {steps((1, "<b>The approver's comment</b> is under their name in the <b>Approval trail</b>."), kind="look")}
    <p class="note"><b>When you send it again it starts at the first step</b>, so earlier approvers see the
    changed version. The trail keeps the returned request and adds the new one below it.</p>
  </div>
</div>
""", part=3)

page(f"""
{title("Rejected")}
<p class="lead"><b>A rejection is final.</b> The proposal cannot be edited or sent again. To try again, propose a
new event.</p>
<div class="split">
  {fig("rejected", alt="A proposal rejected by the Cultural Society")}
  <div>
    {steps((1, "<b>Why.</b> The approver's comment is required, and it is shown here."), kind="look")}
    {steps((2, "<b>Delete</b> removes the rejected proposal from your list. Optional."))}
    <p class="note">The event's status and budget both read <b>Rejected</b>. The venue slot is released at
    once, so another club can book it.</p>
  </div>
</div>

<h2 class="sec">Rejected at a later step</h2>
<div class="split">
  {fig("vc-rejected-trail", crop=(0, 290, 996, 339), alt="A proposal the Dean trimmed and the Vice-Chancellor rejected")}
  <div>
    <p>Any approver on the route can reject. Here the Cultural Society and the Dean approved, and the
    <b>Vice-Chancellor</b> rejected.</p>
    {steps((1, "The Dean's change to the budget still shows, in violet."),
           (2, "The Vice-Chancellor's reason."), kind="look")}
  </div>
</div>
<div class="rules">
  <p><b>Returned or rejected?</b> Returned means "fix this and send it again". Rejected means "no".</p>
</div>
""", part=3)

page(f"""
{title("The calendar", who="Presidents and Vice-Presidents")}
<p class="lead">Every venue booking in the college, <b>so you can pick a free slot before you propose.</b></p>
{fig("calendar", crop=(250, 60, 1020, 760), alt="The semester event calendar")}
<div class="cols2">
  <div>
  {steps((1, "<b>Upcoming events</b>: every booking from today on, marked <b>Approved</b> or "
             "<b>Awaiting approval</b>. Click one to open its day."), kind="look")}
  {steps((2, "<b>Previous / Next month</b> and <b>week</b> move the calendar."),
         (3, "<b>Go to date</b> jumps to any day."))}
  </div>
  {steps((4, "<b>The week.</b> Each day says <b>Free</b> or how many events. Click a day to see it hour by hour, "
             "one column per venue."), kind="look")}
</div>
<div class="cols2">
  <div class="aside"><h2 class="mini">What you see of other clubs</h2><p>An approved event shows its name. Another
  club's event that is <b>not approved yet</b> shows only as <b>Requested</b>: the slot is taken, the idea stays
  private.</p></div>
  <p class="note"><b>You cannot move a booking.</b> Only the Dean, and the Cultural Society's officers while a
  proposal is with them, can.</p>
</div>
""", part=3)

# ================================================================== part 4
page(f"""
{title("Build the budget", who="Treasurer · President · Vice-President")}
<p class="lead">Open <b>Budget</b>, then the event. <b>You can change the budget while the event is a draft or
has been returned.</b></p>
{fig("budget-edit", crop=(250, 60, 1020, 820), alt="A budget that can be edited")}
<div class="cols2">
  {steps((1, "<b>Edit all</b> turns every line into text boxes. Change several, save once."),
         (2, "<b>Edit</b> or <b>Remove</b> one line."),
         (3, "<b>Add an entry</b>: a head (what it is for) and an amount."))}
  {steps((4, "<b>Upload a CSV</b> to add many lines at once. Choose whether it <b>replaces</b> the existing "
             "lines or is <b>added</b> to them."),
         (5, "<b>Download template</b> for the CSV layout."),
         (6, "<b>Send for approval</b> when the lines are right."))}
</div>
<div class="cols3">
  <div><h2 class="mini">The three figures</h2><p><b>Requested</b> is what the club asks. <b>Sanctioned</b> is what the
  approvers allowed. <b>Spent</b> is what you record after the event.</p></div>
  <div><h2 class="mini">The envelope</h2><p>Your club's budget for the year, if the Dean has set one, with how much
  is already sanctioned and settled.</p></div>
  <div><h2 class="mini">An event that costs nothing</h2><p>With no priced lines, <b>declare the budget nil</b> and give
  the reason. It can then be sent without lines.</p></div>
</div>
<p class="note"><b>Over ₹50,000</b>, or part of a fest, the proposal also goes to the Vice-Chancellor. The page
tells you before you send it.</p>
""", part=4)

page(f"""
{title("After approval: spend and receipts", who="Treasurer · President · Vice-President")}
<p class="lead">Once approved the budget is <b>Sanctioned</b>. The lines are fixed; <b>after the event you record
what was actually spent.</b></p>
<div class="split">
  {fig("budget-sanctioned", alt="A sanctioned budget where the Dean lowered two lines")}
  <div>
    {steps((1, "<b>Sanctioned</b> is the money you may spend."),
           (2, "<b>A line the Dean lowered</b> shows what you asked struck through, the new figure, and a "
               "violet <b>A</b>."), kind="look")}
    <p>Lines left alone are sanctioned as requested.</p>
  </div>
</div>

<h2 class="sec">Record the spend</h2>
{fig("budget-spend", alt="Entering spend and attaching a bill for one line")}
<div class="cols2">
  {steps((1, "<b>Spent</b>: what the line actually cost."),
         (2, "<b>Note</b>: anything worth recording. Required if the line went over."),
         (3, "<b>Save</b>."))}
  {steps((4, "<b>Choose the bill</b> (PDF or a photo)."),
         (5, "<b>Attach</b>. It appears under the line; click it to open."))}
</div>
<div class="rules">
  <p><b>A receipt is required for any line above ₹5,000.</b> A line that went over what was sanctioned is marked
  <b>Over sanctioned</b> and needs a reason.</p>
  <p><b>Settle budget</b>, at the bottom, closes it. If something is missing, the page lists exactly which
  lines need a receipt or a reason. A settled budget cannot be changed.</p>
</div>
""", part=4)

# ================================================================== part 5
page(f"""
{title("Open the door", who="President · Vice-President · Secretary · core team")}
<p class="lead">On the day, the event page of a <b>published</b> event has two buttons.</p>
{fig("go-live", alt="Go live and Scan station on a published event")}
<div class="cols2">
  {steps((1, "<b>Go live</b> when the event starts. Students see it as <b>Live now</b>."))}
  {steps((2, "<b>Scan station</b> opens the door page on this device."))}
</div>

<h2 class="sec">The scan station</h2>
<div class="split tall">
  {fig("scan", crop=(10, 0, 1020, 1050), alt="The scan station")}
  <div>
    {steps((1, "<b>Event at this door.</b> Check it is the right one."),
           (2, "<b>Start camera</b>, then hold each student's <b>pass</b> or <b>profile QR</b> up to it."),
           (3, "<b>No camera?</b> Type or paste the code under the QR and click <b>Check code</b>."),
           (4, "<b>No phone?</b> Type the <b>PRN</b> from their ID card and click <b>Check in by PRN</b>."))}
    {steps((5, "<b>At the door</b>: checked in, registered, capacity."),
           (6, "<b>Recent scans</b>: the last few, with their result."), kind="look")}
    <p class="note">Use a phone or a laptop. Several people can scan at once on their own devices.</p>
  </div>
</div>
""", part=5)

page(f"""
{title("Check people in", who="whoever is at the door")}
<p class="lead">Every scan gets an answer in under a second. <b>Green: let them in. Amber: look again. Red: do not
admit on this code.</b></p>
{fig("scan-verdict", crop=(250, 318, 1020, 145), alt="A student checked in by PRN")}
{steps((1, "<b>The verdict</b> names the student, so you can check the face against the ID card."), kind="look")}
<dl class="gloss">
  <dt><b class="tag green">Checked in</b></dt><dd>A registered student. Let them in.</dd>
  <dt><b class="tag green">Registered and checked in</b></dt><dd>A walk-in who was not registered. They are now, and they are in.</dd>
  <dt><b class="tag amber">Already checked in</b></dt><dd>This pass was used before; it says when. A pass works once.</dd>
  <dt><b class="tag red">Wrong event</b></dt><dd>A pass for another event. Ask for their <b>profile QR</b> instead.</dd>
  <dt><b class="tag red">Pass was replaced</b></dt><dd>An old copy. Ask them to open the current pass.</dd>
  <dt><b class="tag red">Event at capacity</b></dt><dd>A walk-in, but every place is taken.</dd>
  <dt><b class="tag red">Code not recognised</b></dt><dd>Not a Culturals code, or mistyped. Scan again or use the PRN.</dd>
  <dt><b class="tag amber">Saved offline</b></dt><dd>No connection. The scan is kept on this device and sent when the network returns.</dd>
</dl>

<h2 class="sec">Who is in, who is not</h2>
<div class="split">
  {fig("scan-attendees", alt="The attendee list at the door")}
  <div>
    {steps((1, "<b>Find by name or PRN</b> to check one person."))}
    <p>The filter shows <b>All</b>, only those <b>Checked in</b>, or those <b>Not yet</b> here. The counts on the
    event page come from these scans; <b>nobody types attendance in.</b></p>
  </div>
</div>
""", part=5)

page(f"""
{title("The post-event report", who="President · Vice-President · Secretary")}
<p class="lead">Once the event is live, its page has a <b>Post-event report</b>. <b>Fill it in after the event; it is
what the semester report is built from.</b></p>
{fig("report-top", alt="The top of the post-event report")}
<div class="cols2">
  {steps((1, "<b>Checklist.</b> What is still needed before you can submit."),
         (2, "<b>Attendance</b> is already filled in from the door."), kind="look")}
  {steps((3, "<b>Photos.</b> At least one is required. Mark the best as a highlight."),
         (4, "<b>Social media posts.</b> Paste the link to each post. Optional."))}
</div>
<div class="cols2">
  <div>
    {fig("report-bills", alt="Bills and spend in the report")}
    {steps((1, "<b>Spent</b> on each line."), (2, "<b>The bill</b> for it."))}
    <p class="muted small">Bills do not hold up the report. The budget cannot be settled without them.</p>
  </div>
  <div>
    {fig("report-submit", alt="Outcomes and Submit report")}
    {steps((1, "<b>Outcomes</b> (required): what happened, who came, what it achieved."),
           (2, "<b>Learnings</b>: what to keep or change."),
           (3, "<b>Submit report.</b> The event becomes <b>Reported</b>."))}
  </div>
</div>
<p class="note"><b>A student in a photo can ask for it to be taken down.</b> You see the request on the photo and
can remove it there.</p>
""", part=5)

# ================================================================== part 6
page(f"""
{title("Members, roles and join requests", who="Presidents and Vice-Presidents")}
<p class="lead">The roster is <b>Members &amp; roles</b>. <b>Every change of role is recorded with who made it.</b></p>
<div class="split tall">
  {fig("roster", crop=(250, 60, 1030, 1000), alt="The Music Club roster")}
  <div>
    {steps((1, "<b>Role.</b> Choose a member's role: Member, Core team, Secretary, Treasurer, Vice-President, President."))}
    {steps((2, "<b>Office bearers</b> wear a gold ring."), kind="look")}
    {steps((3, "<b>Open join requests</b> when students are waiting."))}
    {steps((4, "<b>Handover.</b> Name next term's office bearers and the date it takes effect. The outgoing "
               "holders lose their permissions at that time."), kind="look")}
    <p class="note">The Treasurer cannot assign roles. A student can be in <b>up to five clubs</b>.</p>
  </div>
</div>

<h2 class="sec">Join requests</h2>
{fig("join", alt="Join requests waiting for the Music Club")}
<div class="cols2">
  {steps((1, "<b>Tick</b> the students you want to decide together, or"),
         (2, "<b>Accept</b> one student."))}
  {steps((3, "<b>Decline</b> one student."),
         (4, "<b>Approve selected</b> accepts everyone you ticked."))}
</div>
""", part=6)

GLOSS = [
    ("An event's status", [
        ('<b class="tag grey">Draft</b>', "Saved, not sent. Only your office bearers see it."),
        ('<b class="tag blue">Awaiting approval</b>', "With an approver. You cannot edit it."),
        ('<b class="tag amber">Returned for changes</b>', "Fix what the comment asks and send it again."),
        ('<b class="tag red">Rejected</b>', "Final. Propose a new event to try again."),
        ('<b class="tag green">Published</b> <b class="tag green">Live now</b>', "Approved; students can register. Live while it runs."),
        ('<b class="tag grey">Reported</b>', "The post-event report is in."),
    ]),
    ("A budget's stage", [
        ('<b class="tag blue">With the Cultural Society</b> <b class="tag blue">With the Dean</b>', "Where the proposal is waiting."),
        ('<b class="tag green">Sanctioned</b>', "Approved. Record spend after the event."),
        ('<b class="tag grey">Settled</b>', "Spend and receipts complete. Closed."),
    ]),
    ("Changes by approvers", [
        ('<b class="tag violet">A</b>', "A change by the Cultural Society or the Dean."),
        ('<b class="tag teal">M</b>', "A change by the Vice-Chancellor."),
    ]),
]
gloss_html = "".join(f'<h2 class="sec">{g}</h2><dl class="gloss">'
                     + "".join(f"<dt>{t}</dt><dd>{d}</dd>" for t, d in rows) + "</dl>" for g, rows in GLOSS)
page(f"""
{title("Tags and statuses")}
<p class="lead">The small coloured labels on cards and pages, and what they mean.</p>
{gloss_html}
""", part=6)

page(f"""
{title("Quick answers")}
<dl class="qa">
  <dt>I can't find Send for approval.</dt><dd>The budget has no lines yet. Add them, or declare the budget nil, then send.</dd>
  <dt>Can I change the date after sending?</dt><dd><b>No.</b> Ask the Cultural Society (while it is with them) or the Dean to move it.</dd>
  <dt>The venue or time changed and I did not do it.</dt><dd>An approver moved it. Open <b>Notifications</b> or the event page for who and why.</dd>
  <dt>My budget is smaller than I asked.</dt><dd>The <b>Dean</b> lowered a line. The budget page shows which, struck through.</dd>
  <dt>A student has no phone at the door.</dt><dd>Type their <b>PRN</b> into the scan station.</dd>
  <dt>The network dropped at the door.</dt><dd>Keep scanning. Scans are saved on the device and sent when it is back.</dd>
</dl>
<div class="feedback">
  <h2>Tell us what to improve</h2>
  <p>This is a pilot. If a page is confusing or a step is missing, <b>note the page and what you expected</b>, and
  pass it on to the Culturals team.</p>
</div>
""", part=6)

CSS = f"""
@font-face {{ font-family: 'Jakarta'; src: url('fonts/plus-jakarta-sans.woff2') format('woff2'); font-weight: 200 800; }}
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

CSS += """
/* The cover picture bleeds off the page, so it carries no markers: one at the edge would be cut in half. */
.cover-shot .ring, .cover-shot .badge { display: none; }
.tag.violet { background: #efe7ff; color: #4a1d9e; }
.tag.teal { background: #daf4ef; color: #0b5a54; }
/* On screen: a bar to the other guides and the PDF, and pages that shrink to fit a narrow window. */
.webbar { position: sticky; top: 0; z-index: 5; display: flex; gap: 6mm; align-items: center; justify-content: center;
  padding: 2.5mm 4mm; background: var(--navy); color: #fff; font-size: 9.5pt; }
.webbar a { color: #fff; font-weight: 700; }
.webbar span { opacity: .75; }
@media screen { body { padding-top: 0; } .page { margin-top: 8mm; box-shadow: 0 2mm 8mm rgba(0,0,0,.25); } }
@media screen and (max-width: 215mm) { body { zoom: calc(100vw / 215mm); } }
@media print { .webbar { display: none; } }
"""

html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Culturals: Guide for club officials</title><style>{CSS}</style></head><body>
<div class="webbar"><b>Culturals · Guide for club officials</b>
<a href="Culturals-guide-for-club-officials.pdf">Download the PDF</a><a href="../">All guides</a>
<span>Pilot · November 2026</span></div>
{''.join(pages)}</body></html>"""
(OUT / "index.html").write_text(html, encoding="utf-8")
print("pages:", len(pages))
