/**
 * Telegram olmadan deneme:
 *   npm run tara                      -> güncel ilan listesini gösterir
 *   npm run tara -- --ayristir 3      -> ilk 3 ilanı indirip Gemini ile ayrıştırır ve örnek profille eşleştirir
 *   npm run tara -- --ayristir 3 --ara "kalkınma"   -> sadece kurum/başlığında "kalkınma" geçenler
 */
import { parseArgs } from "node:util";
import { KamuIlanOturumu } from "../sources/kamuilan";
import { ilanSartlariniCikar } from "../parser/gemini";
import { ilanEslestir } from "../matching/eslestir";
import { normalize } from "../text/metin";
import type { Profil } from "../types";

const { values } = parseArgs({ options: { ayristir: { type: "string" }, ara: { type: "string" } } });

const ornekProfil: Profil = {
  egitimSeviyesi: "lisans",
  bolumId: "bilgisayar_muh",
  bolumAdi: "Bilgisayar Mühendisliği",
  bolumGruplari: ["muhendislik", "bilisim"],
  nitelikKodlari: [],
  kpss: { P3: 80 },
  ales: {},
  yds: 70,
  dogumYili: 1998,
  deneyimYil: 1,
  ilgiTurleri: [],
};

const { oturum, ilanlar } = await KamuIlanOturumu.ac();
const filtre = values.ara ? normalize(values.ara) : null;
const secilen = filtre ? ilanlar.filter((i) => normalize(`${i.kurum} ${i.baslik}`).includes(filtre)) : ilanlar;

console.log(`${ilanlar.length} ilan bulundu${filtre ? `, ${secilen.length} tanesi "${values.ara}" içeriyor` : ""}\n`);
for (const i of secilen.slice(0, 40)) {
  console.log(`[${i.yayinTarihi}] ${i.kurum} | ${i.baslik} | ${i.baslangic} → ${i.bitis} | tür: ${i.tahminiTur ?? "?"}`);
}

const adet = Number(values.ayristir ?? 0);
for (const i of secilen.slice(0, adet)) {
  console.log(`\n=== ${i.kurum} - ${i.baslik}`);
  const dosya = await oturum.dosyaIndir(i.detayYolu);
  console.log(`dosya: ${dosya.mime}, ${(dosya.veri.length / 1024).toFixed(0)} KB`);
  const sartlar = await ilanSartlariniCikar(dosya, i);
  console.log(JSON.stringify(sartlar, null, 2));
  const sonuc = ilanEslestir(ornekProfil, sartlar);
  console.log(`\nÖrnek profil (Bilgisayar Müh., P3 80, YDS 70): ${sonuc.durum} ${sonuc.atlanmaSebebi ?? ""}`);
  for (const k of sonuc.kadrolar) {
    console.log(` - ${k.kadro.unvan}: ${k.durum} | ${k.eslesme ?? ""} | ${[...k.engeller, ...k.notlar].join("; ")}`);
  }
}
