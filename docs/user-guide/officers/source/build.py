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
    "go-live": {1: {"at": "l"}, 2: {"at": "b"}},
    "scan": {5: {"side": "r"}, 6: {"side": "r"}},
    "calendar": {2: {"at": "b"}, 3: {"at": "b"}},
    "events": {2: {"drop": True}},
    "roster": {3: {"at": "b"}, 4: {"side": "r"}},
    "join": {3: {"at": "r"}, 4: {"at": "l"}},
    "budget-edit": {5: {"at": "b"}},
    "new-event": {5: {"at": "l"}, 6: {"at": "r"}, 7: {"at": "r"}, 8: {"at": "r"}},
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
        extra = (f'<div class="band"></div>'
                 f'<div class="tab" style="top:{22 + (part - 1) * 43}mm;height:41mm"><b>{part}</b><span>{PARTS[part]}</span></div>'
                 f'<footer><span><b class="part-dot"></b>Part {part} · {PARTS[part]}</span><span>{n}</span></footer>')
    elif n > 1:
        extra = f'<footer><span>Culturals · Guide for club officials</span><span>{n}</span></footer>'
    pages.append(f'<section class="page {cls}" data-part="{part or 0}">{body}{extra}</section>')


def caps(*items, kind="click", cols=2):
    """Short captions under a picture, in columns: the picture leads, these name its numbers."""
    return steps(*items, kind=kind).replace('class="steps', f'class="steps caps c{cols}', 1)


def facts(*items):
    """A row of one-line facts: a bold term and a few words."""
    return '<div class="facts">' + "".join(f"<p><b>{t}</b>{d}</p>" for t, d in items) + "</div>"


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
  <b>Treasurer</b>. Every screen you use, in pictures.</p>
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
    f'<div class="toc-part" data-part="{p}"><div class="toc-num">{p}</div><div><h2>{PARTS[p]}</h2>'
    + "".join(f'<div class="toc-row"><span>{t}</span><i></i><b>{pg}</b></div>' for t, pg in rows)
    + "</div></div>" for p, rows in TOC)
page(f"""
<h1 class="solo">Contents</h1>
<div class="howto first">
  <h2>How to read the pictures</h2>
  <div class="legend">
    <div><span class="ring demo"><b class="badge at-l">1</b></span><p><b>Amber ring: click or type here.</b> The number matches the caption under the picture.</p></div>
    <div><b class="pin static">1</b><p><b>Blue dot: look here.</b> Nothing to click. Each part has its own colour on the page edge.</p></div>
  </div>
</div>
<div class="toc">{toc_html}</div>
""")

# ================================================================== part 1
page(f"""
{title("Who does what")}
<p class="lead">An event goes through five stages. <b>Each one leaves a record.</b></p>
<div class="route">
  <div class="stop"><b>Propose</b><span>event, document, budget</span></div>{ARROW}
  <div class="stop strong"><b>Approval</b><span>Society, Dean, sometimes the VC</span></div>{ARROW}
  <div class="stop"><b>Published</b><span>students register</span></div>{ARROW}
  <div class="stop"><b>Event day</b><span>passes scanned</span></div>{ARROW}
  <div class="stop end"><b>Reported</b><span>report, bills, settled</span></div>
</div>

<h2 class="sec">What each office bearer can do</h2>
<table class="who">
  <thead><tr><th>Task</th><th>President</th><th>Vice-President</th><th>Secretary</th><th>Treasurer</th><th>Page</th></tr></thead>
  <tbody>
    <tr><td><b>Propose an event</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>6</td></tr>
    <tr><td><b>Attach the proposal document</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>7</td></tr>
    <tr><td><b>Build the budget</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>{CHECK}</td><td>14</td></tr>
    <tr><td><b>Enter spend, attach bills, settle</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>{CHECK}</td><td>15</td></tr>
    <tr><td><b>Scan passes at the door</b> <span class="muted">· core team too</span></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>16</td></tr>
    <tr><td><b>Go live, send the post-event report</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>18</td></tr>
    <tr><td><b>Calendar and the Wednesday open block</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>{DASH}</td><td>13</td></tr>
    <tr><td><b>Assign roles, accept join requests</b></td><td>{CHECK}</td><td>{CHECK}</td><td>{DASH}</td><td>{DASH}</td><td>19</td></tr>
  </tbody>
</table>
{facts(("Nobody approves their own club's proposal.", " Approvers do, and you are told what they decide."),
       ("Nobody in the club moves a sent event.", " Only the Cultural Society and the Dean can."),
       ("Plain members", " see events and the roster, never budgets or the proposal."))}
""", part=1)

