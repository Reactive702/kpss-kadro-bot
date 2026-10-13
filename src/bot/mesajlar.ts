import type { IlanSonucu } from "../matching/eslestir";
import { bolumBul } from "../data/bolumler";
import { htmlKacir as h, tarihGoster } from "../text/metin";
import { BOLUM_GRUPLARI, EGITIM_SEVIYELERI, PERSONEL_TURLERI, type Ilan, type Profil } from "../types";

const TELEGRAM_SINIRI = 3900;

const DURUM_IKONU = { uygun: "✅", muhtemel: "🟡", uygun_degil: "❌" } as const;

export function bildirimMetni(ilan: Ilan, sonuc: IlanSonucu): string {
  const s = ilan.sartlar!;
  const satirlar = [
    sonuc.durum === "uygun" ? "✅ <b>Başvurabileceğin bir ilan var</b>" : "🟡 <b>Başvurabileceğin olası bir ilan var</b> (şartları kontrol et)",
    "",
    `🏛 <b>${h(ilan.kurum)}</b>`,
    `📄 ${h(ilan.baslik)}`,
    `🏷 ${PERSONEL_TURLERI[s.personelTuru]}`,
    `📅 Başvuru: ${tarihGoster(ilan.baslangic)} – <b>${tarihGoster(s.sonBasvuruTarihi ?? ilan.bitis)}</b>`,
    "",
    "<b>Sana uygun kadrolar:</b>",
  ];

  const uygunlar = sonuc.kadrolar.filter((k) => k.durum !== "uygun_degil");
  let eklenen = 0;
  for (const k of uygunlar) {
    const blok = [`${DURUM_IKONU[k.durum]} <b>${h(k.kadro.unvan)}</b>${k.kadro.adet ? ` (${k.kadro.adet} kişi)` : ""}`];
    if (k.eslesme) blok.push(`   ↳ ${h(k.eslesme)}`);
    for (const not of k.notlar) blok.push(`   ⚠️ ${h(not)}`);
    for (const ek of k.kadro.digerSartlar.slice(0, 2)) blok.push(`   • ${h(ek)}`);
    if ([...satirlar, ...blok].join("\n").length > TELEGRAM_SINIRI - 200) break;
    satirlar.push(...blok);
    eklenen++;
  }
  if (eklenen < uygunlar.length) satirlar.push(`… ve ${uygunlar.length - eklenen} kadro daha (PDF'e bakın)`);

  satirlar.push("", "<i>İlan metni ekteki dosyada. Başvurmadan önce şartları ilandan mutlaka teyit et.</i>");
  return satirlar.join("\n");
}

const puanlariYaz = (p: Record<string, number>) =>
  Object.entries(p)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ") || "—";

export function profilMetni(p: Profil): string {
  const bolum = bolumBul(p.bolumId)?.ad ?? p.bolumAdi ?? "—";
  return [
    "👤 <b>Profilin</b>",
    `🎓 Eğitim: ${EGITIM_SEVIYELERI[p.egitimSeviyesi]}`,
    `📚 Bölüm: ${h(bolum)}`,
    `🧩 Alan grupları: ${p.bolumGruplari.map((g) => BOLUM_GRUPLARI[g]).join(", ") || "—"}`,
    `🔢 Nitelik kodları: ${p.nitelikKodlari.join(", ") || "—"}  (/nitelik ile ekle)`,
    `📝 KPSS: ${puanlariYaz(p.kpss)}`,
    `📝 ALES: ${puanlariYaz(p.ales)}`,
    `🌍 YDS: ${p.yds ?? "—"}`,
    `🎂 Doğum yılı: ${p.dogumYili ?? "—"}`,
    `💼 Deneyim: ${p.deneyimYil != null ? `${p.deneyimYil} yıl` : "—"}`,
    `🔔 İlgilendiğin türler: ${p.ilgiTurleri.length === Object.keys(PERSONEL_TURLERI).length ? "Hepsi" : p.ilgiTurleri.map((t) => PERSONEL_TURLERI[t]).join(", ")}`,
  ].join("\n");
}

export const YARDIM = [
  "<b>KPSS Kadro Takip Botu</b>",
  "",
  "Kamu İlan Portalı'ndaki (kamuilan.sbb.gov.tr) yeni ilanları tarar, ilan PDF'ini yapay zekâ ile okur ve profiline uyan kadroları bildirir: sadece bölümüne özel kadrolar değil; genel kadrolar (herhangi bir lisans / 4001), fakülte düzeyinde açılan kadrolar (ör. kalkınma ajanslarındaki \"Mühendislik Fakültesi bölümleri\") ve bilişim kadroları da.",
  "",
  "✅ Uygun: Tüm şartları karşılıyorsun",
  "🟡 Olası: Bir bilgi eksik veya ilan belirsiz, kontrol etmelisin",
  "",
  "/profil – Profilini gör / yeniden oluştur",
  "/ilanlar – Şu an açık ve sana uygun ilanlar",
  "/nitelik 4531 – ÖSYM nitelik kodlarını ekle",
  "/durdur – Bildirimleri durdur",
  "/devam – Bildirimleri yeniden aç",
  "/tara – Şimdi tara",
  "/yardim – Bu mesaj",
].join("\n");
