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
async function stress(url, label, count = 10) {
  await page.emulateMedia({media: 'screen'});
  await page.goto(url, {waitUntil: 'load'});
  await page.evaluate((count) => {
    const p = blankPerson('manual');
    p.meta.firstname = 'Stress'; p.meta.lastname = 'Fixture'; p.meta.position = 'Consultant'; p.meta.project = '10 competency regression';
    p.bank = []; p.sel = []; p.priority = []; p.methods = {};
    for (let i = 1; i <= count; i++) {
      const comp = `Competența ${i} — etichetă română lungă pentru verificarea paginării`;
      p.bank.push({name: comp, average: i === 10 ? null : 1 + i * .35, assessed: i !== 10, subs: []});
      p.sel.push(comp);
      p.priority.push({comp, sub: '', text: `Obiectiv ${i}: text românesc lung și realist pentru cazul maxim de imprimare`, included: true});
      p.methods[comp] = {picks: [
        {method: 'coaching', otherText: '', start: '2026-09-01', days: 14, who: i === 2 ? '' : `Responsabil ${i} cu un nume suficient de lung`},
        {method: 'feedback360', otherText: '', start: '2026-09-15', days: 10, who: `Coordonator ${i}`},
        {method: 'altele', otherText: i === 1 ? 'Metodă "<script> & linie\\nurmătoare' : `Metodă personalizată ${i} cu etichetă lungă`, start: '2026-09-25', days: 7, who: ''}
      ]};
    }
    p.notes = Array.from({length: 25}, (_, n) => `Linia de notă ${n + 1}: comentariu lung păstrat cu întreruperi explicite.`).join('\n');
    STATE.people = [p]; STATE.activeId = p.id; STATE.view = 'board'; render();
    setLang('en');
    document.getElementById('printArea').innerHTML = personPagesHtml(p, true);
    document.getElementById('printArea').style.display = 'block';
  }, count);
  await page.emulateMedia({media: 'print'});
  const result = await page.evaluate(() => ({
    pages: document.querySelectorAll('#printArea .page').length,
    objectives: document.querySelectorAll('#printArea .objectives-content>div').length,
    methodGroups: document.querySelectorAll('#printArea .method-summary-group').length,
    enHeading: document.querySelector('#printArea .method-summary')?.previousElementSibling?.textContent || '',
    enScore: document.querySelector('#printArea .rsec')?.textContent || '',
    objectiveHeight: document.querySelector('#printArea .page.portrait')?.getBoundingClientRect().height || 0,
    objectiveWidth: document.querySelector('#printArea .page.portrait')?.getBoundingClientRect().width || 0,
    blocks: [...document.querySelectorAll('#printArea .page.portrait .pdoc>*')].map(x => [x.className || x.tagName, Math.round(x.getBoundingClientRect().height)])
    ,grid: [...document.querySelectorAll('#printArea .page.portrait .sgwrap, #printArea .page.portrait .method-summary')].map(x => [x.className, getComputedStyle(x).display, getComputedStyle(x).gridTemplateColumns])
    ,groupHeights: [...document.querySelectorAll('#printArea .page.portrait .objectives-content>div, #printArea .page.portrait .method-summary-group')].map(x => Math.round(x.getBoundingClientRect().height))
  }));
  console.log(`${label} stress layout`, JSON.stringify(result));
  const expectedPages = 5 + Math.ceil(Math.max(0, count - 3) / 4);
  if (result.pages !== expectedPages || result.objectives !== count || result.methodGroups !== count) throw new Error(`stress DOM ${JSON.stringify(result)}`);
  if (!result.enHeading.includes('Applied methods') || !result.enScore.includes('Objectives')) throw new Error(`EN labels ${JSON.stringify(result)}`);
  await page.pdf({path: path.join(root, 'evidence', `${label}-stress.pdf`), format: 'A4', printBackground: true});
  await page.screenshot({path: path.join(root, 'evidence', `${label}-stress.png`), fullPage: true});
  checks.push(`PASS ${label} exact 10/30 stress DOM and EN labels`);
}
async function group(url, label) {
  await page.emulateMedia({media: 'screen'});
  await page.goto(url, {waitUntil: 'load'});
  await page.evaluate(() => {
    function fixture(first, last) {
      const p = blankPerson('manual'); p.meta.firstname = first; p.meta.lastname = last;
      p.bank = [{name: 'Leadership', average: 3.2, assessed: true, subs: []}]; p.sel = ['Leadership'];
      p.priority = [{comp: 'Leadership', sub: '', text: 'Obiectiv de grup', included: true}];
      p.methods = {Leadership: {picks: [{method: 'coaching', start: '2026-09-01', days: 7, who: 'Manager'}]}};
      return p;
    }
    const first = fixture('Primul', 'Participant'); const second = fixture('Al doilea', 'Participant');
    STATE.people = [first, second]; STATE.activeId = first.id; STATE.pdfCalRotate = true;
    document.getElementById('printArea').innerHTML = STATE.people.map(p => personPagesHtml(p, true)).join('');
    document.getElementById('printArea').style.display = 'block';
  });
  const result = await page.evaluate(() => ({pages: document.querySelectorAll('#printArea .page').length, text: document.getElementById('printArea').textContent}));
  if (result.pages !== 4 || result.text.indexOf('Primul Participant') > result.text.indexOf('Al doilea Participant')) throw new Error(`group boundaries ${JSON.stringify(result)}`);
  await page.emulateMedia({media: 'print'});
  await page.pdf({path: path.join(root, 'evidence', `${label}-group.pdf`), format: 'A4', printBackground: true});
  checks.push(`PASS ${label} multi-person group boundaries`);
}
await exercise(html, 'file');
await stress(html, 'file');
await page.emulateMedia({media: 'screen'});
await exercise(`http://127.0.0.1:${port}/`, 'http');
await stress(`http://127.0.0.1:${port}/`, 'http');
await stress(html, 'file-adversarial', 12);
await stress(`http://127.0.0.1:${port}/`, 'http-adversarial', 12);
await group(html, 'file');
await group(`http://127.0.0.1:${port}/`, 'http');
await browser.close(); server.close();
fs.writeFileSync(path.join(root, 'evidence', 'builder-checks.txt'), checks.join('\n') + '\n');
console.log(checks.join('\n'));
if (checks.some(x => x.startsWith('FAIL'))) process.exitCode = 1;
