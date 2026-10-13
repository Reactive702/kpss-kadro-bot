# KPSS Kadro Takip Botu

Kamu İlan Portalı'ndaki ([kamuilan.sbb.gov.tr](https://kamuilan.sbb.gov.tr)) yeni personel alım ilanlarını periyodik olarak tarar, ilan PDF'ini Gemini ile okuyup her kadronun şartlarını çıkarır ve profiline uyan kadroları Telegram'dan bildirir (ilan PDF'i ekli olarak).

Eşleştirme sadece bölüm adına bakmaz:

| Eşleşme yolu | Örnek |
| --- | --- |
| Tam bölüm | İlanda "Bilgisayar Mühendisliği" sayılmış |
| Genel kadro | "Herhangi bir lisans programı" / nitelik kodu 4001 |
| Alan / fakülte grubu | DAKA: "Mühendislik Fakültelerinin bölümlerinden" |
| Nitelik kodu | `/nitelik 4531` ile girdiğin ÖSYM kodu ilanda geçiyor |

Her kadro ayrıca eğitim düzeyi, KPSS/ALES puanı, YDS, yaş sınırı ve deneyim açısından kontrol edilir. Bilgin eksikse (ör. puan girmediysen) ilan elenmez, 🟡 "olası" olarak gelir.

## Kurulum

1. Bağımlılıkları kur: `npm install`
2. `.env.example` dosyasını `.env` adıyla kopyala ve doldur.

### Telegram bot token'ı

1. Telegram'da [@BotFather](https://t.me/BotFather)'ı aç, `/newbot` yaz.
2. Bota bir ad ver (ör. `KPSS Kadro Takip`), sonra `bot` ile biten bir kullanıcı adı ver (ör. `kpss_kadro_takip_bot`).
3. BotFather'ın verdiği `123456789:AA...` biçimindeki token'ı `.env` içinde `TELEGRAM_BOT_TOKEN=` satırına yapıştır.

Token'ı kimseyle paylaşma; sızarsa BotFather'da `/revoke` ile yenile.

### Gemini API anahtarı

1. [Google AI Studio](https://aistudio.google.com/apikey) adresinde Google hesabınla "Create API key" de.
2. Anahtarı `.env` içinde `GEMINI_API_KEY=` satırına yapıştır.

Ücretsiz kotada dakikalık istek sınırı olduğu için istekler arasında varsayılan 7 sn beklenir (`GEMINI_ISTEK_ARALIGI_MS`). Her ilan bir kez ayrıştırılır, sonuç veritabanında saklanır.

## Çalıştırma

```bash
npm start            # botu ve periyodik taramayı başlatır
npm run tara         # Telegram olmadan güncel ilan listesini gösterir
npm run tara -- --ayristir 2 --ara "bilişim"   # 2 ilanı Gemini ile ayrıştırıp örnek profille eşleştirir
npm test             # eşleştirme motoru testleri
```

Bot açıldıktan sonra Telegram'da botuna `/start` yaz ve profilini oluştur. Bot bilgisayarın açık olduğu sürece çalışır; sürekli çalışması için bir sunucuya (VPS, Railway, Fly.io vb.) taşınması gerekir.

## Mimari

```
src/
  sources/kamuilan.ts    Portal listesi + oturuma bağlı PDF indirme
  parser/gemini.ts       PDF -> yapılandırılmış şartlar (JSON şema)
  matching/eslestir.ts   Profil x kadro eşleştirme (uygun / olası / uygun değil)
  data/bolumler.ts       Bölüm sözlüğü ve alan grupları
  tarama.ts              Tara -> indir -> ayrıştır -> bildir hattı
  bot/                   Telegram botu (grammY)
  db.ts                  SQLite (node:sqlite)
  types.ts               Mobil uygulamayla paylaşılacak ortak tipler
```

Notlar:

- Portalın detay linkleri oturuma bağlıdır, doğrudan paylaşılamaz. Bu yüzden bot ilan PDF'ini mesajla birlikte gönderir.
- ÖSYM'nin merkezi atama (KPSS-20xx/x) tercih kılavuzu bu sürümde taranmıyor; sonraki adım olarak `sources/` altına eklenebilir.
