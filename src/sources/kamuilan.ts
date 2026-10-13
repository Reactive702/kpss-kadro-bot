import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { PersonelTuru } from "../types";
import { ayIndeksi, bosluklariTemizle, isoTarih, karisikKodlamaCoz, normalize } from "../text/metin";

const TABAN = "https://kamuilan.sbb.gov.tr/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export interface ListeIlani {
  id: string;
  kurum: string;
  baslik: string;
  yayinTarihi: string | null;
  baslangic: string | null;
  bitis: string | null;
  tahminiTur: PersonelTuru | null;
  iptalIlani: boolean;
  /** Sadece listeyi çeken oturum içinde geçerli */
  detayYolu: string;
}

export interface IlanDosyasi {
  veri: Buffer;
  mime: "application/pdf" | "image/jpeg" | "image/png" | "text/plain";
  uzanti: string;
}

function yilTahmin(ay: number, referans: Date): number {
  const fark = ay - referans.getMonth();
  if (fark > 6) return referans.getFullYear() - 1;
  if (fark < -6) return referans.getFullYear() + 1;
  return referans.getFullYear();
}

function aralikCoz(metin: string, referans: Date): { baslangic: string | null; bitis: string | null } {
  const m = metin.match(/(\d{1,2})\s+([^\s\d-]+)\s*-\s*(\d{1,2})\s+([^\s\d)]+)/);
  if (!m) return { baslangic: null, bitis: null };
  const ay1 = ayIndeksi(m[2]!);
  const ay2 = ayIndeksi(m[4]!);
  if (ay1 < 0 || ay2 < 0) return { baslangic: null, bitis: null };
  const yil1 = yilTahmin(ay1, referans);
  const yil2 = ay2 < ay1 ? yil1 + 1 : yil1;
  return { baslangic: isoTarih(yil1, ay1, Number(m[1])), bitis: isoTarih(yil2, ay2, Number(m[3])) };
}

/** Başlıktan kaba tür tahmini; Gemini'ye göndermeden önce kimsenin ilgilenmediği ilanları elemek için. */
export function turTahminEt(kurum: string, baslik: string): PersonelTuru | null {
  const k = normalize(kurum);
  const b = normalize(baslik);
  if (/kalkinma ajansi/.test(k)) return "kalkinma_ajansi";
  if (/ogretim (uyesi|elemani|gorevlisi)|arastirma gorevlisi|akademik personel/.test(b)) return "akademik";
  if (/bilisim personel/.test(b)) return "sozlesmeli_bilisim";
  if (/hakim|savci/.test(b)) return "yargi";
  if (/subay|astsubay|uzman erbas|sozlesmeli er\b|harbiye|uzman jandarma/.test(b)) return "askeri";
  if (/(uzman|denetci|mufettis|kontrolor|denetim elemani|aday) yardimcisi|yardimcisi (alim|sinav)/.test(b)) return "kariyer_uzman";
  if (/isci/.test(b)) return "isci";
  if (/kurumsal sozlesmeli|kit/.test(b)) return "kurumsal_sozlesmeli";
  if (/sozlesmeli/.test(b)) return "sozlesmeli_4b";
  if (/memur/.test(b)) return "memur";
  return null;
}

function ilanKimligi(kurum: string, baslik: string, yayin: string | null, bitis: string | null): string {
  return createHash("sha1").update([normalize(kurum), normalize(baslik), yayin ?? "", bitis ?? ""].join("|")).digest("hex").slice(0, 16);
}

