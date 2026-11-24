# EnglishBird — Plan ve Kararlar

Bu dosya, "İngilizce Uygulaması — Planlama Dokümanı" (24 Kasım 2026) ve sonrasında alınan
kararların tek kaynaklı özetidir. Doküman ile bu dosya çelişirse **bu dosya geçerlidir**.

## 1. Amaç (özgün brief'ten)

- Günlük konuşma dilini geliştirmek: konuşulanı anlamak ve konuşabilmek, özgüven kazanmak.
- Kendini kandırmayı önlemek: "her gün girdim" ilerleme sayılmaz, yalnızca kanıt sayılır.
- Ezber yalnızca kelime ve kalıpta; geri kalan her şey gerçek zamanlı etkileşim, akışı bozmayan
  geri bildirim ve düşük kaygılı pratik.
- Konuşma ve dinleme aynı konuda bile farklı içerik verir; ikisi için ayrı ayrı 1.200+ senaryo.
- Her gün 1 kalıp + 10 kelime, kesin öğrenilene kadar farklı yollarla.
- Sade arayüz: 4 ekran, her ekranda tek ana eylem.

## 2. Kesinleşen kararlar

| Konu | Karar |
|---|---|
| Kullanıcı | Yalnızca Ufuk. Hesap/giriş yok. Başkasıyla paylaşılmayacak. |
| Cihaz | **Yalnızca iPhone.** Safari'den "Ana Ekrana Ekle" ile PWA olarak kurulur (zorunlu: iOS, kurulmamış sitelerin verisini 7 gün sonra silebilir). |
| Bütçe | **0 ₺.** Geliştirme ve kullanımda hiçbir ücretli servis yok. |
| Repo | GitHub `ufukgit/EnglishBird`, **gizli**. |
| Arayüz | React + TypeScript + Vite, PWA. Arayüz Türkçe, içerik İngilizce. Açık/koyu tema iPhone ayarına uyar. |
| Barındırma | Cloudflare Pages (gizli repoyu ücretsiz yayınlar). |
| Ara katman | Cloudflare Worker (ücretsiz): API anahtarlarını saklar, LLM sağlayıcı zinciri, günlük yedek (KV), bildirim zamanlayıcısı. Tek bir kişisel gizli anahtarla korunur. |
| Yerel veri | IndexedDB, internet yokken de çalışır. Her oturum sonunda Worker KV'ye yedek. |
| Ses tanıma | **Karma (iPhone testi sonrası, 24.11.2026):** Sohbet turlarında Safari `webkitSpeechRecognition`, sürekli modda bas-konuş; düğme bırakılınca son sonuç alınır. Telaffuz odaklı egzersizlerde (shadowing, hedef cümle, minimal çiftler) ve Safari hata verdiğinde Groq Whisper (ücretsiz). |
| Seslendirme | iOS `speechSynthesis`: Samantha (en-US), Daniel (en-GB), Karen (en-AU), Rishi (en-IN), ek olarak Moira (en-IE), Tessa (en-ZA). Eğlence sesleri (Bahh, Bells, Zarvox…) filtrelenir. Kelime sınırı olayları çalışıyor, yani etkileşimli transkript vurgusu mümkün. |
| Ses analizi | Web Audio API: duraksama, perde eğrisi, arka plan sesi, telefon filtresi (300–3400 Hz). |
| Mikrofon | Varsayılan bas-konuş; otomatik dinleme ayarlardan açılır. |
| Uygulama adı | EnglishBird |

### LLM zinciri (hepsi ücretsiz katman)

Worker sırayla dener; bir sağlayıcı limit/hata verirse sıradakine geçer.

| Sıra | Sağlayıcı | Model | Kullanım |
|---|---|---|---|
| 1 | Groq | `openai/gpt-oss-120b` | Konuşma turları (en hızlı) |
| 2 | Google Gemini | Flash (analiz), Flash-Lite (yedek tur) | Oturum sonu analizi, yedek |
| 3 | OpenRouter | `:free` modeller | Yedek |
| 4 | Cloudflare Workers AI | ücretsiz kota modelleri | Son yedek |

