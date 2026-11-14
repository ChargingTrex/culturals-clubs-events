// Captures the club officers' screens (dark theme, 2x) and records the boxes of the controls
// to mark. Runs against a local stack seeded by `seed_demo` + seed_guide.py, never the live
// demo: it types into forms and checks one student in at the door.
//   WEB=http://localhost:5261 node capture.mjs [shot-name]
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
const require = createRequire(new URL('../../../../clubs-and-culturals-platform/app/frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const BASE = process.env.WEB ?? 'http://localhost:5261';
const OUT = fileURLToPath(new URL('../shots/', import.meta.url));
const FIX = fileURLToPath(new URL('../../../../clubs-and-culturals-platform/app/e2e/fixtures/', import.meta.url));
const st = JSON.parse(fs.readFileSync(new URL('./state.json', import.meta.url)));
fs.mkdirSync(OUT, { recursive: true });
const boxes = fs.existsSync(OUT + 'boxes.json') ? JSON.parse(fs.readFileSync(OUT + 'boxes.json')) : {};
const only = process.argv[2];
const W = 1280, H = 800;

const browser = await chromium.launch();
const settle = async (p, ms = 900) => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(ms); };
const ring = (loc, n) => ({ loc, n, type: 'ring' });
const pin = (loc, n) => ({ loc, n, type: 'pin' });
const pad = (r, d) => ({ x: Math.max(0, r.x - d), y: Math.max(0, r.y - d), width: Math.min(W - Math.max(0, r.x - d), r.width + 2 * d), height: r.height + 2 * d });
const rect = (loc) => loc.first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; });
// Smallest ancestor of `loc` at least minH tall: the card the element sits in.
const cardOf = (loc, minH) => loc.first().evaluate((el, minH) => {
  let e = el; while (e.parentElement && e.getBoundingClientRect().height < minH) e = e.parentElement;
  const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
}, minH);
const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }; };
const scrollTo = async (p, loc) => { await loc.first().evaluate((el) => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(400); };

// clip: page coords; null = the viewport as scrolled; full: whole page
async function shot(p, name, marks, clip = null, { full = false } = {}) {
  if (only && only !== name) return;
  const out = [];
  for (const m of marks) {
    if ((await m.loc.count()) === 0) { console.log(`  ! ${name}: mark ${m.n} not found`); continue; }
    const b = await m.loc.first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; });
    out.push({ type: m.type, n: m.n, ...b });
  }
  const sy = await p.evaluate(() => scrollY);
  let origin, size;
  if (clip) { origin = { x: clip.x, y: clip.y }; size = { w: clip.width, h: clip.height }; await p.screenshot({ path: OUT + name + '.png', clip, fullPage: true }); }
  else if (full) { const h = await p.evaluate(() => document.documentElement.scrollHeight); origin = { x: 0, y: 0 }; size = { w: W, h }; await p.screenshot({ path: OUT + name + '.png', fullPage: true }); }
  else { origin = { x: 0, y: sy }; size = { w: W, h: H }; await p.screenshot({ path: OUT + name + '.png' }); }
  boxes[name] = { w: size.w, h: size.h, marks: out.map((m) => ({ ...m, x: m.x - origin.x, y: m.y - origin.y })) };
  fs.writeFileSync(OUT + 'boxes.json', JSON.stringify(boxes, null, 1));
  console.log('shot', name);
}