export function listeAyristir(html: string, referans = new Date()): ListeIlani[] {
  const $ = cheerio.load(html);
  const sonuc: ListeIlani[] = [];
  const gorulen = new Set<string>();

  $("li").each((_, li) => {
    const zaman = $(li).children("time.cbp_tmtime");
    if (zaman.length === 0) return;
    const gun = Number(zaman.find("h4").text().trim());
    const ay = ayIndeksi(zaman.find("h3").text().trim());
    const yayinTarihi = gun && ay >= 0 ? isoTarih(yilTahmin(ay, referans), ay, gun) : null;

    $(li)
      .find("a.xx")
      .each((_, a) => {
        const detayYolu = $(a).attr("href");
        const kurum = bosluklariTemizle($(a).find("p.alt_p1").text());
        const p2 = $(a).find("p.alt_p2").clone();
        const aralikMetni = p2.find("em").text();
        p2.find("em").remove();
        const baslik = bosluklariTemizle(p2.text());
        if (!detayYolu || !kurum || !baslik) return;

        const { baslangic, bitis } = aralikCoz(aralikMetni, referans);
        const id = ilanKimligi(kurum, baslik, yayinTarihi, bitis);
        if (gorulen.has(id)) return;
        gorulen.add(id);
        const nb = normalize(baslik);
        sonuc.push({
          id,
          kurum,
          baslik,
          yayinTarihi,
          baslangic,
          bitis,
          tahminiTur: turTahminEt(kurum, baslik),
          iptalIlani: /\biptal/.test(nb) && !/duzeltme/.test(nb),
          detayYolu,
        });
      });
  });
  return sonuc;
}

function dosyaTuruBul(buf: Buffer): Omit<IlanDosyasi, "veri"> | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", uzanti: "pdf" };
  if (buf[0] === 0xff && buf[1] === 0xd8) return { mime: "image/jpeg", uzanti: "jpg" };
  if (buf.subarray(0, 4).toString("latin1") === "\x89PNG") return { mime: "image/png", uzanti: "png" };
  return null;
}

/**
 * Portalın detay linkleri (kod=...) oturuma bağlıdır; listeyi çeken oturumun çerezi olmadan 404 döner.
 * Bu yüzden liste ve dosya indirmeleri aynı oturum nesnesi üzerinden yapılmalıdır.
 */
export class KamuIlanOturumu {
  private constructor(private readonly cerez: string) {}

  static async ac(): Promise<{ oturum: KamuIlanOturumu; ilanlar: ListeIlani[] }> {
    const yanit = await fetch(TABAN, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) });
    if (!yanit.ok) throw new Error(`kamuilan liste HTTP ${yanit.status}`);
    const cerez = yanit.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const html = karisikKodlamaCoz(Buffer.from(await yanit.arrayBuffer()));
    return { oturum: new KamuIlanOturumu(cerez), ilanlar: listeAyristir(html) };
  }

  async dosyaIndir(detayYolu: string): Promise<IlanDosyasi> {
    const yanit = await fetch(new URL(detayYolu, TABAN), {
      headers: { "user-agent": UA, cookie: this.cerez, referer: TABAN },
      signal: AbortSignal.timeout(120_000),
    });
    if (!yanit.ok) throw new Error(`kamuilan detay HTTP ${yanit.status}`);
    let veri = Buffer.from(await yanit.arrayBuffer());
    const tur = dosyaTuruBul(veri);

    if (tur?.mime === "application/pdf") {
      // Sunucu PDF'in arkasına boş bir HTML sayfası ekliyor.
      const son = veri.lastIndexOf("%%EOF");
      if (son > 0) veri = veri.subarray(0, son + 5);
      return { veri, ...tur };
    }
    if (tur) return { veri, ...tur };

    const html = karisikKodlamaCoz(veri);
    if (/notfound-404/.test(html)) throw new Error("kamuilan detay 404 (oturum süresi dolmuş olabilir)");
    const $ = cheerio.load(html);
    $("script, style, input[type=hidden]").remove();
    const metin = bosluklariTemizle($("body").text());
    if (metin.length < 200) throw new Error("kamuilan detay: tanınmayan dosya türü / boş içerik");
    return { veri: Buffer.from(metin, "utf8"), mime: "text/plain", uzanti: "txt" };
  }
}
