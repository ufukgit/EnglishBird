# İçerik

Önceden üretilmiş, uygulamaya gömülen statik veri. Şemalar: `src/lib/types.ts`.
Elle düzenlenen kaynaklar `src/` altındadır; JSON dosyaları `npm run content` ile üretilir — JSON'u elle düzenleme.

| Kaynak | Çıktı | İçerik | Durum |
|---|---|---|---|
| `src/words.txt` | `words.json` | 300 kelime ve öbek, 12 alan × 25; seviye CEFR-J'den | ✅ |
| `src/patterns.txt` | `patterns.json` | 67 günün kalıbı: işlev, ortam, 3 varyasyon, Türk konuşucu hatası, 3 durum, mini sahne | ✅ |
| `src/scenarios.speaking.txt` | `scenarios.speaking.json` | 102 konuşma senaryosu iskeleti (34 temel durum × olay varyasyonları) | ✅ |
| — | `curriculum.json` | Varsayılan 30 günlük sıra: her gün 10 öğe + 1 kalıp | ✅ |
| — | `twists.json` | 12 beklenmedik olay türü + "olay yok"; AI'a nasıl oynanacağı | ✅ |
| `prompts/` | — | LLM talimatları: `turn` (rol), `help` (yardım merdiveni), `natural` (daha doğal), `analysis` (oturum sonu), `levels.json` | ✅ |
| — | `scenarios.listening.json` | Dinleme senaryoları ve metinleri | Aşama 2 |

Seviye dağılımı ağırlıklı olarak A2–B1'dir; ilk günkü seviye testinden sonra seçici seviyeye göre filtreler.
