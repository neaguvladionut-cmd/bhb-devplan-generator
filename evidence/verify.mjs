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

async function setFixture() {
  await page.evaluate(() => {
    const p = blankPerson('manual');
    p.meta.firstname = 'Ana'; p.meta.lastname = 'Pop'; p.meta.position = 'Manager';
    p.bank = [{name: 'Leadership', average: 3.25, assessed: true, subs: []}, {name: 'Absent', average: null, assessed: false, subs: []}];
    p.sel = ['Leadership', 'Absent'];
    p.priority = [{comp: 'Leadership', sub: '', text: 'obiectiv', included: true}];
    p.methods = {Leadership: {picks: [{method: 'altele', otherText: 'Metodă "<script> & linie\nurmătoare', start: '2026-09-01', days: '14', who: 'Coordonator & <Ana>'}]}};
    STATE.people = [p]; STATE.groupProject = 'Project X'; STATE.migration = {legacyProjectAudit: [], conflict: false};
    STATE.activeId = p.id; STATE.view = 'board'; LAST_SAVED = snapshot(); render();
    document.getElementById('printArea').innerHTML = personPagesHtml(p, true);
    document.getElementById('printArea').style.display = 'block';
  });
}

async function exercise(url, label) {
  await page.emulateMedia({media: 'screen'});
  await page.goto(url, {waitUntil: 'load'});
  await check(`${label} launch and group Project field`, async () => {
    if (!(await page.locator('h1').first().isVisible())) throw new Error('app heading not visible');
    await page.getByRole('button', {name: /Continuă la grup|Continue to group/}).click();
    if (!(await page.locator('#groupProject').count())) throw new Error('group Project field absent');
  });
  await check(`${label} setup manual action and participant-first order`, async () => {
    await page.getByRole('button', {name: /Configurare|Setup/}).click();
    await page.getByRole('button', {name: /Adaugă persoană manuală/}).click();
    if (!(await page.locator('.steps').isVisible())) throw new Error('manual action did not enter board');
    const order = await page.evaluate(() => { const card=document.querySelector('.card'); const h3=card?.querySelector('h3'); const h4=card?.querySelector('h4'); return {h3:h3?.textContent||'',h4:h4?.textContent||''}; });
    if (order.h3!=='Detalii participant' || order.h4!=='Competențe') throw new Error(`details do not precede competencies ${JSON.stringify(order)}`);
    if (await page.getByText('Salvează & închide').count()) throw new Error('save-close copy remains');
    if (!(await page.getByRole('button', {name: 'Înapoi la grup'}).count())) throw new Error('back-to-group action absent');
    await page.evaluate(() => { STATE.groupProject = 'Unsaved'; LAST_SAVED = snapshot(); STATE.groupProject = 'Dirty'; render(); });
    await page.getByRole('button', {name: 'Înapoi la grup'}).click();
    const dirty = await page.evaluate(() => isDirty());
    if (!dirty) throw new Error('back-to-group cleared dirty state');
  });
  await page.evaluate(() => { STATE.view = 'roster'; STATE.groupProject = 'Project X'; render(); });
  await setFixture();
  await check(`${label} print identity, escaping and score invariants`, async () => {
    const result = await page.evaluate(() => ({
      title: document.querySelector('#printArea .portrait h2')?.textContent || '',
      meta: document.querySelector('#printArea .portrait .rmeta')?.textContent || '',
      raw: document.querySelector('#printArea .portrait .method-summary')?.innerHTML || '',
      summary: document.querySelector('#printArea .portrait .method-summary')?.textContent || '',
      values: [...document.querySelectorAll('.pdoc .sgval')].map(x => x.textContent),
      pages: document.querySelectorAll('#printArea .page').length,
      headers: [...document.querySelectorAll('#printArea .rcover h2')].map(x => x.textContent)
    }));
    if (result.title !== 'Ana Pop · Project X') throw new Error(`title ${result.title}`);
    if (result.meta.includes('Project X')) throw new Error('project duplicated in metadata');
    if (result.raw.includes('<script>')) throw new Error('hostile markup leaked');
    if (!result.summary.includes('Metodă "<script> & linie')) throw new Error('hostile text missing');
    if (!result.values.includes('3.3 / 5') && !result.values.includes('3,3 / 5')) throw new Error('score changed');
    if (!result.values.includes('neevaluată')) throw new Error('not-assessed state changed');
    if (result.pages !== 4 || result.headers.some(x => x !== 'Ana Pop · Project X')) throw new Error(`page identity ${JSON.stringify(result)}`);
  });
  await page.emulateMedia({media: 'print'});
  await page.pdf({path: path.join(root, 'evidence', `${label}.pdf`), format: 'A4', printBackground: true});
  await page.screenshot({path: path.join(root, 'evidence', `${label}.png`), fullPage: true});
}

