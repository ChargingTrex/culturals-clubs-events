// Captures approver screens from the live demo at 2x, recording the boxes of the
// controls to highlight. Read-only: never clicks Approve / Reject / Return / Save.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
const require = createRequire(new URL('../../../clubs-and-culturals-platform/app/frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const BASE = 'https://culturals-clubs-events.vercel.app';
const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const boxes = fs.existsSync(OUT + 'boxes.json') ? JSON.parse(fs.readFileSync(OUT + 'boxes.json')) : {};
const only = process.argv[2];

const browser = await chromium.launch();
const settle = async (p, ms = 1500) => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(ms); };

async function session(email, { signinShot = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/'); await settle(p);
  await p.getByLabel('Institutional email').fill(email);
  await p.getByLabel('Password').fill('culturals-demo');
  if (signinShot) {
    const card0 = await rectOf(p, p.getByRole('heading', { name: 'Sign in' }), 300);
    await shot(p, 'signin-link', [ring(p.getByRole('button', { name: 'I have an authenticator code' }), 1)], pad(card0, 16));
  }
  await p.getByRole('button', { name: 'I have an authenticator code' }).click();
  await p.getByLabel(/authenticator code/i).fill('123456');
  if (signinShot) {
    const card = await rectOf(p, p.getByRole('heading', { name: 'Sign in' }), 300);
    await shot(p, 'signin', [
      ring(p.getByLabel(/authenticator code/i), 1),
      ring(p.getByRole('button', { name: 'Sign in', exact: true }), 2),
    ], pad(card, 16));
  }
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await settle(p, 2500);
  return p;
}

const ring = (loc, n) => ({ loc, n, type: 'ring' });
const pin = (loc, n) => ({ loc, n, type: 'pin' });
const pad = (r, d) => ({ x: Math.max(0, r.x - d), y: Math.max(0, r.y - d), width: r.width + 2 * d, height: r.height + 2 * d });

// Smallest ancestor of `loc` that is at least minH tall: the card the element sits in.
async function rectOf(p, loc, minH) {
  return loc.first().evaluate((el, minH) => {
    let e = el;
    while (e.parentElement && e.getBoundingClientRect().height < minH) e = e.parentElement;
    const r = e.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
  }, minH);
}

// clip: page coords (fullPage) or null for the viewport; full: whole page
async function shot(p, name, marks, clip = null, { full = false } = {}) {
  if (only && only !== name) return;
  const out = [];
  for (const m of marks) {
    const b = await m.loc.first().evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; });
    out.push({ type: m.type, n: m.n, ...b });
  }
  const sy = await p.evaluate(() => scrollY);
  let origin, size;
  if (clip) { origin = { x: clip.x, y: clip.y }; size = { w: clip.width, h: clip.height }; await p.screenshot({ path: OUT + name + '.png', clip, fullPage: true }); }
  else if (full) { const h = await p.evaluate(() => document.documentElement.scrollHeight); origin = { x: 0, y: 0 }; size = { w: 1280, h }; await p.screenshot({ path: OUT + name + '.png', fullPage: true }); }
  else { origin = { x: 0, y: sy }; size = { w: 1280, h: 800 }; await p.screenshot({ path: OUT + name + '.png' }); }
  boxes[name] = { w: size.w, h: size.h, marks: out.map(m => ({ ...m, x: m.x - origin.x, y: m.y - origin.y })) };
  fs.writeFileSync(OUT + 'boxes.json', JSON.stringify(boxes, null, 1));
  console.log('shot', name);
}

