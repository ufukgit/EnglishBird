// Uçtan uca test: sahte Worker (akışlı LLM cevabı) ile senaryo akışı.
// Çalıştırma: npm run build && npx vite preview --port 4173 & node tests/e2e-scenario.cjs
const { chromium, devices } = require('playwright');
const path = require('path');
const words = require(path.join(__dirname, '..', 'content', 'words.json'));
const SHOT = require('os').tmpdir() + '/sc-';
const W = 'https://fake-worker.test';

function sse(obj) {
  const s = JSON.stringify(obj);
  const parts = [s.slice(0, 20), s.slice(20, 45), s.slice(45, 80), s.slice(80)];
  return parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
}

(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ ...devices['iPhone 13'], permissions: ['microphone'] });
  const all = words.map((w) => w.text).join(' . ');
  await ctx.addInitScript((say) => {
    window.__say = say;
    class FakeRec { start() { setTimeout(() => this.onresult && this.onresult({ resultIndex: 0, results: { length: 1, 0: Object.assign([{ transcript: window.__say, confidence: 0.9 }], { isFinal: true }) } }), 30); }
      stop() { setTimeout(() => this.onend && this.onend(), 20); } abort() {} }
    window.webkitSpeechRecognition = FakeRec; window.SpeechRecognition = FakeRec;
    window.speechSynthesis.speak = (u) => setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 10);
  }, all);
  let turn = 0; const calls = []; let nodeSay = all; let transcribes = 0;
  await ctx.route(W + '/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const body = req.postDataJSON ? (() => { try { return req.postDataJSON(); } catch { return null; } })() : null;
    calls.push(url.pathname + (body?.purpose ? ':' + body.purpose : '') + (body?.stream ? ':stream' : ''));
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (url.pathname === '/api/transcribe') { transcribes++; return route.fulfill({ status: 200, headers: h, body: JSON.stringify({ text: nodeSay, noSpeech: 0.01, words: [] }) }); }
    if (url.pathname === '/api/chat') {
      if (body.stream) {
        turn++;
        const done = turn >= 3;
        return route.fulfill({ status: 200, headers: { ...h, 'content-type': 'text/event-stream' }, body: sse({ reply: done ? 'Great, your room is ready. Good night!' : `Hello there, how can I help? This is turn ${turn}.`, notes: { errors: turn === 2 ? [{ quote: 'I want quiet room', fix: 'Could I have a quiet room?', kind: 'naturalness' }] : [], targetWordsUsed: [], patternUsed: false, goalProgress: turn / 3 }, done }) });
      }
      const p = body.messages[0].content;
      let content;
      if (body.purpose === 'analysis') content = JSON.stringify({ goalAchieved: true, corrections: [{ quote: 'I want quiet room', better: 'Could I have a quiet room, please?', whyTr: '"I want" kaba duyulur; rica için "Could I have" kullan.', kind: 'naturalness', tag: 'directness' }], goodUse: { quote: 'I have a reservation', whyTr: 'Doğal ve net.' }, itemEvidence: [{ id: 'w-order', rung: 5 }], patternSpontaneous: false, weakSpotsTr: ['doğrudan rica'] });
      else if (p.includes('natural versions')) content = JSON.stringify({ casual: 'Got a quiet room?', polite: 'Could I have a quiet room, please?', why: 'fark' });
      else content = JSON.stringify({ help: 'reservation, quiet, room' });
      return route.fulfill({ status: 200, headers: h, body: JSON.stringify({ choices: [{ message: { content } }] }) });
    }
    if (url.pathname === '/api/backup' && req.method() === 'GET') return route.fulfill({ status: 200, headers: h, body: 'null' });
    return route.fulfill({ status: 200, headers: h, body: '{"ok":true}' });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:4173/#/library'); await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Ayarlar' }).click();
  await p.locator('.field input').nth(0).fill(W);
  await p.locator('.field input').nth(1).fill('secret');
  await p.waitForTimeout(300);
  await p.goto('http://localhost:4173/'); await p.waitForTimeout(600);
  await p.getByRole('button', { name: /Hızlı/ }).click();
  const chatSay = 'I have a reservation and I would like to order a quiet room';
  const press = async () => { const t = p.locator('.talk-btn').first(); const box = await t.boundingBox(); await p.mouse.move(box.x + 20, box.y + 20); await p.mouse.down(); await p.waitForTimeout(900); await p.mouse.up(); await p.waitForTimeout(900); };
  let shots = 0;
  for (let i = 0; i < 120; i++) {
    await p.waitForTimeout(120);
    if (await p.locator('.stats').count()) break;
    if (await p.getByRole('button', { name: 'Başla' }).count()) { await p.screenshot({ path: SHOT + 'card.png' }); await p.getByRole('button', { name: 'Başla' }).click(); await p.waitForTimeout(600); continue; }
    if (await p.locator('.chat-log').count()) {
      await p.evaluate((t) => { window.__say = t; }, chatSay); nodeSay = chatSay;
      if (turn === 1 && !(await p.locator('.help-card').count())) { await p.getByRole('button', { name: /İpucu/ }).click(); await p.waitForTimeout(400); }
      if (await p.getByRole('button', { name: 'Sonucu gör' }).count()) { await p.screenshot({ path: SHOT + 'chat.png' }); await p.getByRole('button', { name: /Daha doğal/ }).first().click(); await p.waitForTimeout(400); await p.screenshot({ path: SHOT + 'chat2.png' }); await p.getByRole('button', { name: 'Sonucu gör' }).click(); await p.waitForTimeout(800); await p.screenshot({ path: SHOT + 'result.png' }); continue; }
      if (await p.locator('.talk-btn').count()) await press();
      continue;
    }
    if (await p.locator('.talk-btn').count()) await press();
    const opts = p.locator('.opt:not([disabled])');
    if (await opts.count() && !(await p.locator('.pattern-card').count())) { await opts.first().click(); await p.waitForTimeout(100); }
    const dev = p.getByRole('button', { name: 'Devam' });
    if (await dev.count()) await dev.click();
  }
  await p.waitForTimeout(400);
  await p.screenshot({ path: SHOT + 'closing.png' });
  await p.screenshot({ path: SHOT + 'end.png' });
  console.log('closing:', (await p.locator('.stats').textContent().catch(() => 'NO')) + ' | ' + (await p.locator('.report').textContent().catch(() => '')));
  console.log('calls:', calls.join(', ')); console.log('transcribe calls:', transcribes);
  await p.getByRole('button', { name: 'Tamam' }).click().catch(() => {});
  await p.clock?.install?.({ time: new Date(Date.now() + 2 * 86400000) }).catch(() => {});
  console.log('errors:', errs);
  await b.close();
})();
