import { test } from "node:test";
import assert from "node:assert/strict";
import { ilanEslestir, kadroEslestir } from "./eslestir";
import { bolumAra } from "../data/bolumler";
import { karisikKodlamaCoz } from "../text/metin";
import type { IlanSartlari, Kadro, Profil } from "../types";

const bilgisayarMuh: Profil = {
  egitimSeviyesi: "lisans",
  bolumId: "bilgisayar_muh",
  bolumAdi: "Bilgisayar Mühendisliği",
  bolumGruplari: ["muhendislik", "bilisim"],
  nitelikKodlari: [],
  kpss: { P3: 82.4 },
  ales: {},
  yds: 75,
  dogumYili: 1998,
  deneyimYil: 2,
  ilgiTurleri: [],
};

function kadro(ek: Partial<Kadro>): Kadro {
  return {
    unvan: "Uzman",
    adet: 1,
    egitimSeviyesi: "lisans",
    ustOgrenimKabul: true,
    herhangiBolum: false,
    bolumler: [],
    bolumGruplari: [],
    benzerBolumlerKabul: false,
    nitelikKodlari: [],
    puanSartlari: [],
    yabanciDil: { gerekli: false, minPuan: null, aciklama: null },
    yasSiniri: null,
    minDeneyimYil: null,
    deneyimAciklama: null,
    cinsiyet: "farketmez",
    digerSartlar: [],
    ...ek,
  };
}

test("açıkça sayılan bölüm tam eşleşir", () => {
  const s = kadroEslestir(bilgisayarMuh, kadro({ bolumler: ["Yazılım Mühendisliği", "Bilgisayar Mühendisliği (İngilizce)"] }), null);
  assert.equal(s.durum, "uygun");
  assert.match(s.eslesme!, /Bölüm/);
});

test("DAKA tipi ilan: fakülte grubu + KPSS + YDS + yaş", () => {
  const k = kadro({
    unvan: "Uzman Personel",
    bolumler: ["Hukuk", "İktisat", "İşletme"],
    bolumGruplari: ["muhendislik"],
    puanSartlari: [{ sinav: "KPSS", puanTuru: "P3", minPuan: 70 }, { sinav: "ALES", puanTuru: "EA", minPuan: 70 }],
    yabanciDil: { gerekli: true, minPuan: 70, aciklama: "YDS" },
    yasSiniri: 35,
  });
  const s = kadroEslestir(bilgisayarMuh, k, "2026-10-21");
  assert.equal(s.durum, "uygun", JSON.stringify(s));
  assert.match(s.eslesme!, /Mühendislik/);
});

test("puan kayıtlı değilse elemez, muhtemel der", () => {
  const p = { ...bilgisayarMuh, kpss: {} };
  const s = kadroEslestir(p, kadro({ herhangiBolum: true, puanSartlari: [{ sinav: "KPSS", puanTuru: "P3", minPuan: 60 }] }), null);
  assert.equal(s.durum, "muhtemel");
  assert.match(s.notlar.join(), /kayıtlı değil/);
});

test("puan yetersizse uygun değil", () => {
  const s = kadroEslestir(bilgisayarMuh, kadro({ herhangiBolum: true, puanSartlari: [{ sinav: "KPSS", puanTuru: "KPSSP3", minPuan: 85 }] }), null);
  assert.equal(s.durum, "uygun_degil");
});

test("4001 / herhangi bir lisans genel kadro olarak eşleşir", () => {
  const s = kadroEslestir(bilgisayarMuh, kadro({ herhangiBolum: true }), null);
  assert.equal(s.durum, "uygun");
  assert.match(s.eslesme!, /Genel kadro/);
});

test("nitelik kodu eşleşmesi", () => {
  const p = { ...bilgisayarMuh, nitelikKodlari: ["4531"] };
  const s = kadroEslestir(p, kadro({ nitelikKodlari: ["4531", "4519"] }), null);
  assert.equal(s.durum, "uygun");
});

test("başka bölümler sayılmışsa uygun değil; BÖTE bilgisayar mühendisliğiyle karışmaz", () => {
  const s = kadroEslestir(bilgisayarMuh, kadro({ bolumler: ["Hukuk", "Bilgisayar ve Öğretim Teknolojileri Öğretmenliği"] }), null);
  assert.equal(s.durum, "uygun_degil");
});

test("açık uçlu bölüm ifadesi muhtemel olarak bildirilir", () => {
  const s = kadroEslestir(bilgisayarMuh, kadro({ bolumler: ["Elektrik Mühendisliği"], benzerBolumlerKabul: true }), null);
  assert.equal(s.durum, "muhtemel");
});

test("önlisans kadroya lisans mezunu kabul edilmiyorsa elenir", () => {
  const s = kadroEslestir(bilgisayarMuh, kadro({ egitimSeviyesi: "onlisans", ustOgrenimKabul: false, herhangiBolum: true }), null);
  assert.equal(s.durum, "uygun_degil");
});

test("yaş sınırı", () => {
  const p = { ...bilgisayarMuh, dogumYili: 1990 };
  assert.equal(kadroEslestir(p, kadro({ herhangiBolum: true, yasSiniri: 35 }), "2026-10-20").durum, "uygun_degil");
  const sinirda = { ...bilgisayarMuh, dogumYili: 1991 };
  assert.equal(kadroEslestir(sinirda, kadro({ herhangiBolum: true, yasSiniri: 35 }), "2026-10-20").durum, "muhtemel");
});

test("ilan düzeyi: süresi geçmiş ve ilgilenilmeyen türler atlanır, en iyi kadro durumu alınır", () => {
  const ilan: IlanSartlari = {
    kurum: "DOĞU ANADOLU KALKINMA AJANSI",
    baslik: "Uzman Personel Alımı",
    sonBasvuruTarihi: "2026-10-21",
    personelTuru: "kalkinma_ajansi",
    kadrolar: [kadro({ bolumler: ["Hukuk"] }), kadro({ bolumGruplari: ["muhendislik"] })],
  };
  assert.equal(ilanEslestir(bilgisayarMuh, ilan, "2026-10-07").durum, "uygun");
  assert.equal(ilanEslestir(bilgisayarMuh, ilan, "2026-10-22").atlanmaSebebi, "Son başvuru tarihi geçmiş");
  assert.equal(ilanEslestir({ ...bilgisayarMuh, ilgiTurleri: ["memur"] }, ilan, "2026-10-07").durum, "uygun_degil");
});

test("bölüm arama kısaltmaları anlar", () => {
  assert.equal(bolumAra("bilgisayar müh")[0]?.id, "bilgisayar_muh");
  assert.equal(bolumAra("ybs")[0], undefined);
  assert.equal(bolumAra("yönetim bilişim")[0]?.id, "yonetim_bilisim");
});

test("UTF-8 ve Windows-1254 karışık sayfa çözülür", () => {
  const utf8 = Buffer.from("TÜRK PATENT ", "utf8");
  const cp1254 = Buffer.from([0x44, 0xdd, 0x43, 0x4c, 0x45, 0x20, 0xdc, 0x4e, 0xdd]);
  assert.equal(karisikKodlamaCoz(Buffer.concat([utf8, cp1254])), "TÜRK PATENT DİCLE ÜNİ");
});
