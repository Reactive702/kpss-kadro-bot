const PUAN = String.raw`\s*[:=]?\s*(\d{1,3}(?:[.,]\d+)?)`;

/** Tek bir sayı yazılırsa mezuniyet düzeyine göre varsayılan puan türü (P3 / P93 / P94, ALES SAY) kabul edilir. */
export function puanlariCoz(metin: string, sinav: "kpss" | "ales", egitim: string): Record<string, number> | null {
  const sonuc: Record<string, number> = {};
  const desen = sinav === "kpss" ? new RegExp(String.raw`P\s?(\d{1,3})${PUAN}`, "gi") : new RegExp(String.raw`(SAY|SÖZ|SOZ|EA)${PUAN}`, "gi");
  for (const m of metin.matchAll(desen)) {
    const tur = sinav === "kpss" ? `P${m[1]}` : m[1]!.toLocaleUpperCase("tr-TR").replace("Ö", "O");
    const deger = Number(m[2]!.replace(",", "."));
    if (deger > 0 && deger <= 120) sonuc[tur] = deger;
  }
  const tekSayi = metin.trim().match(/^(\d{1,3}(?:[.,]\d+)?)$/);
  if (Object.keys(sonuc).length === 0 && tekSayi) {
    const varsayilan = sinav === "ales" ? "SAY" : egitim === "onlisans" ? "P93" : egitim === "ortaogretim" ? "P94" : "P3";
    sonuc[varsayilan] = Number(tekSayi[1]!.replace(",", "."));
  }
  return Object.keys(sonuc).length ? sonuc : null;
}
