// Smoke test + screenshots for the dashboard. No npm dependencies: drives a local
// Chrome/Edge over the DevTools protocol (Node 22+ has fetch and WebSocket built in).
//
//   node tools/check.mjs                 run checks (errors, NaN, overflow, timings, contrast)
//   node tools/check.mjs --shots <dir>   also save full-page screenshots of every view
//
// Exit code is non-zero if any check fails.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'Dashboard', 'premier-league-dashboard.html')).href;
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > -1 ? path.resolve(process.argv[shotsArg + 1]) : null;
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
const exe = process.env.CHROME || BROWSERS.find(p => fs.existsSync(p));
if (!exe) { console.error('No Chrome/Edge found; set CHROME=/path/to/browser'); process.exit(2); }

const PORT = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-check-'));
const browser = spawn(exe, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu', '--hide-scrollbars',
  '--no-first-run', `--user-data-dir=${profile}`, 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let targets;
for (let i = 0; i < 75; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.some(t => t.type === 'page')) break; } catch {}
  await sleep(200);
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let seq = 0; const pending = new Map(); const pageErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
};
await send('Page.enable'); await send('Runtime.enable');

async function load(width, { mobile = false, theme = 'light' } = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  // via about:blank so this is a real reload (PAGE# from PAGE#x would only be a same-document hash change)
  await send('Page.navigate', { url: 'about:blank' }); await sleep(50);
  await send('Page.navigate', { url: PAGE });
  for (let i = 0; i < 50; i++) { await sleep(100); if (await evaluate('typeof goToView === "function" && document.readyState === "complete"')) break; }
  // The page defaults to the light theme; pick the one under test explicitly
  await evaluate(`setTheme('${theme === 'dark' ? 'dark' : 'light'}', true)`);
  await sleep(150);
}

const failures = [];
const fail = msg => { failures.push(msg); console.log('  FAIL ' + msg); };
const VIEWS = {
  overview: "resetAll(); goToView('overview')",
  explore: "state.team=null; goToView('explore')",
  'explore-team': "state.team='Arsenal'; renderChips(); goToView('explore')",
  'detail-empty': "state.team=null; goToView('detail')",
  'detail-team': "state.team='Arsenal'; renderChips(); goToView('detail')",
  'detail-filtered': "state.team='Arsenal'; state.season='2024'; state.venue='Away'; onFilterChange(); goToView('detail')",
  story: "resetAll(); goToView('story')",
};

// 1. Layout + screenshots at desktop and phone widths (light and dark)
const themes = SHOTS ? ['light', 'dark'] : ['light'];
for (const theme of themes) {
  for (const [width, mobile] of [[1440, false], [390, true]]) {
    await load(width, { mobile, theme });
    for (const [name, js] of Object.entries(VIEWS)) {
      await evaluate(js); await sleep(250);
      const sw = await evaluate('document.documentElement.scrollWidth');
      if (sw > width) fail(`${name} @${width}px ${theme}: page is ${sw}px wide (horizontal scroll)`);
      if (name.startsWith('explore')) {
        // Re-render twice: charts must keep their size across redraws (catches charts that shrink to fit after a redraw)
        await evaluate('renderCurrentView(); renderCurrentView();');
        const narrow = await evaluate(`[...document.querySelectorAll('.view[data-view="explore"] .chart-body > svg')]
          .filter(s => s.getBoundingClientRect().width < Math.min(300, s.parentElement.parentElement.clientWidth - 60)).map(s => s.parentElement.id)`);
        if (narrow.length) fail(`${name} @${width}px ${theme}: charts collapsed after re-render: ${narrow.join(', ')}`);
      }
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        const h = await evaluate('Math.ceil(document.documentElement.scrollHeight)');
        await send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: 1, mobile });
        await sleep(300); await evaluate(js); await sleep(300);
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(path.join(SHOTS, `${name}-${width}${theme === 'dark' ? '-dark' : ''}.png`), Buffer.from(shot.result.data, 'base64'));
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile });
      }
    }
  }
}
console.log(`layout: checked ${Object.keys(VIEWS).length} views x 2 widths x ${themes.length} theme(s)` + (SHOTS ? `, screenshots in ${SHOTS}` : ''));

