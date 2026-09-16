import { chromium } from '/Users/vladneagu/Claude/Cowork/Competency Profiler Platform/30-prototypes/tests/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = `file://${path.join(root, 'index.html')}`;
const server = http.createServer((req, res) => {
  const rel = req.url === '/' ? '/index.html' : req.url;
  const file = path.join(root, decodeURIComponent(rel));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  try { res.end(fs.readFileSync(file)); } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
const checks = [];
async function check(name, fn) { try { await fn(); checks.push(`PASS ${name}`); } catch (e) { checks.push(`FAIL ${name}: ${e.message}`); } }
async function exercise(url, label) {
  await page.goto(url, {waitUntil: 'load'});
  await check(`${label} launch`, async () => {
    if (!(await page.locator('h1').first().isVisible())) throw new Error('app heading not visible');
  });
  await check(`${label} setup manual action`, async () => {
    if (!(await page.getByText('Adaugă participant fără import').isVisible())) throw new Error('setup action absent');
    await page.getByRole('button', {name: /Adaugă persoană manuală/}).click();
    if (!(await page.locator('.steps').isVisible())) throw new Error('manual action did not enter board');
    await page.locator('.crumbs a').click();
    if (await page.getByRole('button', {name: /Adaugă persoană manuală/}).count()) throw new Error('manual action still on roster');
  });
  await page.evaluate(() => {
    const p = blankPerson('manual');
    const hostile = 'Metodă "<script> & linie\nurmătoare';
    p.meta.firstname = 'Ana'; p.meta.lastname = 'Pop'; p.meta.position = 'Manager'; p.meta.project = 'Fixture';
    p.bank = [{name: 'Leadership', average: 3.25, assessed: true, subs: []}, {name: 'Absent', average: null, assessed: false, subs: []}];
    p.sel = ['Leadership', 'Absent'];
    p.priority = [{comp: 'Leadership', sub: '', text: 'obiectiv', included: true}];
    p.methods = {Leadership: {picks: [{method: 'altele', otherText: hostile, start: '2026-09-01', days: '14', who: hostile}]} };
    STATE.people = [p]; STATE.activeId = p.id; STATE.view = 'board'; render();
    document.getElementById('printArea').innerHTML = personPagesHtml(p, true);
    document.getElementById('printArea').style.display = 'block';
  });
  await check(`${label} escaped methods and score graph`, async () => {
    const result = await page.evaluate(() => ({
      summary: document.querySelector('.method-summary')?.textContent || '',
      raw: document.querySelector('.method-summary')?.innerHTML || '',
      values: [...document.querySelectorAll('.pdoc .sgval')].map(x => x.textContent),
      pages: document.querySelectorAll('#printArea .page').length,
      headers: document.querySelectorAll('#printArea .rcover').length
    }));
    if (!result.summary.includes('Metodă')) throw new Error('methods summary missing');
    if (result.raw.includes('<script>')) throw new Error('hostile markup leaked');
    if (!result.summary.includes('14 zile')) throw new Error('duration missing');
    if (!result.summary.includes('Metodă "<script> & linie')) throw new Error('who/hostile text missing');
    if (result.pages !== 2 || result.headers !== 2) throw new Error(`page contract ${result.pages}/${result.headers}`);
    if (!(result.values.includes('3.3 / 5') || result.values.includes('3,3 / 5')) || !result.values.includes('neevaluată')) throw new Error(`score invariants ${result.values}`);
  });
  await page.emulateMedia({media: 'print'});
  await page.pdf({path: path.join(root, 'evidence', `${label}.pdf`), format: 'A4', printBackground: true});
  await page.screenshot({path: path.join(root, 'evidence', `${label}.png`), fullPage: true});
}
await exercise(html, 'file');
await page.emulateMedia({media: 'screen'});
await exercise(`http://127.0.0.1:${port}/`, 'http');
await browser.close(); server.close();
fs.writeFileSync(path.join(root, 'evidence', 'builder-checks.txt'), checks.join('\n') + '\n');
console.log(checks.join('\n'));
if (checks.some(x => x.startsWith('FAIL'))) process.exitCode = 1;
