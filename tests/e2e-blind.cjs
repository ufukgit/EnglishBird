// Habersiz test: 1. gün derin oturum, sonra 9. gün (gün sayacı 9) hızlı oturumda sürpriz test gelmeli.
const { chromium, devices } = require('playwright');
const path = require('path');
const words = require(path.join(__dirname, '..', 'content', 'words.json'));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const all = words.map((w) => w.text).join(' . ');
  await ctx.addInitScript((say) => {
    window.__say = say;
    class FakeRec { start() { setTimeout(() => this.onresult && this.onresult({ resultIndex: 0, results: { length: 1, 0: Object.assign([{ transcript: window.__say, confidence: 0.9 }], { isFinal: true }) } }), 30); }
      stop() { setTimeout(() => this.onend && this.onend(), 20); } abort() {} }
    window.webkitSpeechRecognition = FakeRec; window.SpeechRecognition = FakeRec;
    window.speechSynthesis.speak = (u) => setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 10);
  }, all);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-24T20:00:00') });
  async function run(btn) {
    await p.goto('http://localhost:4173/'); await p.waitForTimeout(600);
    await p.getByRole('button', { name: btn }).click();
    const bubbles = {};
    for (let i = 0; i < 150; i++) {
      await p.waitForTimeout(100);
      if (await p.locator('.stats').count()) break;
      const bub = (await p.locator('.step .bubble').count()) ? await p.locator('.step .bubble').first().textContent() : 'x';
      bubbles[bub] = (bubbles[bub] || 0) + 1;
      const talk = p.locator('.talk-btn').first();
      if (await talk.count()) { const box = await talk.boundingBox(); await p.mouse.move(box.x + 20, box.y + 20); await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up(); await p.waitForTimeout(300); }
      const opts = p.locator('.opt:not([disabled])');
      if (await opts.count() && !(await p.locator('.pattern-card').count())) { await opts.first().click(); await p.waitForTimeout(100); }
      const dev = p.getByRole('button', { name: 'Devam' });
      if (await dev.count()) await dev.click();
    }
    console.log(btn, Object.keys(bubbles).join(' | '));
    console.log(' closing:', await p.locator('.report').textContent().catch(() => ''));
    await p.getByRole('button', { name: 'Tamam' }).click().catch(() => {});
  }
  await run(/Derin/);
  await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('englishbird'); r.onsuccess = () => { const tx = r.result.transaction('meta', 'readwrite'); tx.objectStore('meta').put(9, 'dayCount'); tx.oncomplete = res; }; }));
  await p.clock.setSystemTime(new Date('2026-12-03T20:00:00'));
  await run(/Hızlı/);
  await p.goto('http://localhost:4173/#/report'); await p.waitForTimeout(500);
  console.log('report gate:', await p.locator('.stats').first().textContent());
  console.log('errors:', errs);
  await b.close();
})();
