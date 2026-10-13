import { bolumAdlari, bolumAnahtari, bolumBul } from "../data/bolumler";
import { BOLUM_GRUPLARI, EGITIM_SEVIYELERI, type EgitimSeviyesi, type IlanSartlari, type Kadro, type Profil, type PuanSarti } from "../types";
import { bugunIso } from "../text/metin";

export type Durum = "uygun" | "muhtemel" | "uygun_degil";

export interface KadroSonucu {
  kadro: Kadro;
  durum: Durum;
  /** Hangi yoldan eşleştiği: tam bölüm, genel kadro, fakülte/alan grubu, nitelik kodu */
  eslesme: string | null;
  /** Kullanıcının kontrol etmesi gereken belirsizlikler */
  notlar: string[];
  engeller: string[];
}

export interface IlanSonucu {
  durum: Durum;
  kadrolar: KadroSonucu[];
  atlanmaSebebi?: string;
}

const SEVIYE_SIRASI: Record<EgitimSeviyesi, number> = { ortaogretim: 0, onlisans: 1, lisans: 2, yukseklisans: 3, doktora: 4 };
const DURUM_SIRASI: Record<Durum, number> = { uygun: 2, muhtemel: 1, uygun_degil: 0 };

function kelimeIceriyor(metin: string, parca: string): boolean {
  return ` ${metin} `.includes(` ${parca} `);
}

function kullaniciBolumAnahtarlari(p: Profil): string[] {
  const tanim = bolumBul(p.bolumId);
  const adlar = tanim ? bolumAdlari(tanim) : p.bolumAdi ? [p.bolumAdi] : [];
  return [...new Set(adlar.map(bolumAnahtari).filter((a) => a.length >= 3))];
}

function bolumKontrol(p: Profil, k: Kadro): { eslesme: string | null; belirsiz?: string; engel?: string } {
  if (k.herhangiBolum) return { eslesme: "Genel kadro (herhangi bir bölüm)" };

  const kodlar = new Set(k.nitelikKodlari.map((x) => x.trim()));
  const ortakKod = p.nitelikKodlari.find((x) => kodlar.has(x));
  if (ortakKod) return { eslesme: `Nitelik kodu ${ortakKod}` };

  const anahtarlar = kullaniciBolumAnahtarlari(p);
  for (const ilanBolumu of k.bolumler) {
    const ilanAnahtari = bolumAnahtari(ilanBolumu);
    if (anahtarlar.some((a) => a === ilanAnahtari || kelimeIceriyor(ilanAnahtari, a))) {
      return { eslesme: `Bölüm: ${ilanBolumu}` };
    }
  }

  const ortakGrup = k.bolumGruplari.find((g) => p.bolumGruplari.includes(g));
  if (ortakGrup) return { eslesme: `Alan: ${BOLUM_GRUPLARI[ortakGrup]} bölümleri` };

  if (k.bolumler.length === 0 && k.bolumGruplari.length === 0 && k.nitelikKodlari.length === 0) {
    return { eslesme: null, belirsiz: "Bölüm şartı ilandan çıkarılamadı, ilan metnini kontrol edin" };
  }
  if (k.benzerBolumlerKabul) {
    return { eslesme: null, belirsiz: "İlanda \"ilgili/benzeri bölümler\" gibi açık uçlu ifade var, bölümünüz kabul edilebilir" };
  }
  return { eslesme: null, engel: "Bölümünüz kabul edilen bölümler arasında değil" };
}

function puanAnahtari(puanTuru: string | null): string | null {
  if (!puanTuru) return null;
  const t = puanTuru.toUpperCase().replace(/İ/g, "I").replace(/Ö/g, "O").replace(/KPSS|ALES|[\s\-_]/g, "");
  return t || null;
}

type PuanDurumu = { durum: "yeterli" | "belirsiz" | "yetersiz"; aciklama: string };

function puanKontrol(p: Profil, s: PuanSarti): PuanDurumu {
  const ad = s.puanTuru ? `${s.sinav} ${s.puanTuru}` : s.sinav;
  const istenen = s.minPuan != null ? ` (en az ${s.minPuan})` : "";
  if (s.sinav === "DIGER") return { durum: "belirsiz", aciklama: `${ad} puanı isteniyor${istenen}` };

  const kayitlar = s.sinav === "KPSS" ? p.kpss : p.ales;
  const anahtar = puanAnahtari(s.puanTuru);
  if (!anahtar) {
    const herhangi = Object.values(kayitlar);
    if (herhangi.length === 0) return { durum: "belirsiz", aciklama: `${s.sinav} puanınız kayıtlı değil${istenen}` };
    if (s.minPuan == null || herhangi.some((v) => v >= s.minPuan!)) {
      return { durum: "belirsiz", aciklama: `${s.sinav} puan türü belirtilmemiş${istenen}, ilanı kontrol edin` };
    }
    return { durum: "yetersiz", aciklama: `${s.sinav} puanınız yetersiz${istenen}` };
  }
  const deger = kayitlar[anahtar];
  if (deger == null) return { durum: "belirsiz", aciklama: `${ad} puanınız kayıtlı değil${istenen}` };
  if (s.minPuan != null && deger < s.minPuan) return { durum: "yetersiz", aciklama: `${ad} puanınız (${deger}) yetersiz${istenen}` };
  return { durum: "yeterli", aciklama: `${ad} ${deger}` };
}