// 2. Filter sweep: every view x team x season x venue x result must render without errors or NaN/undefined text
await load(1440);
const sweep = await evaluate(`(() => {
  const errors = []; let renders = 0, bad = 0; const badSamples = [];
  const views = ['overview','explore','detail','story'];
  for (const team of [null, 'Arsenal', 'Luton Town', 'Brighton And Hove Albion'])
  for (const season of ['All', ...ALL_SEASONS.map(String)])
  for (const venue of ['All','Home','Away'])
  for (const result of ['All','W','D','L']) {
    Object.assign(state, { team, season, venue, result });
    for (const v of views) {
      try { goToView(v); renders++; } catch (e) { errors.push(v+'/'+team+'/'+season+'/'+venue+'/'+result+': '+e.message); continue; }
      const root = document.querySelector('.view[data-view="'+v+'"]');
      for (const el of root.querySelectorAll('*')) {
        if (el.children.length) continue;
        const txt = el.textContent + ' ' + (el.getAttribute('d')||'') + ' ' + (el.getAttribute('width')||'') + ' ' + (el.getAttribute('transform')||'');
        if (/NaN|undefined|Infinity/.test(txt)) { bad++; if (badSamples.length < 5) badSamples.push(v+': '+el.outerHTML.slice(0,120)); }
      }
    }
  }
  resetAll();
  return { renders, errors: errors.slice(0,10), errorCount: errors.length, bad, badSamples };
})()`);
console.log(`sweep: ${sweep.renders} renders, ${sweep.errorCount} errors, ${sweep.bad} NaN/undefined nodes`);
sweep.errors.forEach(e => fail('render error ' + e));
sweep.badSamples.forEach(s => fail('bad output ' + s));

// 3. Interaction checks: filters, reset, search, story figures, command menu, theme
const inter = await evaluate(`(() => {
  const out = {};
  resetAll(); goToView('overview');
  out.allSeasonsLabel = /all seasons/i.test(document.querySelector('.kpi-context').textContent);
  const s = document.getElementById('seasonSelect'); s.value = '2023'; s.dispatchEvent(new Event('change'));
  document.getElementById('resetBtn').click(); out.resetSyncsSelect = s.value === 'All';
  const inp = document.getElementById('searchInput'); inp.value = 'arse'; inp.dispatchEvent(new Event('input'));
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); out.searchSelects = state.team === 'Arsenal';
  inp.value = 'arse'; inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  out.searchKeepsSelection = state.team === 'Arsenal';
  resetAll();

  // Story figures are computed from data; they must match the hand-checked values from the report
  goToView('story');
  const story = document.getElementById('view-story').textContent;
  const expected = ['1.39 points','1.46 goals','1.35 goals','1.64 in','1.47 in','43.2%','34.0%','−0.25','−0.22','+0.32','430 total points','21.7%','9.2 percentage','0.11%','(1.40)','(1.38)','Norwich City','Sheffield United','Manchester City'];
  out.storyMissing = expected.filter(s => !story.includes(s));
  out.storyFigures = out.storyMissing.length === 0;

  // Command menu: Ctrl+K opens, typing filters, Enter runs, focus returns
  goToView('overview');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  out.cmdkOpens = !document.getElementById('cmdk').classList.contains('hidden') && document.activeElement.id === 'cmdkInput';
  const ci = document.getElementById('cmdkInput'); ci.value = 'wolves'; ci.dispatchEvent(new Event('input'));
  ci.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  out.cmdkRuns = state.team === 'Wolverhampton Wanderers' && state.view === 'detail' && document.getElementById('cmdk').classList.contains('hidden');
  resetAll(); goToView('overview');

  // Theme toggle: Light -> Dark -> Auto -> Light, tokens actually change
  const surf = () => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  const btn = document.getElementById('themeBtn');
  const seen = [];
  for (let i = 0; i < 3; i++) { btn.click(); seen.push((document.documentElement.dataset.theme || 'system') + ':' + surf()); }
  out.themeCycle = seen[0].startsWith('dark:') && seen[1].startsWith('system:') && seen[2].startsWith('light:') && seen[0].split(':')[1] !== seen[2].split(':')[1];
  out.themeSeen = seen;
  return out;
})()`);
const storyMissing = inter.storyMissing; delete inter.storyMissing;
const themeSeen = inter.themeSeen; delete inter.themeSeen;
if (storyMissing.length) console.log('  story missing:', storyMissing);
if (!inter.themeCycle) console.log('  theme cycle:', themeSeen);
Object.entries(inter).forEach(([k, ok]) => ok ? null : fail('interaction ' + k));
console.log('interactions:', JSON.stringify(inter));