page(f"""
{title("Sign in and find your way")}
<p class="lead">Your <b>college email and password</b>. No authenticator code: only approvers need one.</p>
<div class="pair even">
  <div>
    {fig("signin", alt="The sign-in form")}
    {caps((1, "<b>Email</b>"), (2, "<b>Password</b>"), (3, "<b>Sign in</b>"), cols=1)}
    <p class="note">On the pilot every password is <b>culturals-demo</b>.</p>
  </div>
  <div>
    {fig("menu", crop=(0, 370, 240, 420), cls="menu", alt="The club part of a President's menu")}
  </div>
  <div>
    <h2 class="mini">Your menu</h2>
    {caps((1, "<b>Club events</b> · everything your club proposed"),
          (2, "<b>New event</b> · propose one"),
          (3, "<b>Budget</b> · not for the Secretary"),
          (4, "<b>Members &amp; roles</b> · the roster"),
          (5, "<b>Join requests</b> · President, Vice-President"),
          (6, "<b>Scan station</b> · the door"),
          (7, "<b>Calendar</b> · President, Vice-President"), kind="look", cols=1)}
  </div>
</div>
<p class="note">You see only the pages your role has. The pages above <b>Club</b> are the student pages everyone has.</p>
""", part=1)

# ================================================================== part 2
page(f"""
{title("Club events")}
<p class="lead">Everything your club has proposed, newest first.</p>
{fig("events", crop=(250, 60, 1020, 840), alt="Club events for the Music Club")}
{caps((1, "<b>New event</b> starts a proposal"),
      (3, "<b>Send for approval</b> on a draft or returned proposal"),
      (4, "<b>Open</b> the event's page"), cols=3)}
{facts(("Two labels on a card.", " The event's status, then the budget's stage."),
       ("Tabs.", " Drafts, With approvers, Upcoming, Past."),
       ("Wednesday open block.", " The card on top: pick a venue, click Book. No proposal needed; one slot per club. "
        "President and Vice-President."))}
""", part=2)

page(f"""
{title("Propose a new event")}
<p class="lead">One form, top to bottom. <b>Then send it, or save a draft.</b></p>
{fig("new-event", crop=(250, 60, 1020, 819), alt="The New event form, filled in")}
{caps((1, "<b>Title</b>"),
      (2, "<b>Venue</b> · shows the seats"),
      (3, "<b>Date and hours</b> · whole hours"),
      (4, "<b>Capacity</b> · filled from the venue; lower it if needed"),
      (5, "<b>Budget</b> · template, uploaded sheet, or leave to the Treasurer"),
      (6, "<b>Budget sheet</b> · a CSV"),
      (7, "<b>Proposal document</b> · PDF or Word, up to 10 MB"),
      (8, "<b>Propose and send</b> · reads <b>Save draft</b> with no budget"), cols=2)}
<p class="note"><b>Two clubs, one hall?</b> A slot already approved for another club is refused. A slot only asked for is
allowed; the approvers see the clash and move one.</p>
""", part=2)

