// Uçtan uca test: sahte ses tanıma ile 1. gün derin + 4. gün hızlı oturum.
// Çalıştırma: npm run build && npx vite preview --port 4173 & node tests/e2e-days.cjs
const { chromium, devices } = require('playwright');
const words = require(require('path').join(__dirname, '..', 'content', 'words.json'));
const patterns = require(require('path').join(__dirname, '..', 'content', 'patterns.json'));
const SHOT = require('os').tmpdir() + '/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const all = [...words.map(w => w.text), ...patterns.map(p => p.text.replace(/…/g, ' '))].join(' . ');
  await ctx.addInitScript((say) => {
    window.__say = say;
    class FakeRec { start() { setTimeout(() => this.onresult && this.onresult({ resultIndex: 0, results: { length: 1, 0: Object.assign([{ transcript: window.__say, confidence: 0.9 }], { isFinal: true }) } }), 30); }
      stop() { setTimeout(() => this.onend && this.onend(), 20); } abort() {} }
    window.webkitSpeechRecognition = FakeRec; window.SpeechRecognition = FakeRec;
    window.speechSynthesis.speak = (u) => setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 10);
  }, all);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-24T20:00:00') });
  async function run(btn, pickRight) {
    await p.goto('http://localhost:4173/'); await p.waitForTimeout(600);
    await p.getByRole('button', { name: btn }).click();
    const seen = {};
    for (let i = 0; i < 150; i++) {
      await p.waitForTimeout(100);
      if (await p.locator('.stats').count()) break;
      const instr = (await p.locator('.instr').count()) ? await p.locator('.instr').first().textContent() : 'card';
      seen[instr] = (seen[instr] || 0) + 1;
      const talk = p.locator('.talk-btn').first();
      if (await talk.count()) { const box = await talk.boundingBox(); await p.mouse.move(box.x + 20, box.y + 20); await p.mouse.down(); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(300); }
      const opts = p.locator('.opt:not([disabled])');
      if (await opts.count()) {
        // doğru seçeneği bulmak için: tanıma adımında tr, yakalamada metin; bilinmiyorsa ilk
        await opts.nth(pickRight ? await rightIndex(p) : 0).click(); await p.waitForTimeout(100);
      }
      const dev = p.getByRole('button', { name: 'Devam' });
      if (await dev.count()) await dev.click();
    }
    console.log(btn, JSON.stringify(seen));
    console.log(' closing:', await p.locator('.stats').textContent().catch(() => 'NO CLOSING'));
    await p.getByRole('button', { name: 'Tamam' }).click().catch(() => {});
  }
  async function rightIndex(p) {
    // sahnede/cümlede geçen seçeneği tahmin et: seçeneklerin metnini words.json ile eşleştirip örnek cümlelere bak
    const texts = await p.locator('.opt').allTextContents();
    const ex = await p.evaluate(() => window.__lastSpoken || '');
    for (let i = 0; i < texts.length; i++) {
      const w = words.find(w => w.tr === texts[i] || w.text === texts[i]);
      if (w && ex && w.examples.some(e => e === ex)) return i;
    }
    return 0;
  }
  await p.addInitScript(() => {});
  await p.evaluate(() => {});
  await ctx.addInitScript(() => { const o = window.speechSynthesis.speak; window.speechSynthesis.speak = (u) => { window.__lastSpoken = u.text; o(u); }; });
  await run(/Derin/, true);
  await p.clock.setSystemTime(new Date('2026-11-28T20:00:00'));
  await run(/Hızlı/, true);
  await p.goto('http://localhost:4173/#/report'); await p.waitForTimeout(400);
  console.log('ladder:', (await p.locator('.ladder-row').allTextContents()).join(' | '));
  await p.goto('http://localhost:4173/#/library'); await p.waitForTimeout(400);
  await p.screenshot({ path: SHOT + 'e2e-library.png' });
  console.log('errors:', errs);
  await b.close();
})();
