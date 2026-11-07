# Additional requirements and changes — student experience

**Clubs & Events application** · drafted 2026-11-03 · status: **proposed, not built**

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
