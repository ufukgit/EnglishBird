# EnglishBird

Kanıta dayalı İngilizce konuşma ve dinleme pratiği. Yalnızca iPhone'da, ana ekrana eklenmiş PWA olarak çalışır.
Ürün ve teknik kararlar: [PLAN.md](PLAN.md).

## Yapı

```
src/          React + TypeScript uygulaması (PWA)
  sw.ts       Service worker: çevrimdışı önbellek + günlük hatırlatma bildirimi
  test/       iPhone ses testi (#/test)
worker/       Cloudflare Worker: LLM zinciri, yedek, bildirim zamanlayıcısı
content/      Önceden üretilmiş statik içerik (kelime, kalıp, senaryo, dinleme)
```

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```

## Kurulum (hepsi ücretsiz)

### 1. Uygulama — Cloudflare Pages
1. dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git → `EnglishBird` reposu.
2. Build command: `npm run build` · Output directory: `dist`.
3. Yayınlanan adres (ör. `https://englishbird.pages.dev`) `worker/wrangler.toml` içindeki `APP_ORIGIN` ile aynı olmalı.

### 2. Worker
```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create STORE     # çıkan id'yi wrangler.toml'a yaz
npm run vapid                              # iki değer üretir
npx wrangler secret put APP_SECRET         # uzun rastgele bir parola uydur
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_JWK
npm run deploy
```

### 3. iPhone
1. Safari'de uygulama adresini aç → Paylaş → **Ana Ekrana Ekle**.
2. Ayarlar → Genel → Klavye → **Dikteyi Etkinleştir** açık olmalı (Safari ses tanıması buna bağlı).
3. Uygulamayı ana ekrandan aç → **iPhone ses testini başlat**.