page(f"""
{title("The budget and the proposal document")}
<p class="lead">Every proposal carries <b>a document that explains it</b> and <b>a budget that prices it</b>.</p>
<div class="decisions">
  <div class="d ok"><h3>A template</h3><p>Performance, Workshop, Competition or Exhibition, priced from your expected attendance.</p></div>
  <div class="d ret"><h3>Upload the budget sheet</h3><p>A CSV: <b>head, amount</b>. <b>Download the budget template</b> for the layout.</p></div>
  <div class="d plain"><h3>The Treasurer enters it</h3><p>Choose <b>None</b>. Saved as a draft; priced on the Budget page.</p></div>
</div>

<h2 class="sec">Preview the sheet before sending</h2>
{fig("sheet-preview", crop=(0, 560, 1280, 230), alt="Preview of a budget sheet")}
{caps((1, "<b>Each row is one budget line.</b> One wrong row and nothing is imported; you are told which."), kind="look", cols=1)}

<h2 class="sec">The proposal document</h2>
{facts(("Who reads it.", " Your office bearers, the Cultural Society, the Dean, the Vice-Chancellor. Never students."),
       ("In the app.", " Click the file name: a PDF opens in the page, a .docx shows as text."),
       ("Locked once sent.", " Replace it only while the event is a draft or returned."))}
""", part=2)

# ================================================================== part 3
page(f"""
{title("Following your proposal")}
<p class="lead">Open the event from <b>Club events</b>. The page shows where it is.</p>
{fig("event-top", crop=MAIN, alt="An event that is awaiting approval")}
{caps((1, "<b>Status</b> · an approver has it"),
      (2, "<b>When and where</b> · struck through if moved"),
      (3, "<b>Open budget</b> · every line"),
      (4, "<b>Proposal document</b> · click to read"), kind="look", cols=2)}
<h2 class="sec">The route</h2>
<div class="route">
  <div class="stop"><b>Club</b><span>you send it</span></div>{ARROW}
  <div class="stop"><b>Cultural Society</b><span>Secretary or Vice-Secretary</span></div>{ARROW}
  <div class="stop strong"><b>Dean</b><span>every event</span></div>{ARROW}
  <div class="stop"><b>Vice-Chancellor</b><span>over <b>₹50,000</b> or a fest</span></div>{ARROW}
  <div class="stop end"><b>Published</b><span>students register</span></div>
</div>
<p class="note">Each approver can <b>approve</b>, <b>return for changes</b> or <b>reject</b>. While they have it, you cannot edit it.</p>
""", part=3)

page(f"""
{title("Notifications")}
<p class="lead">Every decision and change reaches you <b>in the app and by email</b>.</p>
<div class="inline-fig">
  {fig("bell", crop=(120, 0, 200, 64), alt="The bell in the top bar")}
  {caps((1, "Click the <b>bell</b>. The number is what you have not read."), cols=1)}
</div>
{fig("notifications", crop=MAIN, alt="The Notifications page")}
{caps((1, "<b>Colour key</b> · violet <b>A</b>: Society or Dean; teal <b>M</b>: Vice-Chancellor"),
      (2, "<b>Filters</b> · decisions, or changes by approvers"),
      (3, "<b>Venue or time changed</b> · new slot, old slot, reason, who"),
      (4, "<b>Rejected</b> · with the reason"),
      (5, "<b>Returned for changes</b> · with what to fix"), kind="look", cols=2)}
<p class="note"><b>Open it</b> takes you to the event. Decisions go to the President, Vice-President and Treasurer.</p>
""", part=3)

page(f"""
{title("When an approver changes something")}
<p class="lead"><b>Old value struck through, new value in the approver's colour.</b></p>
<h2 class="mini">A new venue or time <span class="chip">Cultural Society officers · Dean</span></h2>
<div class="narrow">{fig("event-moved", alt="An event page after the Cultural Society moved it")}</div>
{caps((1, "<b>When and where</b> · old slot struck, new beside it"),
      (2, "<b>What changed</b> · was, is now"),
      (3, "<b>Why</b> · the approver's reason"), kind="look", cols=3)}

<h2 class="sec">A smaller budget <span class="chip">Dean</span></h2>
{fig("approved-trail", crop=(0, 290, 996, 368), alt="An approval trail where the Dean lowered the budget")}
{caps((1, "<b>Society</b> approved"),
      (2, "<b>Dean lowered the total</b> · struck: asked; violet: granted"),
      (3, "<b>Vice-Chancellor</b> approved · teal <b>M</b>"), kind="look", cols=3)}
<p class="note">The Dean can <b>lower a line, never raise it</b>. A notification names each line that changed.</p>
""", part=3)