async function session(email, { signinShot = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: 'dark', timezoneId: 'Asia/Kolkata', locale: 'en-IN' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/signin'); await settle(p);
  await p.getByLabel('Institutional email').fill(email);
  await p.getByLabel('Password').fill('culturals-demo');
  if (signinShot) {
    const card = await cardOf(p.getByRole('heading', { name: 'Sign in' }), 300);
    await shot(p, 'signin', [ring(p.getByLabel('Institutional email'), 1), ring(p.getByLabel('Password'), 2), ring(p.getByRole('button', { name: 'Sign in', exact: true }), 3)], pad(card, 16));
  }
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForSelector('[data-testid="nav-sidebar"]'); await settle(p);
  return p;
}
const open = async (p, path, ms) => { await p.goto(BASE + path); await settle(p, ms); };
const main = (p) => p.locator('main');

// ---------- President (Music Club) ----------
{
  const p = await session('25la1001@college.edu', { signinShot: true });
  await open(p, '/club/events');
  const side = p.getByTestId('nav-sidebar');
  await shot(p, 'menu', ['Club events', 'New event', 'Budget', 'Members & roles', 'Join requests', 'Scan station', 'Calendar']
    .map((name, i) => pin(side.getByRole('link', { name, exact: true }), i + 1)), { x: 0, y: 0, width: 240, height: 800 });
  // The bell, before the page is opened (opening it clears the count).
  const bell = p.locator('[data-testid="notifications-bell"]:visible').last();
  await shot(p, 'bell', [ring(bell, 1)], { x: 760, y: 0, width: 520, height: 64 });
  await shot(p, 'events', [
    ring(main(p).getByRole('link', { name: 'New event' }).or(main(p).getByRole('button', { name: 'New event' })), 1),
    pin(main(p).getByText('Drafts', { exact: false }).first(), 2),
    ring(main(p).getByRole('button', { name: 'Send for approval' }).first(), 3),
    ring(main(p).getByRole('link', { name: 'Open' }).first(), 4),
  ], { x: 0, y: 0, width: W, height: 900 });
  const block = await cardOf(p.getByText(/Wednesday open block/), 100);
  await shot(p, 'open-block', [ring(p.getByRole('button', { name: /^Book / }).first(), 2), ring(p.locator('section[aria-label="Open block"] select').first(), 1)], pad(block, 10));

  // Notifications: first visit, so the unread ones are marked New.
  await bell.click(); await settle(p, 1200);
  const rows = p.getByTestId('notice');
  await shot(p, 'notifications', [
    pin(p.getByRole('note', { name: 'Edit colour key' }), 1),
    pin(p.getByRole('group', { name: 'Show' }), 2),
    pin(rows.filter({ hasText: 'Acoustic Sundown' }).first(), 3),
    pin(rows.filter({ hasText: 'Midnight Jam Session' }).first(), 4),
    pin(rows.filter({ hasText: 'Monsoon Unplugged' }).first(), 5),
  ]);
  await p.getByRole('button', { name: /Changes by approvers/ }).click(); await p.waitForTimeout(500);
  const cut = rows.filter({ hasText: 'The Dean changed the budget' }).first();
  await scrollTo(p, cut);
  await shot(p, 'notifications-changes', [pin(cut, 1), ring(cut.getByRole('link', { name: 'Open it' }), 2)]);

  // New event, filled in but not sent.
  await open(p, '/club/events/new');
  await p.locator('#ne-title').fill('Winter Acoustic Evening');
  await p.locator('#ne-venue').selectOption({ label: 'Music Room · seats 40' });
  const day = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  await p.locator('#ne-start').fill(day);
  await p.locator('#ne-desc').fill('An evening of acoustic sets by second-year members.');
  await p.locator('#ne-expected').fill('35');
  await p.locator('#ne-proposal').setInputFiles(FIX + 'proposal.pdf');
  await p.locator('#ne-template').selectOption({ label: 'Upload the budget sheet (CSV)' });
  await p.locator('#ne-sheet').setInputFiles(FIX + 'budget_ok.csv');
  await p.waitForTimeout(500);
  const drop = (id) => p.locator(`.cc-file:has(#${id})`);
  await shot(p, 'new-event', [
    ring(p.locator('#ne-title'), 1), ring(p.locator('#ne-venue'), 2), ring(p.locator('#ne-start'), 3),
    ring(p.locator('#ne-capacity'), 4), ring(p.locator('#ne-template'), 5), ring(drop('ne-sheet'), 6),
    ring(drop('ne-proposal'), 7), ring(p.getByRole('button', { name: 'Propose and send' }), 8),
  ], null, { full: true });
  await p.getByRole('button', { name: 'Preview the sheet' }).click(); await p.waitForTimeout(900);
  await shot(p, 'sheet-preview', [pin(p.getByRole('dialog').getByRole('table'), 1)]);
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click(); await p.waitForTimeout(500);

  // A proposal that is waiting, and was moved by the Society.
  await open(p, `/club/events/${st.moved.event}`);
  const when = await cardOf(p.getByText('When and where'), 120);
  const changes = await rect(p.locator('section[aria-label="Changes by approvers"]'));
  await shot(p, 'event-top', [
    pin(p.getByText('Awaiting approval').first(), 1),
    pin(p.getByText('When and where'), 2),
    ring(p.getByRole('link', { name: 'Open budget' }), 3),
    pin(p.locator('section[aria-label="Proposal document"]').getByRole('heading'), 4),
  ]);
  await shot(p, 'event-moved', [
    pin(p.getByText('When and where'), 1),
    pin(p.locator('section[aria-label="Changes by approvers"] .cc-tl-change').first(), 2),
    pin(p.locator('section[aria-label="Changes by approvers"] .cc-tl-comment'), 3),
  ], pad(union(when, changes), 10));

  // Returned: what the approver said, and what to do.
  await open(p, `/club/events/${st.returned.event}`);
  await shot(p, 'returned-top', [
    pin(p.getByText('Returned for changes').first(), 1),
    ring(p.getByRole('link', { name: 'Open budget' }), 3),
    ring(p.locator('.cc-file:has(#proposal-doc)'), 4),
    ring(main(p).getByRole('button', { name: 'Send for approval' }), 5),
  ]);
  const trail = await rect(p.locator('section[aria-label="Approval trail"]'));
  await shot(p, 'returned-trail', [pin(p.locator('section[aria-label="Approval trail"] .cc-tl-comment'), 1)], pad(trail, 10));

  // Rejected: final.
  await open(p, `/club/events/${st.rejected.event}`);
  const rtrail = await rect(p.locator('section[aria-label="Approval trail"]'));
  const del = await cardOf(p.getByText('Delete this proposal'), 100);
  await shot(p, 'rejected', [
    pin(p.locator('section[aria-label="Approval trail"] .cc-tl-comment'), 1),
    ring(p.getByRole('button', { name: 'Delete' }), 2),
  ], pad(union(rtrail, del), 10));

  // The two seeded examples: every gate, and what each approver changed.
  await open(p, `/club/events/${st['Founders’ Day Concert'].event}`);
  const ftrail = p.locator('section[aria-label="Approval trail"]');
  await shot(p, 'approved-trail', [
    pin(ftrail.locator('.cc-tl-item').nth(0), 1),
    pin(ftrail.locator('.cc-tl-change').first(), 2),
    pin(ftrail.locator('.cc-tl-item').nth(2), 3),
  ], pad(await rect(ftrail), 10));
  await shot(p, 'go-live', [ring(p.getByRole('button', { name: 'Go live' }), 1), ring(main(p).getByRole('link', { name: 'Scan station' }), 2)], { x: 240, y: 60, width: 1040, height: 190 });
  await open(p, `/club/events/${st['Laser Light Night'].event}`);
  const ltrail = p.locator('section[aria-label="Approval trail"]');
  await shot(p, 'vc-rejected-trail', [pin(ltrail.locator('.cc-tl-change').first(), 1), pin(ltrail.locator('.cc-tl-comment').last(), 2)], pad(await rect(ltrail), 10));

  // Calendar.
  await open(p, '/staff/calendar', 1500);
  await shot(p, 'calendar', [
    pin(p.locator('section[aria-label="Upcoming events"] h3'), 1),
    ring(p.getByRole('button', { name: 'Next month' }), 2),
    ring(p.locator('label:has-text("Go to date") input'), 3),
    pin(p.locator('[aria-label="Week"]'), 4),
  ], null, { full: true });

  // Members.
  await open(p, '/club/roster');
  await shot(p, 'roster', [
    ring(main(p).locator('table select').first(), 1),
    pin(main(p).getByText('Meera Krishnan'), 2),
    ring(p.getByRole('link', { name: 'Open join requests' }), 3),
    pin(p.getByRole('heading', { name: 'Handover' }), 4),
  ], null, { full: true });
  await open(p, '/club/join-requests');
  await shot(p, 'join', [
    ring(main(p).locator('input[type="checkbox"]').nth(1), 1),
    ring(p.getByRole('button', { name: 'Accept', exact: true }).first(), 2),
    ring(p.getByRole('button', { name: 'Decline', exact: true }).first(), 3),
    ring(p.getByRole('button', { name: /Approve selected/ }), 4),
  ], { x: 240, y: 60, width: 1040, height: 400 });
  await p.context().close();
}

// ---------- Treasurer (Music Club) ----------
{
  const p = await session('24ec1003@college.edu');
  await open(p, '/club/budget');
  await shot(p, 'budget-list', [ring(main(p).getByRole('link', { name: /Monsoon Unplugged/ }).first(), 1)]);
  await open(p, `/club/budget/${st.returned.budget}`);
  await shot(p, 'budget-edit', [
    ring(p.getByRole('button', { name: 'Edit all' }), 1),
    ring(p.getByRole('button', { name: 'Edit', exact: true }).first(), 2),
    ring(p.getByLabel('Add an entry'), 3),
    ring(p.locator('.cc-file:has(#line-csv)'), 4),
    ring(p.getByRole('link', { name: 'Download template' }), 5),
    ring(p.getByRole('button', { name: 'Send for approval' }), 6),
  ], null, { full: true });
  await open(p, `/club/budget/${st['Founders’ Day Concert'].budget}`);
  const entries = await cardOf(p.getByRole('heading', { name: 'Entries' }), 250);
  await shot(p, 'budget-sanctioned', [
    pin(main(p).getByText('Sanctioned', { exact: true }).nth(1), 1),
    pin(main(p).getByText('₹10,200').first(), 2),
  ], pad(union({ x: 250, y: 60, width: 1020, height: 10 }, entries), 8));
  const spend = p.getByRole('heading', { name: 'Spend and receipts' });
  await scrollTo(p, spend);
  const firstLine = await cardOf(p.getByLabel('Spent (₹)').first(), 150);
  await shot(p, 'budget-spend', [
    ring(p.getByLabel('Spent (₹)').first(), 1),
    ring(p.getByLabel('Note').first(), 2),
    ring(p.getByRole('button', { name: 'Save' }).first(), 3),
    ring(p.locator('.cc-file').first(), 4),
    ring(p.getByRole('button', { name: 'Attach' }).first(), 5),
  ], pad(union(await rect(spend), firstLine), 14));
  await p.context().close();
}

// ---------- Photography Club president: the door and the report ----------
{
  const p = await session('22la1031@college.edu');
  await open(p, `/scan?event=${st['Heritage Photowalk'].event}`, 1500);
  await shot(p, 'scan', [
    ring(p.getByLabel('Event at this door'), 1),
    ring(p.getByRole('button', { name: 'Start camera' }), 2),
    ring(p.getByLabel('Pass code'), 3),
    ring(p.getByLabel(/No phone/), 4),
    pin(p.getByText('At the door'), 5),
    pin(p.getByText('Recent scans'), 6),
  ], { x: 240, y: 60, width: 1040, height: 1050 });
  // One walk-up without a phone, checked in by PRN.
  await p.getByLabel(/No phone/).fill(process.env.WALKUP_PRN ?? '24BB1050');
  await p.getByRole('button', { name: 'Check in by PRN' }).click(); await p.waitForTimeout(1500);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  await shot(p, 'scan-verdict', [pin(p.getByText(/^(Checked in|Already checked in|Registered and checked in)$/).first(), 1)]);
  const att = p.getByRole('heading', { name: 'Attendees' });
  await scrollTo(p, att);
  const attCard = await rect(att);
  await shot(p, 'scan-attendees', [ring(p.getByLabel('Find by name or PRN'), 1), pin(p.getByRole('button', { name: 'Not yet' }), 2)], { x: 250, y: attCard.y - 20, width: 1020, height: 420 });

  await open(p, `/club/events/${st['Heritage Photowalk'].event}`);
  const report = p.locator('section[aria-label="Post-event report"]');
  const r = await rect(report);
  const outcomes = await rect(report.getByText('Outcomes and learnings'));
  const bills = await rect(report.getByText('Bills and spend'));
  await shot(p, 'report-top', [
    pin(report.locator('ul[aria-label="Checklist"]'), 1),
    pin(report.getByText('Attendance', { exact: true }), 2),
    ring(report.locator('.cc-file').first(), 3),
    ring(report.getByLabel(/Post link/), 4),
  ], { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: bills.y - r.y + 5 });
  await shot(p, 'report-bills', [
    ring(report.getByLabel('Spent (₹)').first(), 1),
    ring(report.locator('.cc-file').nth(2), 2),
  ], { x: r.x - 10, y: bills.y - 14, width: r.width + 20, height: 330 });
  await shot(p, 'report-submit', [
    ring(report.getByLabel(/Outcomes \(required\)/), 1),
    ring(report.getByLabel(/Learnings/), 2),
    ring(report.getByRole('button', { name: 'Submit report' }), 3),
  ], { x: r.x - 10, y: outcomes.y - 14, width: r.width + 20, height: r.y + r.height - outcomes.y + 24 });
  await p.context().close();
}
await browser.close();
