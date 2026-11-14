# Additional requirements and changes

**Clubs & Events application** · drafted 2026-11-03 (Part 1: student experience) · Part 2 added 2026-11-08 (reporting, calendar, budgets, joining)

This document adds requirements on top of `MASTER_SPEC.md`. Where the two disagree,
`MASTER_SPEC.md` wins. Every access rule in §3 of the spec (who sees money, who sees
attendance, no self-marking) still applies to every screen described here.

It comes from three reviews:

| Source | What it gave us |
|---|---|
| InstiApp (`github.com/DevCom-IITB/instiapp-flutter`), IIT Bombay's student app | Page and component patterns for Feed, Home, Profile, Explore and club pages |
| SAIU wiki (`github.com/ChargingTrex/collage-wiki-SAIU`) | The club and committee directory data: names, contacts, boards, accent colours |
| Mess Mate (`~/Documents/projects/MessMate`), our own mess app | The daily mess menu for the Home page |

We borrow **patterns** from InstiApp, not its code, images or brand. Everything is
rebuilt with our design tokens (`app/frontend/src/index.css`).

## Contents

| § | Section |
|---|---|
| 1 | [Why — the gap today](#1-why--the-gap-today) |
| 2 | [What InstiApp does, page by page](#2-what-instiapp-does-page-by-page) |
| 3 | [F-06 Club directory and club page](#3-f-06-club-directory-and-club-page) |
| 4 | [F-07 Feed and the event card](#4-f-07-feed-and-the-event-card) |
| 5 | [F-08 Profile](#5-f-08-profile) |
| 6 | [F-09 Home dashboard](#6-f-09-home-dashboard) |
| 7 | [F-10 Mess menu from Mess Mate](#7-f-10-mess-menu-from-mess-mate) |
| 8 | [Data changes](#8-data-changes) |
| 9 | [Rules from the master spec that shape these screens](#9-rules-from-the-master-spec-that-shape-these-screens) |
| 10 | [Open decisions](#10-open-decisions) |
| 11 | [Build order](#11-build-order) |
| 12–21 | **Part 2 (2026-11-08):** [post-event report, calendar, Wednesday open block, budget CSV, five clubs, join requests, VC guide, hosted link](#part-2--reporting-calendar-budgets-joining-added-2026-11-08) |

---

## 1. Why — the gap today

`MASTER_SPEC.md` §3.1 says a student "browses the club directory" and "sees a
personalised feed". Neither exists:

- **No feed.** There is no feed endpoint, ranking or page. "What's on" (`/events`) is the
  same list for every student, filtered by club, category and date.
- **No club directory.** The client fetches the club list only to fill filter dropdowns.
  There is no page for browsing clubs or reading about one.
- **No club announcements.** No student page shows club announcements or posts.
- **Thin student side.** Students have three pages: What's on, My passes and Profile
  (QR plus reissue). Home only redirects.

## 2. What InstiApp does, page by page

For reference. §3–§7 say what we take from it.

**Feed** (`routes/feedpage.dart`) — "Insti **Feed**" title and a "Search events…" bar.
- *Event card:* the main component. A tall poster with rounded top corners, a dark strip
  with the club's logo and name, a blue line with date, time and status (e.g.
  "23 Jun, 6:00 PM | Upcoming", "Ongoing", "Ended"), the title in bold, and a one-line
  description. Tapping the card opens the event.
- *Behaviour:* the header collapses on scroll, pull-to-refresh reloads, and a "back to
  top" button appears after scrolling.
- *Limits:* events only, no posts. Search runs on the device over event and club
  names. "Events / Announcements" filter chips were planned but are commented out.

**Home** (`routes/homepage.dart`)
- *Header:* greeting, avatar (opens Profile), notification bell with a red unread count.
- *"My QR" card:* collapsible, with a refresh button.
- *"Services" grid:* illustrated tiles for Buy & Sell, Maps, Blogs and Quick Links.
- *Mess menu:* picked by hostel and day.
- *Bottom nav:* dark pill with Home · Feed · Explore · Communities.

**Profile** (`routes/userpage.dart`)
- *ID card:* dark card styled like a campus ID, with photo, Name, Programme, Department,
  Validity and a roll-number barcode.
- *Tabs:* **General** (Edit Profile, Report Issues, About, Logout) · **Associations**
  (clubs where you hold a role) · **Following** (clubs you follow).
- *Empty states:* an illustration with text such as "You aren't following any clubs".
- *Other people:* a smaller card. Guests see "Login to view profiles".

**Explore and club pages** (`explorepage.dart`, `explore_club.dart`, `bodypage.dart`)
- *Explore:* "Discover Your Campus" grid of category cards (Cult, Tech, Sports and so
  on), each opening a searchable list of clubs.
- *Club page:* cover image, Follow/Following, Join/Joined, quick links (Website,
  WhatsApp, Instagram), and tabs **About** (description, photo album) · **Events** ·
  **People** (office bearers).

**Event page** — Date & Time, Venue, Description, and a "Show enthu" (interested)
button.

### Summary of what we borrow

| InstiApp | Ours today | Requirement |
|---|---|---|
| Explore categories → club page | Club list only feeds a dropdown | **F-06** directory and club page, with the SAIU wiki data |
| Feed event card | Plain list rows on "What's on" | **F-07** poster card, plus our capacity bar and registration state |
| Feed (events only) | None | **F-07** feed: my clubs first, then the rest of campus |
| Profile ID card and tabs | QR and reissue only | **F-08** ID card with tabs QR · My clubs · Attendance · Settings |
| Home header, QR card, services grid | Home just redirects | **F-09** greeting, next event, QR, your clubs, notifications |
| Mess menu by hostel | None | **F-10** today's menu from Mess Mate (one mess, no hostel picker) |

Not borrowed: Buy & Sell, Maps, Blogs, Quick Links, Communities, the hostel picker and
"Show enthu" (see §9).

---

## 3. F-06 Club directory and club page

### F-06.1 Directory page (`/clubs`)
- **What it shows:** every active club and committee as a card with logo or initials,
  name, tag (e.g. "Music"), one-line description and accent colour.
- **Grouping:** by category. Committees (Cultural Society, Student Government) get their
  own section and show their seal instead of an accent.
- **Search and filter:** search by club name and tag; filter by category.
- **Card badge:** "Member" or your role (e.g. "Treasurer") on clubs you belong to; "Requested" on clubs with a pending join request.
- **Who sees it:** every signed-in student. Dormant clubs are shown with a "Dormant" label;
  archived clubs are hidden.

### F-06.2 Club page (`/clubs/:slug`)
- **Header:** cover or accent band, logo, name, tag, member count, and contact links
  (email, Instagram, LinkedIn). Empty or placeholder links are not rendered.
- **Join button:** follows the club's `join_mode`.
  - `open`: **Join** adds the membership at once.
  - `approval`: **Request to join** creates a join request. The button then reads
    **Requested** until an office bearer decides.
  - Already a member: **Joined**, with your role shown.
- **Tabs:**
  - **About:** description. A photo album is optional and comes later.
  - **Events:** the club's published, live and past events.
  - **Board:** current office bearers, **names and roles only** (see §9).

### F-06 acceptance criteria
- A student can find any of the 21 clubs and 2 committees by name, tag or category.
- A student can request to join an `approval` club, and the request appears in that
  club's join-request queue (built in F-04).
- The club page never shows a budget figure, a member's attendance or a contact detail
  for an individual student.

## 4. F-07 Feed and the event card

### F-07.1 Event card (shared component)
Used by the Feed, the club page's Events tab and Home.

| Part | Content |
|---|---|
| Poster | Event image. When there is none, fall back to the club's logo on its accent colour. |
| Club strip | Club logo and name; tapping it opens the club page. |
| Status line | Date, time and **Upcoming / Live / Ended**. Multi-day events show a range ("23–24 Jun"). |
| Title and summary | Title in bold, one line of description. |
| Capacity | Registered vs capacity bar, and "Full · waitlist open" when full. InstiApp has no equivalent. |
| My state | "Registered", "Waitlisted" or "Pass ready" when it applies to the viewer. |

Tapping the card opens the existing event page (`/events/:id`).

### F-07.2 Feed page (`/feed`)
- **Order:** events from clubs I belong to come first, newest upcoming first, then the
  rest of campus.
- **Search:** over event title and club name, done by the API rather than in the browser,
  so it works on paged results.
- **Behaviour:** pull-to-refresh on mobile, a back-to-top button after scrolling, and an
  empty state ("Nothing from your clubs yet — explore clubs") linking to `/clubs`.
- **Announcements:** filter chips ("Events / Announcements") are **later** and need an
  announcements model (see §10).

### F-07 API change
- Add a `mine=true` filter to `GET /events` that limits results to clubs where the
  caller holds an active membership. Or add a `feed` ordering that puts those first.
- Add `search=` over title and club name.

### F-07 acceptance criteria
- A member of Music Club sees Music Club's upcoming events above other clubs' events.
- A student in no club sees the whole campus list in date order.
- The card's status line reads "Live" only between the event's start and end.

## 5. F-08 Profile

### F-08.1 ID card
- **Content:** display name, PRN, programme, department and validity (graduation year),
  in a dark card styled like a campus ID.
- **No barcode:** the QR on the QR tab is the only scannable code. A PRN barcode would
  be a second, unrevocable credential, which breaks the reasoning in the existing
  "Why this is not your PRN" panel.

### F-08.2 Tabs
| Tab | Content |
|---|---|
| **QR** | The existing profile QR, full-screen view and reissue flow, unchanged. |
| **My clubs** | Clubs I belong to, with my role, linking to each club page. Pending join requests are listed separately. |
| **Attendance** | My own attendance history: event, club, date. Visible only to me. |
| **Settings** | Notification preferences, Report an issue, About, Sign out. |

**Empty states:** "You haven't joined any clubs yet — explore clubs" and "No events
attended yet".

### F-08 acceptance criteria
- A student sees only their own attendance; there is no route to another student's.
- Reissuing the QR still invalidates the old code at the door immediately.

## 6. F-09 Home dashboard

Home stops redirecting to `/events` and becomes a dashboard:

1. **Header:** greeting with the student's name, avatar (opens Profile), notification
   bell with unread count.
2. **Next up:** the student's next registered event as an event card, with a
   "Show pass" button.
3. **Profile QR:** a collapsed card that expands to the QR.
4. **Today's mess:** see F-10.
5. **Your clubs:** a horizontal row of the student's clubs. Empty state: "Explore clubs".
6. **This week on campus:** three event cards, with "See all" linking to `/feed`.

**Navigation:** on mobile, a bottom nav with **Home · Feed · Clubs · Passes · Profile**.
On desktop, the existing side nav gains Home, Feed and Clubs.

### F-09 acceptance criteria
- Home loads even when Mess Mate or notifications are unavailable. Each card fails on
  its own (see F-10.3).
- Staff and organiser roles still land on their own pages; Home is the student landing
  page.

## 7. F-10 Mess menu from Mess Mate

Mess Mate already owns the mess menu. It is a Flask app backed by Google Sheets, and the
`menu` tab holds one row per date: `Date | Breakfast | Lunch | Dinner`. We **read** from
it and do not copy or edit the menu here.

### F-10.1 Change in Mess Mate: a read-only JSON API
Mess Mate has no menu JSON today (`/home` returns HTML; only `/health` returns JSON). Add:

| Route | Returns |
|---|---|
| `GET /api/menu?date=YYYY-MM-DD` | `{date, meals: {Breakfast: [...], Lunch: [...], Dinner: [...]}, timings: {...}}` |
| `GET /api/menu/week?start=YYYY-MM-DD` | Seven days in the same shape, plus `label` and `is_today` |

**Rules:**
- **Published items only.** Build these on `sheets.get_menu_for_date()` and
  `get_menu_week()`, but never return the `template` field. Mess Mate's rule — an
  unpublished day reads "not published yet", never a guessed menu — must hold here too.
- **Read-only.** No auth is needed, because the menu is already public on `/home`.
  Rate-limit the routes.
- **No personal data.** These responses must not include ratings, member or committee
  data.

### F-10.2 Change here: a cached server-side proxy
- **Module:** a small `mess` module in the Django backend calls Mess Mate
  server-to-server, using a `MESSMATE_BASE_URL` setting.
- **Cache:** responses are cached for about 5 minutes. Mess Mate already caches the sheet
  for 30 s; our cache stops Home from adding load on the sheet.
- **Our routes:** the frontend calls only our API, `GET /api/v1/mess/today` and
  `GET /api/v1/mess/week`, never Mess Mate directly.

### F-10.3 "Today's mess" card
- **Content:** shows the **next** meal first (Breakfast, Lunch or Dinner by time of
  day) with its serving time, the other two meals collapsed, and a day switcher for the
  week. There is one mess, so no hostel picker, and no Snacks meal.
- **Unpublished meal:** shows "Not published yet".
- **Mess Mate down or slow:** the card shows "Menu unavailable" with a link to Mess Mate.
  The rest of Home still loads. Use a short timeout (about 2 s).
- **Rate this meal:** a link to Mess Mate's `/home`.

### F-10.4 Ratings stay on Mess Mate
Meal ratings are **not** proxied. Mess Mate limits `/home/rate` to 3 a day **per IP
address**. Forwarded from our server, every student would share one IP and the whole
campus would be blocked after three ratings. Linking out keeps the limit per student and
keeps ratings anonymous, as Mess Mate intends.

### F-10 acceptance criteria
- With Mess Mate stopped, Home loads and the mess card reads "Menu unavailable".
- A day with no published row shows "Not published yet" for every meal, never template
  dishes.
- No request from a student's browser goes to Mess Mate except the "Rate this meal"
  link.

## 8. Data changes

### 8.1 `clubs.Club` — new fields
| Field | Type | Source |
|---|---|---|
| `email` | email, blank | wiki `src/data/clubContacts.js` |
| `linkedin_url` | URL, blank | wiki `clubContacts.js` (many are placeholders — leave blank) |
| `accent_light`, `accent_dark` | hex colour | wiki `src/components/clubAccents.js` |
| `logo` | image, blank | committee seals from wiki `committeeDirectory.js`; clubs to be supplied |
| `short_description` | text, ≤140 chars | wiki page descriptions |

`instagram_handle` already exists but the seed leaves it empty. Fill it from
`clubContacts.js`. Placeholder links in the wiki (`href: '#'`) are stored as blank and
never as `#`.

### 8.2 Seed corrections (`identity/management/commands/seed_demo.py`)
- **Renamed clubs.** Use the wiki's current names. Slugs stay stable so links don't
  break:

  | Seeded as | Current name |
  |---|---|
  | Gardening Club | **Sustainability Club** |
  | Gaming Club | **DOT.exe** |
  | Film Society | **Creators Club** |

- **Contacts and accents:** filled from the wiki for every club that has them.
- **Board names:** the wiki lists real students as Presidents and VPs. Demo data keeps
  **fictional** names unless the clubs agree otherwise (see §10).

### 8.3 New, for F-07 and F-08
- **Events API:** the `mine` / `search` filters on `GET /events`.
- **Attendance endpoint:** "my attendance history" — check whether participation already
  exposes it before adding one.
- **Optional follow:** a `ClubFollow` model, only if §10 decides follow is separate from
  join.

## 9. Rules from the master spec that shape these screens

- **Board tab is names and roles only.** A student never sees member attendance, any
  budget figure, or individual contact details (spec §3.1).
- **No "Show enthu" / "Interested" button.** It invites confusion with attendance, and
  self-marking is banned ("There is no route, anywhere in the system, by which a student
  records their own attendance"). Registration already covers intent.
- **No PRN barcode** on the profile card (F-08.1).
- **Internals stay with members.** Clubs a student has not joined show their public
  page only (spec §3.1, "Never sees").
- **Only our API in the browser.** The frontend talks to our backend; Mess Mate is
  called server-to-server (F-10.2).

## 10. Open decisions

| # | Question | Default if undecided |
|---|---|---|
| D-1 | **Follow vs join.** Add a lightweight "follow" (feed only, no roster), or treat membership as the follow? | Membership is the follow; no new model |
| D-2 | **Categories.** Some seeded categories look guessed (Gaming under Sports, Astronomy under Technical). The wiki does not provide categories. Who decides? | Keep current until the Cultural Society confirms |
| D-3 | **Real board names in demo data.** | Fictional names |
| D-4 | **Club announcements** for the feed: a new model, who may post (President, VP, Secretary?) and moderation. | Out of scope for F-07; events only |
| D-5 | **Club logos and covers.** Who supplies them, and in what sizes? | Initials on the accent colour |
| D-6 | **Mess Mate hosting.** Its production URL, and whether it can reach our backend's network. | Configure via `MESSMATE_BASE_URL`; card shows "unavailable" if unset |

## 11. Build order

| Order | Item | Depends on | Size |
|---|---|---|---|
| 1 | **F-06** Club fields, seed fixes, directory, club page | — | M |
| 2 | **F-07** Event card, `mine`/`search` filters, Feed | F-06 (club strip, accents) | M |
| 3 | **F-08** Profile ID card and tabs | F-06 (My clubs) | S–M |
| 4 | **F-10** Mess Mate JSON API, proxy, mess card | Mess Mate repo change | S |
| 5 | **F-09** Home dashboard | F-07, F-08, F-10 | M |

When an item is picked up, add it as a row in `docs/CHECKLIST.md` §C, in the same
format as F-01 to F-05.

---

# Part 2 — reporting, calendar, budgets, joining (added 2026-11-08)

Status: **built and tested 2026-11-08, not yet deployed.** The hosted site still runs the code from
before these changes until they are committed and redeployed. Board: `docs/CHECKLIST.md`, the
"Additional requirements" table (AR-01 to AR-08). Some of these items came out of review discussion
and are not in the PRD. Others were in the PRD but could not be used from the app.

| Id | Requirement | Who | State on 2026-11-08 |
|---|---|---|---|
| AR-01 | Post-event report form: attendance, photos, social posts, bills | Club officers, Treasurer | Built: one panel on the club's event page (`club/PostEventReport.tsx`), the student consent line and photo removal request, "No report yet" on the Dean's overview, and highlights and outreach in the semester report |
| AR-02 | Calendar for Cultural Society, Dean, VC and club presidents; only the Dean moves bookings | Society, Dean, VC, Presidents, VPs | Built: presidents and VPs see it, with other clubs' pending bookings shown as "Requested". The Dean moves a booking's time, venue or both (`DeanMoveTests`) |
| AR-03 | Wednesday open block: two 1-hour slots, first come first served | Presidents, VPs | Built: `POST/GET /open-block` (`tests/test_open_block.py`), an Open block card on Club events, and the two hours shaded on the calendar |
| AR-04 | Treasurer edits budget lines in text boxes, or uploads a CSV | Treasurer | Built: Edit all with one Save, and CSV upload that saves all rows or none (`BudgetCsvImportTests`) |
| AR-05 | A student can be in up to five clubs | Students | Built |
| AR-06 | Join requests page: approve one by one or in bulk | President, VP | Built: `/club/join-requests` with Select all, and each row shows its own result |
| AR-07 | A 1–2 page guide for the VC: how to use the platform and the benefits | VC, Anil sir | Written: `docs/user-guide/overview-for-vc.md` |
| AR-09 | Cultural Society Secretary and Vice-Secretary: they approve for the Society, move a proposal's time or venue while it is with them, and manage the Society's members (added 2026-11-14) | Society officers, Dean | Built: roles `cultural_society_secretary` and `cultural_society_vice_secretary`, **Society members** page (`/staff/society`), `tests/test_society.py`. See §13 |
| AR-10 | Proposal document uploaded with a new event; the budget either uploaded as a sheet (CSV, from the template) or entered by the Treasurer (added 2026-11-14) | Club officers, Treasurer, approvers | Built: `POST /events/{id}/proposal-document`, New event form, event page, approval page (`tests/test_proposal_document.py`). See §15 |
| AR-08 | Hosted link, details and the guide sent to Anil sir to forward to the VC | Anil sir | Email drafted (`EMAIL_TO_ANIL_SIR.md`). Waiting on the redeploy and a sign-in check on the hosted site, then the project lead sends it |

Tests on 2026-11-08: backend 469 passed (5 skipped), frontend 90 passed, plus the typecheck and the production build.
Not yet clicked through by hand in a browser.

## 12. AR-01 Post-event report form

**Why.** The semester report is only as good as what clubs hand in after each event. Today the
pieces sit on different screens. Photos and posts go on the event, bills go on the budget, and
attendance comes from the scans. Nothing asks the club for all of it together, so reports are
compiled by hand at the end of the semester. The PRD has the parts (§5.7.3, §5.10, §5.12.3, §5.14,
§5.19.4) but no single form.

**Who.** Club President, VP, Secretary, Treasurer and event organisers fill it in. The Dean and the
Cultural Society see what is missing, and the semester report reads it.

**What it does.** After every event, the club's event page shows one **Post-event report** panel:

1. **Attendance.** Registered, attended, walk-ins and no-shows, taken from the QR scans. They are shown, not typed in, so the report figure is counted, not estimated.
2. **Photos.** Several can be uploaded from a phone, each with a caption. Two or three are starred as highlights for the semester report.
3. **Social media posts.** Instagram, LinkedIn or other post links, with an optional screenshot.
4. **Bills and spend.** For each budget line, the actual amount spent and its invoices or bills (phone photos or PDFs). The Treasurer and President fill this in; other officers see "Treasurer to add bills".
5. **Outcomes** (required) and **Learnings**, then **Submit report**.

A checklist at the top says what is still missing.

**Rules.**
- At least one photo and the outcomes are needed to submit (PRD §5.10).
- **Bills do not block the report** (decided 2026-11-08). Missing bills show as "Bills outstanding" and
  block budget settlement only, as now: a bill on every line above ₹5,000, and a variance note on
  overspend. This departs from Event_Flows stage 8 on purpose.
- A social post is required only above an attendance the Student Life Office sets. The default is never.
- Students see a consent line when they register, and can ask for a photo of them to be removed.

**What it feeds.** In the semester report, each club gets one highlight photo, events held, students
reached, and bills total against sanctioned. The report also gets a highlights spread, a photo
gallery, and an outreach line (how many events were promoted, on which platforms). The Dean's
overview lists events with no report after 7 days, and clubs with no recent post.

**Done when.** A club runs an event, submits the report from the app with photos, posts and outcomes,
and the event shows as reported with its photos and attendance in the semester report. Bills added
later let the budget settle.

## 13. AR-02 Calendar for Society, Dean, VC and club presidents

**Why.** Clubs pick dates without seeing what else is booked, so clashes are found late.

**What it does.**
- Cultural Society members, the Dean and the VC see every booking: a week view with venues across, hours down and clashes marked.
- **Club presidents** see the same calendar. Their own club's bookings are shown in full. Other clubs'
  bookings that aren't approved yet show only as "Requested", without the title or club, because
  pending proposals stay private.
- **Only the Dean can move a booking**, to a new time, a new venue, or both (decided 2026-11-08). A move
  that clashes is refused. Each move is recorded with a reason, and registered students are told.
  Everyone else sees the calendar read-only.

**AR-09, added 2026-11-14: the Society's Secretary and Vice-Secretary.**
- The Cultural Society has two officers, a **Secretary** and a **Vice-Secretary**, one of each. Only
  they approve, return or reject a proposal at the Society's stage. Other Society members still see
  the calendar, the overview and the semester report, but have no approval queue.
- The two officers can **move a proposal's time, venue or both while it is waiting on the Society**.
  Once they approve it, only the Dean can move it. Club Presidents and Vice-Presidents see the
  calendar and never move a booking, including their own.
- Every move, by the Dean or an officer, **notifies the club's office bearers** (and the event's
  organisers and registered students) with the old and new time and venue and the reason.
- The officers **manage the Society's members** on the **Society members** page: add a person by
  institutional email, or remove a member. The Dean (or an administrator) appoints and removes the
  Secretary and Vice-Secretary; an officer cannot appoint, demote or remove an officer.

**Done when.** A president opens Calendar from the menu, and a student cannot. Only the Dean sees Move.
A move into an occupied hour is refused.

## 14. AR-03 Wednesday open block

**Why.** Wednesday afternoon is kept free for club activity. Clubs need a quick way to claim it
without a full proposal.

**What it does.**
- Every Wednesday has two bookable 1-hour slots: **3–4 pm and 4–5 pm** (decided 2026-11-08).
- Booking is **first come, first served and auto-approved.** The first club to book a venue for an
  hour gets it, and the next club is told it is taken. There is no budget and no approval chain.
- Each club can hold one slot per Wednesday. The Dean can still move or cancel a slot.
- Club Events shows an **Open block** card for the next Wednesday, with **Book 3–4 pm** and
  **Book 4–5 pm** for the President and VP. The calendar shades the two hours.

**Done when.** When two clubs try the same venue and hour, the second is refused. An open-block booking
outside Wednesday 3–5 pm is refused. A booked slot shows on the calendar at once.

## 15. AR-04 Treasurer budget editing and CSV upload

**AR-10, added 2026-11-14: the proposal document and the budget sheet on New event.**
- **New event** takes a **proposal document** (PDF or Word, up to 10 MB, optional). It can be attached
  or replaced on the club's event page while the proposal is a draft or returned, and is locked once
  submitted, so approvers read what was sent. Older versions are kept on record.
- The document is shown to the club's office bearers and to the Cultural Society, Dean, VC and admin
  (on the approval page, beside the budget). Students and plain members never see it.
- The budget has three routes on New event: a **template**, **Upload the budget sheet (CSV)** with a
  **Download the budget template** link (President, VP, Treasurer), or **None — the Treasurer enters
  it** line by line later.
- **Preview (AR-11, added 2026-11-14).** Everyone who can read a proposal (the club's office bearers,
  Society, Dean, VC, admin) opens it in the app from the event page or the approval page: a PDF in
  the browser's viewer, a `.docx` as its text (no layout or images), a legacy `.doc` as a download
  only. A chosen PDF or budget CSV can also be previewed before it is uploaded, on New event and on
  the Budget page; the CSV shows as a table. The uploaded CSV itself is not stored: it becomes the
  budget lines, which is what approvers read.
- With a file attached the app saves the draft, uploads the files, then sends it. If the sheet or the
  document is refused, the event stays a draft and the message says which step to redo.

**Why.** Treasurers price budgets in a spreadsheet first, and retyping each line is slow and error-prone.

**What it does.**
- **Edit all** turns every line's title (head) and amount into text boxes at once, saved with one Save.
  Adding or removing a single line works as now.
- **Upload CSV** takes columns `head,amount`, plus an optional `basis`. The Treasurer chooses whether to
  replace the existing lines or add to them. If any row is wrong, nothing is saved and each bad row is
  listed with its problem. A **Download template** link gives a ready-made file.
- Only the President, VP and Treasurer can do this, and only while the budget is a draft, returned or
  rejected. The checks are the same as for typed lines: no empty titles, no negative amounts and no
  duplicate titles.

**Done when.** A Treasurer's CSV replaces the lines. A file with one bad row changes nothing and names
that row. A member cannot upload.

## 16. AR-05 Five clubs per student

A student can be a member of up to **five** clubs, and a sixth join is refused with a clear message.
This is already built. What's left is fixing one test mock that still says three.

## 17. AR-06 Join requests page with bulk approve

**Why.** Popular clubs get dozens of requests at the start of a semester, and accepting them one by
one inside the roster is slow.

**What it does.**
- A **Join requests** page in the club menu, for the President and VP, shows how many are waiting.
- Each row shows the student's name, PRN, department, year and the date they asked.
- Each request can be accepted or declined on its own. To act on several, tick them (or
  **Select all**), then **Approve selected** or **Decline selected**.
- Each request is still decided separately, so a student already in five clubs is refused while the
  rest go through. Each row shows its result, and a summary reads, for example, "8 approved, 2 refused".
- The notification a president gets for a new request opens this page.

**Done when.** A president bulk-approves ten requests, one from a student already in five clubs.
Nine join, and that row explains why.

## 18. AR-07 Guide for the VC

This is a 1–2 page guide, `docs/user-guide/overview-for-vc.md`, also shareable as a link. It covers
what the platform is, its benefits, one line on how each role uses it, and how to sign in to the pilot.
It has two or three screenshots. Benefits to cover:

- **Approvals in one place.** Society → Dean → VC, with clashes and budget visible at each step. The VC sees only proposals above ₹50,000.
- **Counted attendance.** QR passes are scanned at the door, so attendance is counted, not estimated.
- **Budget control.** Lines are sanctioned one by one, bills are attached per line, and nothing settles without evidence.
- **A semester report without manual collation.** Participation, money, photos and outreach come from what clubs already entered.
- **One calendar.** Clashes are blocked at booking, the Dean has the final say on moves, and the Wednesday open block is easy to claim.

## 19. AR-08 Hosted link to Anil sir

- Frontend: <https://culturals-clubs-events.vercel.app>. Backend: <https://culturals-clubs-events-backend.vercel.app>.
- Before sending, redeploy both projects with today's changes, then check that every pilot role signs in on
  the hosted site and that the three things the email suggests trying work.
- `EMAIL_TO_ANIL_SIR.md` drafts the message: the link, three things to try, the pilot sign-in note,
  the VC guide, and a request to forward it to the VC. The project lead sends it.
- With pilot accounts, anyone with the link can sign in as any role, the VC included. The hosted site
  therefore runs on demo data only, with no real student data.

## 20. Decisions log (Part 2)

| Date | Decision |
|---|---|
| 2026-11-06 | The club membership cap is five |
| 2026-11-08 | The open block is Wednesday 3–4 pm and 4–5 pm, first come first served, auto-approved |
| 2026-11-08 | The Dean can move a booking's time and venue; nobody else can |
| 2026-11-08 | Missing bills do not block the post-event report; they block settlement only |
| 2026-11-08 | Vice-Presidents get the same calendar and open-block rights as Presidents, since a VP stands in for the President |
| 2026-11-08 | An open-block booking is refused if a pending proposal already holds that venue and hour, so the open block never jumps the queue |
| 2026-11-08 | An open-block booking is published at once with a nil budget ("Wednesday open block: no budget") |
| 2026-11-08 | Bulk approve sends one accept per request, in turn, so each student's five-club check and audit entry stay separate |
| 2026-11-14 | The Society's approval stage belongs to its Secretary and Vice-Secretary only; a plain Society member keeps read access |
| 2026-11-14 | The Society's officers may move a booking only while its proposal is at the Society's stage; after that the move is the Dean's |
| 2026-11-14 | Officers keep the Society's member list; only the Dean or an administrator appoints or removes an officer, and there is one of each |
| 2026-11-14 | On upgrade, a database with no Secretary gets one: the longest-standing Society account (`identity/migrations/0003`), so waiting proposals are not stranded |
| 2026-11-14 | The uploaded budget CSV is not kept. It becomes the budget lines, which is what approvers read; the original sheet is not needed (decided by the project lead) |
| 2026-11-08 | The Dean's move reuses the venue reassign: its record and notification now carry the old and new time as well |

## 21. Still to decide (Student Life Office)

- Above what attendance is a social post required? Default: never.
- How many days after an event is the report due? Default: 7.
- Should presidents see other clubs' pending requests on the calendar? Default: no, they show only as "Requested".
