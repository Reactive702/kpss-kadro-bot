import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";
import type { Ilan, IlanDurumu, Profil } from "./types";
import type { ListeIlani } from "./sources/kamuilan";

fs.mkdirSync(config.veriKlasoru, { recursive: true });
export const dosyaKlasoru = path.join(config.veriKlasoru, "ilanlar");
fs.mkdirSync(dosyaKlasoru, { recursive: true });

const db = new DatabaseSync(path.join(config.veriKlasoru, "kpss.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS kullanicilar (
    chat_id INTEGER PRIMARY KEY,
    ad TEXT,
    profil TEXT,
    aktif INTEGER NOT NULL DEFAULT 1,
    adim TEXT,
    taslak TEXT,
    olusturma TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ilanlar (
    id TEXT PRIMARY KEY,
    kaynak TEXT NOT NULL,
    kurum TEXT NOT NULL,
    baslik TEXT NOT NULL,
    yayin_tarihi TEXT,
    baslangic TEXT,
    bitis TEXT,
    tahmini_tur TEXT,
    durum TEXT NOT NULL,
    dosya_yolu TEXT,
    dosya_mime TEXT,
    sartlar TEXT,
    hata TEXT,
    deneme INTEGER NOT NULL DEFAULT 0,
    eklenme TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ilanlar_durum ON ilanlar(durum, bitis);
  CREATE TABLE IF NOT EXISTS bildirimler (
    chat_id INTEGER NOT NULL,
    ilan_id TEXT NOT NULL,
    durum TEXT NOT NULL,
    zaman TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (chat_id, ilan_id)
  );
`);

export interface Kullanici {
  chatId: number;
  ad: string | null;
  profil: Profil | null;
  aktif: boolean;
  adim: string | null;
  taslak: Record<string, any>;
}

const json = <T>(s: unknown, varsayilan: T): T => (typeof s === "string" && s ? (JSON.parse(s) as T) : varsayilan);

function kullaniciSatiri(r: Record<string, any>): Kullanici {
  return {
    chatId: Number(r.chat_id),
    ad: r.ad ?? null,
    profil: json<Profil | null>(r.profil, null),
    aktif: r.aktif === 1,
    adim: r.adim ?? null,
    taslak: json(r.taslak, {}),
  };
}

function ilanSatiri(r: Record<string, any>): Ilan {
  return {
    id: r.id,
    kaynak: r.kaynak,
    kurum: r.kurum,
    baslik: r.baslik,
    yayinTarihi: r.yayin_tarihi ?? null,
    baslangic: r.baslangic ?? null,
    bitis: r.bitis ?? null,
    tahminiTur: r.tahmini_tur ?? null,
    durum: r.durum,
    dosyaYolu: r.dosya_yolu ?? null,
    dosyaMime: r.dosya_mime ?? null,
    sartlar: json(r.sartlar, null),
    hata: r.hata ?? null,
    deneme: Number(r.deneme),
  };
}

export const kullanicilar = {
  getir(chatId: number): Kullanici | null {
    const r = db.prepare("SELECT * FROM kullanicilar WHERE chat_id = ?").get(chatId);
    return r ? kullaniciSatiri(r) : null;
  },
  olustur(chatId: number, ad: string | null): Kullanici {
    db.prepare("INSERT OR IGNORE INTO kullanicilar (chat_id, ad) VALUES (?, ?)").run(chatId, ad);
    return this.getir(chatId)!;
  },
  adimAyarla(chatId: number, adim: string | null, taslak: Record<string, any>) {
    db.prepare("UPDATE kullanicilar SET adim = ?, taslak = ? WHERE chat_id = ?").run(adim, JSON.stringify(taslak), chatId);
  },
  profilKaydet(chatId: number, profil: Profil) {
    db.prepare("UPDATE kullanicilar SET profil = ?, adim = NULL, taslak = NULL WHERE chat_id = ?").run(JSON.stringify(profil), chatId);
  },
  aktifAyarla(chatId: number, aktif: boolean) {
    db.prepare("UPDATE kullanicilar SET aktif = ? WHERE chat_id = ?").run(aktif ? 1 : 0, chatId);
  },
  bildirimAlanlar(): Kullanici[] {
    return db.prepare("SELECT * FROM kullanicilar WHERE aktif = 1 AND profil IS NOT NULL").all().map(kullaniciSatiri);
  },
};

export const ilanlar = {
  getir(id: string): Ilan | null {
    const r = db.prepare("SELECT * FROM ilanlar WHERE id = ?").get(id);
    return r ? ilanSatiri(r) : null;
  },
  ekleYoksa(i: ListeIlani, kaynak: string) {
    db.prepare(
      `INSERT OR IGNORE INTO ilanlar (id, kaynak, kurum, baslik, yayin_tarihi, baslangic, bitis, tahmini_tur, durum)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'yeni')`,
    ).run(i.id, kaynak, i.kurum, i.baslik, i.yayinTarihi, i.baslangic, i.bitis, i.tahminiTur);
  },
  durumAyarla(id: string, durum: IlanDurumu, hata: string | null = null) {
    db.prepare("UPDATE ilanlar SET durum = ?, hata = ? WHERE id = ?").run(durum, hata, id);
  },
  dosyaKaydet(id: string, yol: string, mime: string) {
    db.prepare("UPDATE ilanlar SET durum = 'indirildi', dosya_yolu = ?, dosya_mime = ?, hata = NULL WHERE id = ?").run(yol, mime, id);
  },
  sartlarKaydet(id: string, sartlar: unknown) {
    db.prepare("UPDATE ilanlar SET durum = 'ayristirildi', sartlar = ?, hata = NULL WHERE id = ?").run(JSON.stringify(sartlar), id);
  },
  ayristirmaHatasi(id: string, hata: string, maksDeneme: number) {
    db.prepare(
      `UPDATE ilanlar SET deneme = deneme + 1, hata = ?,
         durum = CASE WHEN deneme + 1 >= ? THEN 'hata' ELSE durum END
       WHERE id = ?`,
    ).run(hata, maksDeneme, id);
  },
  durumdakiler(durumlar: IlanDurumu[]): Ilan[] {
    const yer = durumlar.map(() => "?").join(",");
    return db.prepare(`SELECT * FROM ilanlar WHERE durum IN (${yer}) ORDER BY yayin_tarihi DESC`).all(...durumlar).map(ilanSatiri);
  },
  /** Başvurusu hâlâ açık, ayrıştırılmış ilanlar */
  acikAyristirilmis(bugun: string): Ilan[] {
    return db
      .prepare("SELECT * FROM ilanlar WHERE durum = 'ayristirildi' AND (bitis IS NULL OR bitis >= ?) ORDER BY yayin_tarihi DESC")
      .all(bugun)
      .map(ilanSatiri);
  },
  sayilar(): Record<string, number> {
    const satirlar = db.prepare("SELECT durum, COUNT(*) AS n FROM ilanlar GROUP BY durum").all();
    return Object.fromEntries(satirlar.map((r) => [String(r.durum), Number(r.n)]));
  },
};

export const bildirimler = {
  gonderildiMi(chatId: number, ilanId: string): boolean {
    return !!db.prepare("SELECT 1 FROM bildirimler WHERE chat_id = ? AND ilan_id = ?").get(chatId, ilanId);
  },
  kaydet(chatId: number, ilanId: string, durum: string) {
    db.prepare("INSERT OR REPLACE INTO bildirimler (chat_id, ilan_id, durum) VALUES (?, ?, ?)").run(chatId, ilanId, durum);
  },
};