- Hepsi OpenAI uyumlu arayüzle çağrılır; sağlayıcı eklemek/çıkarmak tek yapılandırma satırıdır.
- Free tier limitleri sık değişir; gerçek rakamlar her sağlayıcının konsolundan doğrulanır.
- Gemini free tier verileri eğitimde kullanabilir — bilerek kabul edildi.
- Ücretsiz limitlere sığmak için **içerik önceden üretilir** (bkz. §4); çalışma anında LLM yalnızca
  canlı konuşma turları ve oturum analizi için çağrılır.

### Günlük hatırlatma

- iOS 16.4+ Web Push (yalnızca ana ekrana eklenmiş uygulamada çalışır).
- **Her gün 20:00'de** başlar, **01:00'e kadar saat başı** tekrarlanır: 20, 21, 22, 23, 00, 01
  (İstanbul saati, UTC+3 → cron `0 17-22 * * *` UTC).
- O günün "Bugün" oturumu tamamlandıysa kalan hatırlatmalar gönderilmez.
  00:00 ve 01:00 hatırlatmaları önceki günün oturumuna aittir.
- Metin nötrdür, baskı kurmaz: "Bugünün oturumu hazır."

### İçerik kaynakları (ücretsiz, açık lisanslı)

| Ne için | Kaynak | Lisans |
|---|---|---|
| Kelime seçimi + CEFR A1–B2 | CEFR-J Wordlist 1.5 (Tono Lab, TUFS) | Araştırma ve ticari kullanımda atıfla ücretsiz (repo README'sinde doğrulandı) |
| CEFR C1–C2 | Octanove C1/C2 profili | CC BY-SA 4.0 |
| Örnek cümle | Tatoeba (Türkçe çevirili) | CC BY 2.0 FR |
| Telaffuz/fonem | CMU Pronouncing Dictionary | BSD tarzı |
| Kalıplar, öbekler, senaryolar, dinleme metinleri | Projede sıfırdan üretilir | Projeye ait |

NGSL-Spoken planlanmıştı ama sitesine geliştirme ortamından erişilemedi; kelimeler CEFR-J listesinden,
günlük konuşmadaki işlevselliğe göre elle seçildi. SUBTLEX-US kullanılmaz (CC BY-NC-ND, türetmeye izin vermez). PHRASE List yalnızca kontrol
referansıdır, içeriği kopyalanmaz. Atıflar `CREDITS.md` dosyasındadır.

## 3. Ürün tasarımı (dokümandan, değişmeden)

- **Günlük akış:** Isınma → Günün kalıbı → Günün 10 kelimesi → Senaryo → Kapanış. Hızlı (5 dk) / Derin (15–20 dk).
- **Ustalaşma merdiveni:** Tanıdı → Hatırladı → Duydu → Kullandı → Kendiliğinden kullandı → Kalıcı.
- **Tekrar:** FSRS (`ts-fsrs`). Bekleyen tekrar > 80 ise o gün 5 yeni kelime.
- **Konuşma:** AI karakterle görev odaklı roleplay, 4 kademeli yardım merdiveni, "Daha doğal nasıl derim?",
  sohbet sırasında düzeltme yok, sonda en fazla 3 düzeltme kartı, ikinci tur.
- **Dinleme:** transkriptsiz dinle → tekrar dinle → transkript → kaçırılanların nedeni.
  0.75×/1×/1.25×, arka plan sesi, dikte, shadowing, etkileşimli transkript, mikro beceriler.
- **Senaryo motoru:** katalog iskeleti (JSON) + AI'nın her oynanışta yeniden giydirmesi; 12 alan, 12 olay türü.
- **CEFR:** konuşma ve dinleme ayrı, A1–C1, her bantta 3 alt basamak, hedef başarı %70–80.
- **Rapor:** günlük 4 satırlık kart, haftalık rapor, haftalık habersiz test, zayıf yönden eyleme.
- **Arayüz:** Ana, Oturum, Rapor, Kütüphane.
- **Görsel dil (25.11.2026 kullanıcı kararı, dokümandaki "maskot yok" kuralını günceller):** renkli ve yuvarlak,
  az metin, oyunsu. Var: kuş maskot (yönergeleri kısa tepkilerle verir, ruh hali: dinliyor/düşünüyor/sevindi/üzüldü),
  senaryo ve sahne karakterleri, animasyonlar, ses efektleri (Web Audio, mikrofon açıkken çalmaz).
  Hâlâ yok: rozet, puan, can, seri, konfeti — ilerleme yalnızca kanıtla gösterilir.

## 4. Mimari

```
iPhone (PWA)                                   Cloudflare (ücretsiz)
┌─────────────────────────────┐              ┌──────────────────────────────┐
│ React UI (4 ekran)          │   HTTPS      │ Worker                       │
│ Ses tanıma (Safari / Whisper)│ ───────────▶ │  /api/chat   → LLM zinciri   │
│ speechSynthesis, Web Audio  │              │  /api/backup → KV            │
│ IndexedDB (tüm durum)       │              │  /api/push/* → abonelik      │
│ Statik içerik (JSON)        │ ◀─────────── │  cron 17–22 UTC → Web Push   │
│ Service worker (offline+push)│   push       └──────────────────────────────┘
└─────────────────────────────┘
```

Önceden üretilen statik içerik (`content/`): kelimeler, kalıplar, egzersiz cümleleri,
senaryo iskeletleri, dinleme metinleri ve soruları.

## 5. Yol haritası

| Aşama | İçerik | Kapı |
|---|---|---|
| **0 · Temel ve içerik iskeleti** | Proje iskeleti, **iPhone ses testi sayfası**, Worker iskeleti; 300 kelime + 60 kalıp (CEFR etiketli), 100 senaryo iskeleti, beklenmedik olay listesi, sistem talimatları | iPhone ses testi sonucu → ses tanıma kararı |
| **1 · MVP: konuşma ve kelime** | Günlük akış, merdiven + FSRS, sesli roleplay, yardım merdiveni, düzeltme kartları, kapanış kartı, yedek, hatırlatma | 14 gün kullanım, habersiz testte ≥ %70 |
| **2 · Dinleme ve seviye** | Dinleme modülü, seviye testi, ayrı seviyeler, zayıf yön motoru, haftalık rapor | Rapordaki zayıf yönler gözlemle örtüşüyor |
| **3 · Derinleşme** | Shadowing, perde eğrisi, mikro beceriler, katalog 1.200+ / 1.200+ | — |
| **4 · Genişleme** | Dizi/film kesitleri (YouTube gömülü oynatıcı) | — |

### Aşama 0 durumu

| İş | Durum |
|---|---|
| Proje iskeleti (PWA), iPhone ses testi, Worker | ✅ |
| 300 kelime/öbek (12 alan × 25, CEFR etiketli) | ✅ `content/words.json` |
| 60+ kalıp (67) | ✅ `content/patterns.json` |
| 100+ konuşma senaryosu iskeleti (102) | ✅ `content/scenarios.speaking.json` |
| Beklenmedik olay kütüphanesi | ✅ `content/twists.json` |
| Sistem talimatları (tur, yardım, daha doğal, analiz, seviye kuralları) | ✅ `content/prompts/` |
| 30 günlük varsayılan müfredat | ✅ `content/curriculum.json` |
| iPhone ses testi sonucu | ✅ bkz. §8 |

### Aşama 1 durumu

| İş | Durum |
|---|---|
| IndexedDB veri katmanı, yedek indir/yükle | ✅ |
| FSRS (ts-fsrs, gün içi tekrar yok) + 6 basamaklı merdiven, unutunca bir basamak geri | ✅ |
| Günlük plan: 10 yeni öğe (tekrar > 80 ise 5), sunulmayanlar ertesi güne kayar | ✅ |
| Akış: ısınma (seçeneksiz sesli) → günün kalıbı (sahne, anlam, kart, kullanım) → 10 kelime (tanıt, tanı, hatırla, hızlıda yakala, kullan) → senaryo → kapanış | ✅ (senaryo yer tutucu) |
| Takılan öğeye eksik basamağın egzersizi | ✅ |
| Ana, Rapor, Kütüphane (+Ayarlar) ekranları | ✅ |
| Sesli roleplay (LLM), düzeltme kartları, yardım merdiveni | ⏳ Worker kurulumu gerekli |
| Günlük hatırlatma aboneliği, otomatik bulut yedeği | ⏳ Worker kurulumu gerekli |

## 6. Kullanıcının yapacakları (hepsi ücretsiz, kart istemez)

Aşama 1 kurulumunda gerekir:

- [ ] Cloudflare hesabı (Pages + Worker + KV)
- [ ] Groq API anahtarı (console.groq.com)
- [ ] Google AI Studio Gemini API anahtarı
- [ ] OpenRouter API anahtarı
- [ ] iPhone: Ayarlar → Siri ve dikte açık; uygulama Safari'den "Ana Ekrana Ekle" ile kurulacak

Anahtarlar sohbete yapıştırılmaz; Worker'a `wrangler secret put` ile eklenir.

## 7. Açık riskler

- Safari ses tanıması: güven puanı eksik, sürekli dinleme kopabilir, PWA modunda sorun çıkabilir → ses testi + Whisper B planı.
- Ses tanıma telaffuzu "düzeltebilir" → alternatif sonuçlar, güven puanı, Whisper kelime güveni.
- Free tier limitleri değişebilir → 4 sağlayıcılı zincir, kısa sistem talimatları, önceden üretilmiş içerik.
- iOS veri silme → ana ekrana kurulum zorunlu + KV yedeği.

## 8. iPhone ses testi sonuçları (24.11.2026, iOS 18.7, ana ekrandan PWA)

| Ölçüm | Sonuç | Sonuç için anlamı |
|---|---|---|
| Ses tanıma PWA modunda | Çalışıyor | Safari ile devam edilebilir |
| Kelime doğruluğu (başarılı denemeler) | 3/3 cümlede %100 | Sohbet için yeterli |
| Güven puanı | Geliyor (0.81–0.985) | Düşük güven, telaffuz sinyali olarak kullanılabilir |
| Alternatif sonuçlar | En fazla 4, ama hepsi aynı güven ve sadece büyük/küçük harf farkı | Telaffuz analizi için işe yaramaz → Whisper |
| "No speech detected" ile kesilme | 6 denemenin 3'ünde (biri 1,8 sn'de) | Tek seferlik mod güvenilmez → sürekli mod + bas-konuş + otomatik yeniden deneme + Whisper yedeği |
| Mikrofon ölçümü + ses tanıma birlikte | 3 denemenin 1'inde başarılı | Duraksama ölçümü ses tanımayla aynı anda riskli; Aşama 1'de ayrıca test edilecek |
| Sürekli modda nihai sonuç | Konuşma bitmeden geliyor | Bas-konuş bırakıldığı an sonuç hazır → gecikme ~0 |
| Seslendirme | 4 hedef aksanın hepsi var, kelime sınırı olayları çalışıyor | Dinleme ve etkileşimli transkript planı geçerli |
| Seslendirme ve sessiz mod | iOS `speechSynthesis` sessiz düğmesi açıkken **ses vermez**; Web Audio ve `<audio>` ise çalar | Uygulama ilk açılışta ve sesli adımlarda "Ses gelmiyorsa sessiz modu kapat" ipucu gösterir. Gerekirse B planı: Workers AI Aura-1 ile sunucuda ses üretip Web Audio ile çalmak (ücretsiz günlük kota) |
| Kalıcı depolama | `persisted: false` | Uygulama açılışta `navigator.storage.persist()` ister; KV yedeği şart |
