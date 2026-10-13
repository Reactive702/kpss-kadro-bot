import fs from "node:fs";
import path from "node:path";
import { bildirimler, dosyaKlasoru, ilanlar, kullanicilar, type Kullanici } from "./db";
import { ilanEslestir, type IlanSonucu } from "./matching/eslestir";
import { ilanSartlariniCikar } from "./parser/gemini";
import { KamuIlanOturumu } from "./sources/kamuilan";
import { bugunIso } from "./text/metin";
import type { Ilan, PersonelTuru } from "./types";

export type Bildirici = (chatId: number, ilan: Ilan, sonuc: IlanSonucu) => Promise<void>;

export interface TaramaOzeti {
  listedeki: number;
  indirilen: number;
  ayristirilan: number;
  hatali: number;
  bildirim: number;
}

const MAKS_AYRISTIRMA_DENEMESI = 3;
let calisiyor = false;

export const taramaSuruyor = () => calisiyor;

/** null: herhangi bir tür isteyen kullanıcı var demektir */
function istenenTurler(kullanicilarListesi: Kullanici[]): Set<PersonelTuru> | null {
  const turler = new Set<PersonelTuru>();
  for (const k of kullanicilarListesi) {
    const ilgi = k.profil?.ilgiTurleri ?? [];
    if (ilgi.length === 0) return null;
    ilgi.forEach((t) => turler.add(t));
  }
  return turler;
}

async function ilanIcinBildir(ilan: Ilan, alicilar: Kullanici[], bildir: Bildirici, bugun: string): Promise<number> {
  if (!ilan.sartlar) return 0;
  let gonderilen = 0;
  for (const k of alicilar) {
    if (!k.profil || bildirimler.gonderildiMi(k.chatId, ilan.id)) continue;
    const sonuc = ilanEslestir(k.profil, ilan.sartlar, bugun);
    if (sonuc.durum === "uygun_degil") continue;
    try {
      await bildir(k.chatId, ilan, sonuc);
      bildirimler.kaydet(k.chatId, ilan.id, sonuc.durum);
      gonderilen++;
    } catch (hata) {
      console.error(`[bildirim] ${k.chatId} / ${ilan.id}:`, (hata as Error).message);
    }
  }
  return gonderilen;
}

/** Açık ilanları verilen kullanıcılarla (varsayılan: hepsi) eşleştirir, daha önce bildirilmemişleri gönderir. */
export async function acikIlanlariBildir(bildir: Bildirici, chatId?: number): Promise<number> {
  const bugun = bugunIso();
  const alicilar = kullanicilar.bildirimAlanlar().filter((k) => chatId == null || k.chatId === chatId);
  let toplam = 0;
  for (const ilan of ilanlar.acikAyristirilmis(bugun)) toplam += await ilanIcinBildir(ilan, alicilar, bildir, bugun);
  return toplam;
}

export async function taramaYap(bildir: Bildirici): Promise<TaramaOzeti | null> {
  if (calisiyor) return null;
  calisiyor = true;
  const ozet: TaramaOzeti = { listedeki: 0, indirilen: 0, ayristirilan: 0, hatali: 0, bildirim: 0 };
  try {
    const bugun = bugunIso();
    const alicilar = kullanicilar.bildirimAlanlar();
    const turler = istenenTurler(alicilar);
    const { oturum, ilanlar: liste } = await KamuIlanOturumu.ac();
    ozet.listedeki = liste.length;

    // Detay linkleri oturuma bağlı olduğundan önce tüm dosyalar indirilir, Gemini sonra çalışır.
    for (const li of liste) {
      ilanlar.ekleYoksa(li, "kamuilan");
      const kayit = ilanlar.getir(li.id)!;
      if (kayit.durum !== "yeni" && kayit.durum !== "atlandi") continue;

      let atlama: string | null = null;
      if (li.bitis && li.bitis < bugun) atlama = "Başvuru süresi geçmiş";
      else if (li.iptalIlani) atlama = "İptal ilanı";
      else if (alicilar.length === 0) atlama = "Kayıtlı kullanıcı yok";
      else if (turler && li.tahminiTur && !turler.has(li.tahminiTur)) atlama = "Bu türle ilgilenen kullanıcı yok";
      if (atlama) {
        if (kayit.durum !== "atlandi" || kayit.hata !== atlama) ilanlar.durumAyarla(li.id, "atlandi", atlama);
        continue;
      }

      try {
        const dosya = await oturum.dosyaIndir(li.detayYolu);
        const yol = path.join(dosyaKlasoru, `${li.id}.${dosya.uzanti}`);
        fs.writeFileSync(yol, dosya.veri);
        ilanlar.dosyaKaydet(li.id, yol, dosya.mime);
        ozet.indirilen++;
      } catch (hata) {
        console.error(`[indirme] ${li.kurum} - ${li.baslik}:`, (hata as Error).message);
        ilanlar.durumAyarla(li.id, "yeni", (hata as Error).message);
      }
    }

    const bekleyenler = ilanlar
      .durumdakiler(["indirildi"])
      .filter((i) => !i.bitis || i.bitis >= bugun)
      .sort((a, b) => Number(a.tahminiTur === "akademik") - Number(b.tahminiTur === "akademik"));

    for (const ilan of bekleyenler) {
      try {
        const veri = fs.readFileSync(ilan.dosyaYolu!);
        const sartlar = await ilanSartlariniCikar({ veri, mime: ilan.dosyaMime as any, uzanti: "" }, ilan);
        ilanlar.sartlarKaydet(ilan.id, sartlar);
        ozet.ayristirilan++;
        console.log(`[ayrıştırma] ${ilan.kurum} - ${ilan.baslik}: ${sartlar.kadrolar.length} kadro`);
        ozet.bildirim += await ilanIcinBildir(ilanlar.getir(ilan.id)!, alicilar, bildir, bugun);
      } catch (hata) {
        ozet.hatali++;
        const mesaj = (hata as Error).message ?? String(hata);
        console.error(`[ayrıştırma] ${ilan.kurum} - ${ilan.baslik}:`, mesaj);
        ilanlar.ayristirmaHatasi(ilan.id, mesaj.slice(0, 500), MAKS_AYRISTIRMA_DENEMESI);
      }
    }

    ozet.bildirim += await acikIlanlariBildir(bildir);
    return ozet;
  } finally {
    calisiyor = false;
  }
}
