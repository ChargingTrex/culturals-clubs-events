// Prints ../index.html to ../Culturals-guide-for-club-officials.pdf and reports the space left on each
// page (negative = overflow). PAGES=1,4 PNG_DIR=/tmp/x also writes those pages as PNGs to look at.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(new URL('../../../../clubs-and-culturals-platform/app/frontend/package.json', import.meta.url));
const { chromium } = require('playwright');
const out = fileURLToPath(new URL('../', import.meta.url));
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
await p.goto(new URL('../index.html', import.meta.url).href); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
const n = await p.locator('.page').count();
const over = await p.$$eval('.page', (ps) => ps.map((pg, i) => { const r = pg.getBoundingClientRect(); const f = pg.querySelector('footer'); const lim = f ? f.getBoundingClientRect().top : r.bottom; let m = 0; pg.querySelectorAll('*').forEach((e) => { if (e.closest('footer') || e.closest('.cover-shot') || e.closest('.frame') || e.closest('.tab')) return; m = Math.max(m, e.getBoundingClientRect().bottom); }); return [i + 1, Math.round(lim - m)]; }));
console.log('space above footer (px):', JSON.stringify(over));
if (process.env.PNG_DIR) {
  const which = process.env.PAGES ? process.env.PAGES.split(',').map(Number) : [...Array(n).keys()].map((i) => i + 1);
  for (const i of which) await p.locator('.page').nth(i - 1).screenshot({ path: `${process.env.PNG_DIR}/pg-${i}.png` });
}
await p.emulateMedia({ media: 'print' });
await p.pdf({ path: out + 'Culturals-guide-for-club-officials.pdf', preferCSSPageSize: true, printBackground: true });
await b.close();