const scrollTo = async (p, loc) => { await loc.first().evaluate(el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(500); };

// ---------- Cultural Society ----------
{
  const p = await session('cultural.secretary@college.edu', { signinShot: true });
  await p.goto(BASE + '/staff/approvals/society'); await settle(p);
  await shot(p, 'society-queue', [ring(p.getByRole('link', { name: 'Review' }).nth(1), 1)]);
  const titles = await p.$$eval('main h3', hs => hs.map(h => h.innerText.trim()));
  const hrefs = await p.$$eval('main a', as => as.filter(a => a.innerText.trim() === 'Review').map(a => a.href));
  globalThis.bigHref = hrefs[titles.indexOf('Culturals Night 2026')];
  await p.getByRole('link', { name: 'Review' }).nth(1).click(); await settle(p);
  await shot(p, 'review-full', [
    pin(p.getByRole('heading', { name: 'Open Mic Night', level: 1 }), 1),
    pin(p.getByRole('link', { name: 'Open the venue calendar' }), 2),
    pin(p.getByRole('heading', { name: 'Budget' }), 3),
    pin(p.getByRole('heading', { name: 'Approval trail' }), 4),
    pin(p.getByRole('heading', { name: 'Your decision' }), 5),
  ], null, { full: true });
  await shot(p, 'review-top', [ring(p.getByRole('link', { name: 'Open the venue calendar' }), 1)]);
  await scrollTo(p, p.getByRole('heading', { name: 'Your decision' }));
  const dec = await rectOf(p, p.getByRole('heading', { name: 'Your decision' }), 200);
  await shot(p, 'society-decision', [
    ring(p.getByLabel(/Comment/), 1),
    ring(p.getByRole('button', { name: 'Return for changes' }), 2),
    ring(p.getByRole('button', { name: 'Reject' }), 3),
    ring(p.getByRole('button', { name: /^Approve/ }), 4),
  ], pad(dec, 12));
  await p.context().close();
}

// ---------- Dean ----------
{
  const p = await session('dean@college.edu');
  await p.goto(BASE + '/staff/approvals/dean'); await settle(p);
  await shot(p, 'dean-queue', [ring(p.getByRole('link', { name: 'Review' }).first(), 1)]);
  await shot(p, 'dean-menu', [
    pin(p.getByRole('link', { name: 'Dean approvals' }), 1),
    pin(p.getByRole('link', { name: 'Venues' }), 2),
    pin(p.getByRole('link', { name: 'Calendar' }), 3),
    pin(p.getByRole('link', { name: 'This semester' }), 4),
    pin(p.getByRole('link', { name: 'Semester report' }), 5),
  ], { x: 0, y: 0, width: 240, height: 400 });
  await p.getByRole('link', { name: 'Review' }).first().click(); await settle(p);
  await shot(p, 'dean-review-top', []);
  await scrollTo(p, p.getByRole('heading', { name: 'Your decision' }));
  const dec = await rectOf(p, p.getByRole('heading', { name: 'Your decision' }), 300);
  await shot(p, 'dean-decision', [
    ring(p.locator('main table input').first(), 1),
    ring(p.getByLabel(/Comment/), 2),
    ring(p.getByRole('button', { name: /^Approve/ }), 3),
  ], pad(dec, 12));

  await p.goto(BASE + '/staff/venues'); await settle(p);
  await shot(p, 'venues', [ring(p.getByText('Move this one', { exact: true }).first(), 1)]);
  const mv = p.getByText('Move venue', { exact: true }).first();
  await scrollTo(p, mv);
  await mv.click(); await p.waitForTimeout(1200);
  const card = await rectOf(p, p.getByLabel(/Move to/), 230);
  await shot(p, 'venues-move', [
    ring(p.getByLabel(/Move to/), 1),
    ring(p.getByLabel(/Reason/), 2),
    ring(p.getByRole('button', { name: 'Move', exact: true }), 3),
  ], pad(card, 14));

  await p.goto(BASE + '/staff/calendar'); await settle(p);
  await p.getByRole('button', { name: 'Next week' }).click(); await settle(p, 1000);
  await p.getByRole('button', { name: 'Next week' }).click(); await settle(p, 1000);
  await p.locator('main button', { hasText: /Tue\s*24/ }).click(); await settle(p, 1200);
  await shot(p, 'calendar', [ring(p.getByRole('button', { name: 'Next week' }), 1), ring(p.locator('main button', { hasText: /Tue\s*24/ }), 2)], null, { full: true });

  await p.goto(BASE + '/staff/overview'); await settle(p);
  await shot(p, 'overview', [ring(p.getByRole('link', { name: 'Open calendar' }), 1)]);
  await p.goto(BASE + '/staff/report'); await settle(p);
  await shot(p, 'report', [ring(p.getByRole('button', { name: 'Download CSV' }), 1)]);
  await p.context().close();
}

// ---------- Management / VC ----------
{
  const p = await session('vc@college.edu');
  await shot(p, 'vc-landing', []);
  await p.goto(globalThis.bigHref); await settle(p, 2000);
  await shot(p, 'vc-proposal', [
    pin(p.locator('main').getByText('Vice-Chancellor', { exact: true }).first(), 1),
    pin(p.getByText(/Goes to the Vice-Chancellor/), 2),
  ]);
  await shot(p, 'vc-full', [], null, { full: true });
  await p.context().close();
}
await browser.close();