function yasKontrol(p: Profil, yasSiniri: number, sonBasvuru: string | null): PuanDurumu | null {
  if (p.dogumYili == null) return { durum: "belirsiz", aciklama: `${yasSiniri} yaşını doldurmamış olmak gerekiyor, doğum yılınız kayıtlı değil` };
  const yil = sonBasvuru ? Number(sonBasvuru.slice(0, 4)) : new Date().getFullYear();
  const enKucukYas = yil - p.dogumYili - 1;
  const enBuyukYas = yil - p.dogumYili;
  if (enKucukYas >= yasSiniri) return { durum: "yetersiz", aciklama: `${yasSiniri} yaşını doldurmamış olmak gerekiyor` };
  if (enBuyukYas >= yasSiniri) return { durum: "belirsiz", aciklama: `${yasSiniri} yaş sınırına doğum gününüze göre takılabilirsiniz` };
  return null;
}

export function kadroEslestir(p: Profil, k: Kadro, sonBasvuru: string | null): KadroSonucu {
  const notlar: string[] = [];
  const engeller: string[] = [];

  const ps = SEVIYE_SIRASI[p.egitimSeviyesi];
  const ks = SEVIYE_SIRASI[k.egitimSeviyesi] ?? SEVIYE_SIRASI.lisans;
  if (ps < ks) {
    engeller.push(`${EGITIM_SEVIYELERI[k.egitimSeviyesi]} mezunu isteniyor`);
  } else if (ps > ks && ks < SEVIYE_SIRASI.lisans && !k.ustOgrenimKabul) {
    engeller.push(`${EGITIM_SEVIYELERI[k.egitimSeviyesi]} düzeyinde kadro, üst öğrenim mezunları kabul edilmiyor`);
  }

  const bolum = bolumKontrol(p, k);
  if (bolum.engel) engeller.push(bolum.engel);
  if (bolum.belirsiz) notlar.push(bolum.belirsiz);

  if (k.puanSartlari.length > 0) {
    const sonuclar = k.puanSartlari.map((s) => puanKontrol(p, s));
    if (!sonuclar.some((s) => s.durum === "yeterli")) {
      const belirsizler = sonuclar.filter((s) => s.durum === "belirsiz");
      if (belirsizler.length > 0) notlar.push(...belirsizler.map((s) => s.aciklama));
      else engeller.push(sonuclar.map((s) => s.aciklama).join(" / "));
    }
  }

  if (k.yabanciDil.gerekli) {
    const istenen = k.yabanciDil.minPuan != null ? `en az ${k.yabanciDil.minPuan}` : "puan şartı belirtilmemiş";
    if (p.yds == null) notlar.push(`Yabancı dil puanı isteniyor (${istenen}), YDS puanınız kayıtlı değil`);
    else if (k.yabanciDil.minPuan != null && p.yds < k.yabanciDil.minPuan) engeller.push(`YDS puanınız (${p.yds}) yetersiz (${istenen})`);
  }

  if (k.yasSiniri != null) {
    const yas = yasKontrol(p, k.yasSiniri, sonBasvuru);
    if (yas?.durum === "yetersiz") engeller.push(yas.aciklama);
    else if (yas) notlar.push(yas.aciklama);
  }

  if (k.minDeneyimYil != null && k.minDeneyimYil > 0) {
    const alan = k.deneyimAciklama ? ` (${k.deneyimAciklama})` : "";
    if (p.deneyimYil == null) notlar.push(`En az ${k.minDeneyimYil} yıl deneyim isteniyor${alan}, deneyiminiz kayıtlı değil`);
    else if (p.deneyimYil < k.minDeneyimYil) engeller.push(`En az ${k.minDeneyimYil} yıl deneyim isteniyor${alan}`);
    else if (k.deneyimAciklama) notlar.push(`Deneyiminizin şu alanda olması gerekiyor: ${k.deneyimAciklama}`);
  }

  if (k.cinsiyet !== "farketmez") notlar.push(`Sadece ${k.cinsiyet === "erkek" ? "erkek" : "kadın"} adaylar başvurabiliyor`);

  const durum: Durum = engeller.length > 0 ? "uygun_degil" : notlar.length > 0 ? "muhtemel" : "uygun";
  return { kadro: k, durum, eslesme: bolum.eslesme, notlar, engeller };
}

export function ilanEslestir(p: Profil, s: IlanSartlari, bugun = bugunIso()): IlanSonucu {
  if (s.sonBasvuruTarihi && s.sonBasvuruTarihi < bugun) {
    return { durum: "uygun_degil", kadrolar: [], atlanmaSebebi: "Son başvuru tarihi geçmiş" };
  }
  if (p.ilgiTurleri.length > 0 && !p.ilgiTurleri.includes(s.personelTuru)) {
    return { durum: "uygun_degil", kadrolar: [], atlanmaSebebi: "İlgilenmediğiniz personel türü" };
  }
  const kadrolar = s.kadrolar.map((k) => kadroEslestir(p, k, s.sonBasvuruTarihi));
  const durum = kadrolar.reduce<Durum>((enIyi, k) => (DURUM_SIRASI[k.durum] > DURUM_SIRASI[enIyi] ? k.durum : enIyi), "uygun_degil");
  return { durum, kadrolar };
}