page(f"""
{title("Returned for changes")}
<p class="lead">An approver wants something fixed. <b>Edit it and send it back.</b></p>
{fig("returned-top", crop=(250, 60, 1020, 500), alt="A returned proposal")}
{caps((1, "<b>Returned for changes</b>"),
      (3, "<b>Open budget</b> · every field is open again"),
      (4, "<b>Replace</b> the document if asked"),
      (5, "<b>Send for approval</b> when fixed"), cols=2)}
<h2 class="sec">What they asked for</h2>
{fig("returned-trail", alt="The approval trail of a returned proposal")}
{caps((1, "<b>The approver's comment</b>, under their name in the Approval trail."), kind="look", cols=1)}
<p class="note">Sent again, it <b>starts at the first step</b>, so earlier approvers see the new version.</p>
""", part=3)

page(f"""
{title("Rejected")}
<p class="lead"><b>Final.</b> It cannot be edited or sent again. To try again, propose a new event.</p>
{fig("rejected", alt="A proposal rejected by the Cultural Society")}
{caps((1, "<b>Why</b> · the comment is required"), cols=2, kind="look")}
{caps((2, "<b>Delete</b> removes it from your list. Optional."), cols=2)}

<h2 class="sec">Rejected at a later step</h2>
{fig("vc-rejected-trail", crop=(0, 290, 996, 339), alt="A proposal the Dean trimmed and the Vice-Chancellor rejected")}
{caps((1, "<b>The Dean's cut</b> still shows, in violet"),
      (2, "<b>The Vice-Chancellor's reason</b>"), kind="look", cols=2)}
<p class="note"><b>Returned</b> means "fix this and send it again". <b>Rejected</b> means "no". The venue slot is released.</p>
""", part=3)

page(f"""
{title("The calendar", who="Presidents and Vice-Presidents")}
<p class="lead">Every venue booking, <b>so you can pick a free slot before you propose.</b></p>
{fig("calendar", crop=(250, 60, 1020, 760), alt="The semester event calendar")}
{caps((1, "<b>Upcoming events</b> · approved or awaiting approval; click one to open its day"), kind="look", cols=1)}
{caps((2, "<b>Month and week</b> buttons"), (3, "<b>Go to date</b>"), cols=2)}
{caps((4, "<b>The week</b> · Free, or how many events; click a day for its hours"), kind="look", cols=1)}
{facts(("Other clubs.", " Approved events show their name. One not approved yet shows only as Requested."),
       ("Read only.", " You cannot move a booking. The Dean can, and the Society's officers while a proposal is with them."))}
""", part=3)

# ================================================================== part 4
page(f"""
{title("Build the budget", who="Treasurer · President · Vice-President")}
<p class="lead"><b>Budget</b>, then the event. Editable while it is a draft or returned.</p>
{fig("budget-edit", crop=(250, 60, 1020, 820), alt="A budget that can be edited")}
{caps((1, "<b>Edit all</b> · every line as text boxes, one Save"),
      (2, "<b>Edit</b> or <b>Remove</b> one line"),
      (3, "<b>Add an entry</b> · a head and an amount"),
      (4, "<b>Upload a CSV</b> · replace or add to the lines"),
      (5, "<b>Download template</b>"),
      (6, "<b>Send for approval</b>"), cols=3)}
{facts(("Requested, Sanctioned, Spent.", " What you ask, what was allowed, what you record afterwards."),
       ("Costs nothing?", " Declare the budget nil, with a reason."),
       ("Over ₹50,000", " or part of a fest: it also goes to the Vice-Chancellor."))}
""", part=4)