async function migrationAndPersistence(url, label) {
  await page.emulateMedia({media: 'screen'}); await page.goto(url, {waitUntil: 'load'});
  await check(`${label} v2 agreed/conflict migration and v3 round-trip`, async () => {
    const result = await page.evaluate(() => {
      function legacy(project, first){ const p=blankPerson('import'); p.meta.firstname=first; p.meta.project=project; return p; }
      const agreed={v:2,people:[legacy(' Alpha ','One'),legacy('Alpha','Two')],assessment:{objectives:{},methods:null}};
      applySessionPayload(agreed,false);
      const one={value:STATE.groupProject,conflict:STATE.migration.conflict,hasMeta:STATE.people.some(p=>p.meta.project)};
      const conflict={v:2,people:[legacy('Alpha','One'),legacy('Beta','Two')],assessment:{objectives:{},methods:null}};
      applySessionPayload(conflict,false);
      const two={value:STATE.groupProject,conflict:STATE.migration.conflict,audit:STATE.migration.legacyProjectAudit.map(x=>x.value)};
      const v3={v:3,groupProject:'Gamma',migration:{legacyProjectAudit:[],conflict:false},people:[blankPerson('manual')],assessment:{objectives:{},methods:null}};
      applySessionPayload(v3,false); const snap=snapshot();
      const before=STATE.groupProject; const m=blankPerson('manual'); STATE.people.push(m); const after=STATE.groupProject;
      const parsed=parseImportXls('<table><tr><td>firstname</td><td>Imported</td></tr></table><table></table><table></table>');
      return {one,two,v3:snap.includes('"v":3') && snap.includes('Gamma'),manualStable:before===after,xlsNoProject:parsed.ok && !Object.prototype.hasOwnProperty.call(parsed.meta,'project')};
    });
    if (result.one.value!=='Alpha' || result.one.conflict || result.one.hasMeta) throw new Error(`agreed migration ${JSON.stringify(result)}`);
    if (result.two.value!=='' || !result.two.conflict || result.two.audit.join(',')!=='Alpha,Beta') throw new Error(`conflict migration ${JSON.stringify(result)}`);
    if (!result.v3) throw new Error('v3 snapshot missing canonical project');
    if (!result.manualStable || !result.xlsNoProject) throw new Error(`import/manual boundary ${JSON.stringify(result)}`);
  });
  await check(`${label} blank project title has no separator`, async () => {
    const result=await page.evaluate(()=>{ const p=blankPerson('manual'); p.meta.firstname='Ana';p.meta.lastname='Pop';STATE.people=[p];STATE.groupProject='';return reportTitle(p); });
    if (result!=='Ana Pop' || result.includes('·')) throw new Error(`blank title ${result}`);
  });
}

async function stressAndGroup(url, label) {
  await page.emulateMedia({media: 'screen'}); await page.goto(url, {waitUntil: 'load'});
  await check(`${label} stress and group chapter/person boundaries`, async () => {
    const result = await page.evaluate(() => {
      function fixture(first,last){
        const p=blankPerson('manual'); p.meta.firstname=first; p.meta.lastname=last; p.meta.position='Consultant';
        p.bank=[]; p.sel=[]; p.priority=[]; p.methods={};
        for(let i=1;i<=10;i++){ const c='Competența '+i+' — etichetă lungă'; p.bank.push({name:c,average:i===10?null:2+i*.2,assessed:i!==10,subs:[]}); p.sel.push(c); p.priority.push({comp:c,sub:'',text:'Obiectiv '+i+' text lung',included:true}); p.methods[c]={picks:[{method:'coaching',start:'2026-09-01',days:14,who:'Responsabil '+i}]}; }
        p.notes='Linie de notă\n'.repeat(25); return p;
      }
      const one=fixture('Primul','Participant'), two=fixture('Al doilea','Participant'); STATE.groupProject='Stress Project'; STATE.people=[one,two];
      const htmlOne=personPagesHtml(one,true), htmlGroup=htmlOne+personPagesHtml(two,true);
      document.getElementById('printArea').innerHTML=htmlGroup; document.getElementById('printArea').style.display='block';
      return {onePages:(htmlOne.match(/class="page/g)||[]).length,groupPages:(htmlGroup.match(/class="page/g)||[]).length,text:document.getElementById('printArea').textContent,headers:[...document.querySelectorAll('#printArea h2')].map(x=>x.textContent)};
    });
    if(result.onePages<6 || result.groupPages!==result.onePages*2) throw new Error(`stress pages ${JSON.stringify(result)}`);
    if(!result.headers.every(x=>x.endsWith(' · Stress Project'))) throw new Error('group project missing on continuation headers');
    if(result.text.indexOf('Primul Participant')>result.text.indexOf('Al doilea Participant')) throw new Error('person boundary order changed');
  });
  await page.emulateMedia({media: 'print'});
  await page.pdf({path: path.join(root, 'evidence', `${label}-stress.pdf`), format: 'A4', printBackground: true});
  await page.screenshot({path: path.join(root, 'evidence', `${label}-stress.png`), fullPage: true});
  await page.screenshot({path: path.join(root, 'evidence', `${label}-group.png`), fullPage: true});
  await page.pdf({path: path.join(root, 'evidence', `${label}-group.pdf`), format: 'A4', printBackground: true});
}

await exercise(html, 'file');
await migrationAndPersistence(html, 'file');
await stressAndGroup(html, 'file');
await exercise(`http://127.0.0.1:${port}/`, 'http');
await migrationAndPersistence(`http://127.0.0.1:${port}/`, 'http');
await stressAndGroup(`http://127.0.0.1:${port}/`, 'http');
await browser.close(); server.close();
fs.writeFileSync(path.join(root, 'evidence', 'builder-checks.txt'), checks.join('\n') + '\n');
console.log(checks.join('\n'));
if (checks.some(x => x.startsWith('FAIL'))) process.exitCode = 1;