// 3b. URL state: deep links restore view + filters, junk is ignored, Back returns to the previous view.
// Fresh page first: the sweep above makes >1000 history.replaceState calls and Chrome throttles the history API after that.
await load(1440);
const deepLoad = await (async () => {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(50);
  await send('Page.navigate', { url: PAGE + '#view=detail&season=2023&team=Liverpool' }); await sleep(800);
  return evaluate(`state.view === 'detail' && state.team === 'Liverpool' && state.season === '2023' && !document.getElementById('detailContent').classList.contains('hidden')`);
})();
if (!deepLoad) fail('url deepLinkOnLoad'); else console.log('url state: deep link on page load ok');
await load(1440);
const url = await evaluate(`(async () => {
  const tick = () => new Promise(r => setTimeout(r, 60));
  const out = {};
  location.hash = '#view=explore&season=2024&venue=Away&team=Arsenal'; await tick();
  out.deepLink = state.view === 'explore' && state.season === '2024' && state.venue === 'Away' && state.team === 'Arsenal'
    && document.getElementById('seasonSelect').value === '2024';
  location.hash = '#view=nope&season=1999&team=%3Cscript%3E&result=X'; await tick();
  out.rejectsJunk = state.view === 'overview' && state.season === 'All' && state.team === null && state.result === 'All';
  resetAll(); goToView('overview'); goToView('story'); await tick();
  history.back(); await tick();
  out.backButton = state.view === 'overview';
  return out;
})()`);
Object.entries(url).forEach(([k, ok]) => ok ? null : fail('url ' + k));
console.log('url state:', JSON.stringify(url));
await load(1440);

// 4. Render timings (ms, median of 5)
const perf = await evaluate(`(() => {
  const time = f => { const t = []; for (let i = 0; i < 5; i++) { const t0 = performance.now(); f(); t.push(performance.now() - t0); } t.sort((a,b)=>a-b); return +t[2].toFixed(1); };
  resetAll();
  const r = {};
  r.overview = time(() => goToView('overview'));
  r.explore = time(() => goToView('explore'));
  r.exploreFilter = time(() => { state.venue = state.venue === 'Home' ? 'All' : 'Home'; onFilterChange(); });
  r.exploreSvgNodes = document.querySelectorAll('.view[data-view="explore"] svg *').length;
  state.venue = 'All'; state.team = 'Arsenal';
  r.detail = time(() => goToView('detail'));
  resetAll(); goToView('overview');
  return r;
})()`);
console.log('timings (ms):', JSON.stringify(perf));

// 5. Contrast of text tokens against their backgrounds (WCAG AA 4.5:1), in light and dark
for (const theme of ['light', 'dark']) {
  await load(1440, { theme });
  const pairs = await evaluate(`(() => {
    const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const pairs = [['--text-1','--surface'],['--text-2','--surface'],['--text-3','--surface'],['--text-3','--bg'],['--text-2','--bg'],
      ['--win-fg','--surface'],['--draw-fg','--surface'],['--loss-fg','--surface'],
      ['--win-badge','--win-bg'],['--draw-badge','--draw-bg'],['--loss-badge','--loss-bg']];
    return pairs.map(([f,b]) => [f, b, +contrastRatio(v(f), v(b)).toFixed(2)]);
  })()`);
  const low = pairs.filter(p => p[2] < 4.5);
  low.forEach(p => fail(`contrast ${theme}: ${p[0]} on ${p[1]} is ${p[2]}:1`));
  console.log(`contrast ${theme}: ${pairs.length - low.length}/${pairs.length} pairs >= 4.5:1 (min ${Math.min(...pairs.map(p => p[2]))})`);
}

// 6. Copy lint: no dashes, colons, middle dots, hyphenated words or emoji in any visible text
await load(1440);
const copy = await evaluate(`(() => {
  const bad = /[\u2014\u2013:\u00B7]|[A-Za-z]-[A-Za-z]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  const found = new Set();
  const scan = label => {
    const texts = [document.title, ...document.body.innerText.split(String.fromCharCode(10))];
    document.querySelectorAll('[aria-label],[title],[placeholder],img[alt]').forEach(el =>
      ['aria-label','title','placeholder','alt'].forEach(a => el.getAttribute(a) && texts.push(el.getAttribute(a))));
    texts.forEach(t => { t = t.trim(); if (t && bad.test(t)) found.add(label + ' | ' + t.slice(0, 90)); });
  };
  for (const team of [null, 'Arsenal']) for (const v of ['overview','explore','detail','story']) { state.team = team; goToView(v); scan(v + (team ? '+team' : '')); }
  // Tooltips: focus every keyboard-reachable chart mark and read the tooltip it shows
  for (const v of ['overview','explore']) for (const team of [null, 'Arsenal']) {
    state.team = team; goToView(v);
    document.querySelectorAll('.view[data-view="' + v + '"] [tabindex="0"]').forEach(el => {
      el.dispatchEvent(new FocusEvent('focus'));
      const t = document.querySelector('.viz-tooltip').innerText.split(String.fromCharCode(10)).join(' ');
      if (bad.test(t)) found.add('tooltip ' + v + ' | ' + t.slice(0, 90));
    });
  }
  resetAll();
  return [...found];
})()`);
copy.slice(0, 20).forEach(t => fail('copy ' + t));
console.log(`copy lint: ${copy.length} problem line(s)`);

pageErrors.forEach(e => fail('page error ' + e));
ws.close(); browser.kill();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