page(f"""
{title("After approval: spend and receipts", who="Treasurer · President · Vice-President")}
<p class="lead">Sanctioned lines are fixed. <b>After the event, record what was spent.</b></p>
{fig("budget-sanctioned", crop=(0, 0, 1036, 610), alt="A sanctioned budget where the Dean lowered two lines")}
{caps((1, "<b>Sanctioned</b> · what you may spend"),
      (2, "<b>A line the Dean lowered</b> · asked struck through, new figure, violet <b>A</b>"), kind="look", cols=2)}
<h2 class="sec">Record the spend</h2>
{fig("budget-spend", alt="Entering spend and attaching a bill for one line")}
{caps((1, "<b>Spent</b>"), (2, "<b>Note</b> · required if over"), (3, "<b>Save</b>"),
      (4, "<b>Choose the bill</b>"), (5, "<b>Attach</b>"), cols=5)}
{facts(("Receipts.", " Required for any line above ₹5,000."),
       ("Over sanctioned.", " Needs a reason in the note."),
       ("Settle budget.", " At the bottom. It lists what is missing; once settled it is closed."))}
""", part=4)

# ================================================================== part 5
page(f"""
{title("Open the door", who="President · Vice-President · Secretary · core team")}
<p class="lead">On the day, a published event has two buttons.</p>
{fig("go-live", alt="Go live and Scan station on a published event")}
{caps((1, "<b>Go live</b> when it starts"), (2, "<b>Scan station</b> opens the door page"), cols=2)}
<h2 class="sec">The scan station</h2>
<div class="split wide">
  {fig("scan", crop=(10, 0, 1020, 1050), alt="The scan station")}
  <div>
    {caps((1, "<b>Event at this door</b>"),
          (2, "<b>Start camera</b>, hold up the pass or profile QR"),
          (3, "<b>No camera?</b> Type the code"),
          (4, "<b>No phone?</b> Type the PRN"), cols=1)}
    {caps((5, "<b>At the door</b> · the count"),
          (6, "<b>Recent scans</b>"), kind="look", cols=1)}
    <p class="note">Any phone or laptop. Several people can scan at once.</p>
  </div>
</div>
""", part=5)

page(f"""
{title("Check people in", who="whoever is at the door")}
<p class="lead"><b>Green: let them in. Amber: look again. Red: not on this code.</b></p>
{fig("scan-verdict", crop=(250, 318, 1020, 145), alt="A student checked in by PRN")}
{caps((1, "<b>The verdict</b> names the student: check the face against the ID card."), kind="look", cols=1)}
<dl class="gloss">
  <dt><b class="tag green">Checked in</b></dt><dd>Registered. Let them in.</dd>
  <dt><b class="tag green">Registered and checked in</b></dt><dd>A walk-in. Now registered, and in.</dd>
  <dt><b class="tag amber">Already checked in</b></dt><dd>Used before; it says when. A pass works once.</dd>
  <dt><b class="tag red">Wrong event</b></dt><dd>Ask for their <b>profile QR</b> instead.</dd>
  <dt><b class="tag red">Pass was replaced</b></dt><dd>An old copy. Ask for the current pass.</dd>
  <dt><b class="tag red">Event at capacity</b></dt><dd>A walk-in, and every place is taken.</dd>
  <dt><b class="tag red">Code not recognised</b></dt><dd>Scan again, or use the PRN.</dd>
  <dt><b class="tag amber">Saved offline</b></dt><dd>No network. Kept on the device, sent when it returns.</dd>
</dl>
<h2 class="sec">Who is in, who is not</h2>
{fig("scan-attendees", alt="The attendee list at the door")}
{caps((1, "<b>Find by name or PRN.</b> Filter to Checked in or Not yet. Nobody types attendance in."), cols=1)}
""", part=5)

page(f"""
{title("The post-event report", who="President · Vice-President · Secretary")}
<p class="lead">On the event's page once it is live. <b>The semester report is built from it.</b></p>
{fig("report-top", alt="The top of the post-event report")}
{caps((1, "<b>Checklist</b> · what is still needed"), (2, "<b>Attendance</b> · from the door"), kind="look", cols=2)}
{caps((3, "<b>Photos</b> · at least one"), (4, "<b>Post links</b> · optional"), cols=2)}
<div class="cols2 figs">
  <div>
    {fig("report-bills", alt="Bills and spend in the report")}
    {caps((1, "<b>Spent</b>"), (2, "<b>The bill</b>"), cols=2)}
  </div>
  <div>
    {fig("report-submit", alt="Outcomes and Submit report")}
    {caps((1, "<b>Outcomes</b> · required"), (2, "<b>Learnings</b>"), (3, "<b>Submit</b>"), cols=3)}
  </div>
</div>
<p class="note">Bills do not hold up the report; the budget cannot settle without them. A student in a photo can ask
for it to be taken down.</p>
""", part=5)

