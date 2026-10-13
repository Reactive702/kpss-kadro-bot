export const EGITIM_SEVIYELERI = {
  ortaogretim: "Ortaöğretim (Lise)",
  onlisans: "Önlisans",
  lisans: "Lisans",
  yukseklisans: "Yüksek Lisans",
  doktora: "Doktora",
} as const;
export type EgitimSeviyesi = keyof typeof EGITIM_SEVIYELERI;

export const PERSONEL_TURLERI = {
  memur: "Memur (kadrolu)",
  sozlesmeli_4b: "4/B Sözleşmeli Personel",
  sozlesmeli_bilisim: "Sözleşmeli Bilişim Personeli",
  kariyer_uzman: "Kariyer Meslek (Uzman/Denetçi Yardımcısı vb.)",
  kalkinma_ajansi: "Kalkınma Ajansı (DAKA vb.)",
  kurumsal_sozlesmeli: "KİT / Kurumsal Sözleşmeli",
  akademik: "Akademik Personel",
  isci: "İşçi",
  askeri: "Askeri Personel",
  yargi: "Yargı Mensubu",
  diger: "Diğer",
} as const;
export type PersonelTuru = keyof typeof PERSONEL_TURLERI;

export const BOLUM_GRUPLARI = {
  muhendislik: "Mühendislik",
  bilisim: "Bilgisayar / Bilişim",
  iktisadi_idari: "İktisadi ve İdari Bilimler",
  hukuk: "Hukuk",
  fen: "Fen Bilimleri (Matematik, Fizik, İstatistik...)",
  sosyal: "Sosyal / Beşeri Bilimler",
  egitim: "Eğitim (Öğretmenlik)",
  saglik: "Sağlık Bilimleri",
  mimarlik_planlama: "Mimarlık ve Planlama",
  iletisim: "İletişim",
  ziraat_orman_veteriner: "Ziraat / Orman / Veteriner",
  dil_edebiyat: "Dil ve Edebiyat",
  guzel_sanatlar: "Güzel Sanatlar / Tasarım",
  spor: "Spor Bilimleri",
  ilahiyat: "İlahiyat",
  denizcilik_havacilik: "Denizcilik / Havacılık",
} as const;
export type BolumGrubu = keyof typeof BOLUM_GRUPLARI;

export interface PuanSarti {
  sinav: "KPSS" | "ALES" | "DIGER";
  /** KPSS için "P3", "P93"...; ALES için "SAY", "SOZ", "EA" */
  puanTuru: string | null;
  minPuan: number | null;
}

export interface Kadro {
  unvan: string;
  adet: number | null;
  egitimSeviyesi: EgitimSeviyesi;
  ustOgrenimKabul: boolean;
  herhangiBolum: boolean;
  bolumler: string[];
  bolumGruplari: BolumGrubu[];
  benzerBolumlerKabul: boolean;
  nitelikKodlari: string[];
  /** Listedekilerden herhangi biri yeterlidir */
  puanSartlari: PuanSarti[];
  yabanciDil: { gerekli: boolean; minPuan: number | null; aciklama: string | null };
  /** Başvuranın bu yaşı doldurmamış olması gerekir */
  yasSiniri: number | null;
  minDeneyimYil: number | null;
  deneyimAciklama: string | null;
  cinsiyet: "erkek" | "kadin" | "farketmez";
  digerSartlar: string[];
}

export interface IlanSartlari {
  kurum: string;
  baslik: string;
  sonBasvuruTarihi: string | null;
  personelTuru: PersonelTuru;
  kadrolar: Kadro[];
}

export type IlanDurumu = "yeni" | "atlandi" | "indirildi" | "ayristirildi" | "hata";

export interface Ilan {
  id: string;
  kaynak: string;
  kurum: string;
  baslik: string;
  yayinTarihi: string | null;
  baslangic: string | null;
  bitis: string | null;
  tahminiTur: PersonelTuru | null;
  durum: IlanDurumu;
  dosyaYolu: string | null;
  dosyaMime: string | null;
  sartlar: IlanSartlari | null;
  hata: string | null;
  deneme: number;
}

/**
 * Bilinmeyen değerler (null / eksik anahtar) eşleşmeyi "muhtemel"e düşürür, eleme sebebi sayılmaz;
 * böylece kullanıcı eksik bilgi yüzünden uygun bir ilanı kaçırmaz.
 */
export interface Profil {
  egitimSeviyesi: EgitimSeviyesi;
  bolumId: string | null;
  bolumAdi: string | null;
  bolumGruplari: BolumGrubu[];
  nitelikKodlari: string[];
  kpss: Record<string, number>;
  ales: Record<string, number>;
  yds: number | null;
  dogumYili: number | null;
  deneyimYil: number | null;
  ilgiTurleri: PersonelTuru[];
}
