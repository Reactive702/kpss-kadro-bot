const CP1254 = new TextDecoder("windows-1254");
const CP1254_TABLOSU = Array.from({ length: 128 }, (_, i) => CP1254.decode(new Uint8Array([i + 128])));

/**
 * kamuilan.sbb.gov.tr aynı sayfada hem UTF-8 hem Windows-1254 baytları karıştırıyor.
 * Geçerli UTF-8 dizilerini UTF-8, kalan baytları Windows-1254 olarak çözer.
 */
export function karisikKodlamaCoz(buf: Uint8Array): string {
  let sonuc = "";
  let i = 0;
  while (i < buf.length) {
    const b = buf[i]!;
    if (b < 0x80) {
      sonuc += String.fromCharCode(b);
      i++;
      continue;
    }
    const uzunluk = b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 0;
    let gecerli = uzunluk > 0 && i + uzunluk <= buf.length;
    for (let j = 1; gecerli && j < uzunluk; j++) {
      const c = buf[i + j]!;
      if (c < 0x80 || c > 0xbf) gecerli = false;
    }
    if (gecerli) {
      sonuc += Buffer.from(buf.subarray(i, i + uzunluk)).toString("utf8");
      i += uzunluk;
    } else {
      sonuc += CP1254_TABLOSU[b - 128];
      i++;
    }
  }
  return sonuc;
}

/** Karşılaştırma için: küçük harf, Türkçe karakterler ASCII'ye, noktalama boşluğa. */
export function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function htmlKacir(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function bosluklariTemizle(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const AYLAR = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];

export function ayIndeksi(ayAdi: string): number {
  return AYLAR.indexOf(normalize(ayAdi));
}

export function isoTarih(yil: number, ay: number, gun: number): string {
  return `${yil}-${String(ay + 1).padStart(2, "0")}-${String(gun).padStart(2, "0")}`;
}

export function bugunIso(): string {
  const d = new Date();
  return isoTarih(d.getFullYear(), d.getMonth(), d.getDate());
}

export function tarihGoster(iso: string | null): string {
  if (!iso) return "belirtilmemiş";
  const [y, m, d] = iso.split("-").map(Number);
  const ay = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][m! - 1];
  return `${d} ${ay} ${y}`;
}