# ================================================================== part 6
page(f"""
{title("Members, roles and join requests", who="Presidents and Vice-Presidents")}
<p class="lead"><b>Members &amp; roles</b> is the roster. Every change is recorded.</p>
<div class="split wide">
  {fig("roster", crop=(250, 60, 1030, 1000), alt="The Music Club roster")}
  <div>
    {caps((1, "<b>Role</b> · choose it per member"), cols=1)}
    {caps((2, "<b>Gold ring</b> · an office bearer"), kind="look", cols=1)}
    {caps((3, "<b>Open join requests</b>"), cols=1)}
    {caps((4, "<b>Handover</b> · next term's office bearers and the date"), kind="look", cols=1)}
    <p class="note">The Treasurer cannot assign roles. A student can be in up to five clubs.</p>
  </div>
</div>
<h2 class="sec">Join requests</h2>
{fig("join", crop=(0, 120, 1040, 200), alt="Join requests waiting for the Music Club")}
{caps((1, "<b>Tick</b> several"), (2, "<b>Accept</b> one"), (3, "<b>Decline</b> one"),
      (4, "<b>Approve selected</b>"), cols=4)}
""", part=6)

GLOSS = [
    ("An event's status", [
        ('<b class="tag grey">Draft</b>', "Saved, not sent."),
        ('<b class="tag blue">Awaiting approval</b>', "With an approver. Locked."),
        ('<b class="tag amber">Returned for changes</b>', "Fix it and send it again."),
        ('<b class="tag red">Rejected</b>', "Final."),
        ('<b class="tag green">Published</b> <b class="tag green">Live now</b>', "Approved; students register. Live while it runs."),
        ('<b class="tag grey">Reported</b>', "The post-event report is in."),
    ]),
    ("A budget's stage", [
        ('<b class="tag blue">With the Cultural Society</b> <b class="tag blue">With the Dean</b>', "Where it is waiting."),
        ('<b class="tag green">Sanctioned</b>', "Approved. Record spend afterwards."),
        ('<b class="tag grey">Settled</b>', "Closed."),
    ]),
    ("Changes by approvers", [
        ('<b class="tag violet">A</b>', "The Cultural Society or the Dean."),
        ('<b class="tag teal">M</b>', "The Vice-Chancellor."),
    ]),
]
gloss_html = "".join(f'<h2 class="sec">{g}</h2><dl class="gloss">'
                     + "".join(f"<dt>{t}</dt><dd>{d}</dd>" for t, d in rows) + "</dl>" for g, rows in GLOSS)
page(f"""
{title("Tags and statuses")}
<p class="lead">The small coloured labels, and what they mean.</p>
{gloss_html}
""", part=6)

page(f"""
{title("Quick answers")}
<dl class="qa">
  <dt>I can't find Send for approval.</dt><dd>The budget has no lines. Add them, or declare it nil.</dd>
  <dt>Can I change the date after sending?</dt><dd><b>No.</b> Ask the Cultural Society (while it is with them) or the Dean.</dd>
  <dt>The venue or time changed.</dt><dd>An approver moved it. <b>Notifications</b> says who and why.</dd>
  <dt>My budget is smaller than I asked.</dt><dd>The <b>Dean</b> lowered a line. The budget page shows which.</dd>
  <dt>A student has no phone.</dt><dd>Type their <b>PRN</b> at the scan station.</dd>
  <dt>The network dropped at the door.</dt><dd>Keep scanning. Scans are sent when it returns.</dd>
</dl>
<div class="feedback">
  <h2>Tell us what to improve</h2>
  <p>This is a pilot. <b>Note the page and what you expected</b>, and pass it on to the Culturals team.</p>
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
/* ---- 2026-11-15 pass: the pictures lead, each part has a colour, captions are short ---- */
.page[data-part="1"] { --part: #1b5fe4; --part-soft: #e3ecff; }
.page[data-part="2"] { --part: #0b7a5c; --part-soft: #dff3ec; }
.page[data-part="3"] { --part: #6a2bd9; --part-soft: #efe7ff; }
.page[data-part="4"] { --part: #b4266a; --part-soft: #fbe6ef; }
.page[data-part="5"] { --part: #c2410c; --part-soft: #fdeadd; }
.page[data-part="6"] { --part: #3d4a63; --part-soft: #e8ebf1; }
.toc-part[data-part="1"] .toc-num { background: #1b5fe4; } .toc-part[data-part="2"] .toc-num { background: #0b7a5c; }
.toc-part[data-part="3"] .toc-num { background: #6a2bd9; } .toc-part[data-part="4"] .toc-num { background: #b4266a; }
.toc-part[data-part="5"] .toc-num { background: #c2410c; } .toc-part[data-part="6"] .toc-num { background: #3d4a63; }
.band { position: absolute; left: 0; right: 0; top: 0; height: 2.6mm; background: var(--part, var(--navy)); }
.page .tab { background: var(--part, var(--navy)); }
.part-dot { display: inline-block; width: 2.2mm; height: 2.2mm; border-radius: 50%; background: var(--part, var(--navy));
  margin-right: 1.6mm; vertical-align: .1mm; }
footer span:last-child { color: var(--part, var(--navy)); }
.for { border-color: var(--part, var(--line)); background: var(--part-soft, transparent); color: var(--ink); }
.for b { color: var(--part, var(--navy)); }
h1 { font-size: 25pt; }
.lead { font-size: 11pt; margin-bottom: 4mm; max-width: none; }
h2.sec { margin-top: 6mm; padding-top: 4mm; }
h2 .chip { background: var(--part-soft, var(--blue-soft)); color: var(--part, var(--navy)); }
/* pictures: full width by default, with a little more presence */
.shot .clip { border-radius: 2.6mm; }
.narrow { width: 82%; margin: 0 auto; }
.inline-fig { display: grid; grid-template-columns: 34mm 1fr; gap: 6mm; align-items: center; margin-bottom: 3mm; }
.inline-fig .steps { margin-top: 0; }
.split.wide { grid-template-columns: 1.7fr 1fr; gap: 8mm; }
.pair.even { grid-template-columns: 62mm 54mm 1fr; gap: 8mm; }
.sec + .facts { border-top: 0; padding-top: 0; margin-top: 0; }
.pair.even .shot { width: 100%; }
.cols2.figs { margin-top: 5mm; align-items: start; }
/* captions: short lines in columns under the picture they belong to */
.steps.caps { gap: 1.8mm 6mm; margin-top: 3mm; font-size: 9.4pt; line-height: 1.35; }
.steps.caps li { align-items: center; gap: 2.2mm; }
.steps.caps.c2 { grid-template-columns: 1fr 1fr; } .steps.caps.c3 { grid-template-columns: repeat(3, 1fr); }
.steps.caps.c4 { grid-template-columns: repeat(4, 1fr); } .steps.caps.c5 { grid-template-columns: repeat(5, auto); justify-content: start; }
.steps.caps + .steps.caps { margin-top: 1.8mm; }
.shot + .steps.caps { margin-top: 3mm; }
.facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin-top: 5mm; padding-top: 4mm;
  border-top: .6pt solid var(--line); font-size: 9.2pt; line-height: 1.4; color: var(--muted); }
.facts:has(> p:nth-child(2):last-child) { grid-template-columns: 1fr 1fr; }
.facts b { color: var(--ink); }
.note { margin-top: 3.5mm; padding: 2.4mm 3.6mm; border-radius: 2mm; }
.d.plain { background: var(--bg); } .d.plain h3 { color: var(--navy); }
.d h3 { margin-bottom: .8mm; }
.howto.first { margin: 0 0 2mm; }
.gloss { grid-template-columns: 62mm 1fr; font-size: 9.4pt; }
.gloss dt, .gloss dd { padding: 1.5mm 0; }
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
