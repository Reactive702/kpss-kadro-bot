import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { config } from "../config";
import {
  BOLUM_GRUPLARI,
  EGITIM_SEVIYELERI,
  PERSONEL_TURLERI,
  type BolumGrubu,
  type EgitimSeviyesi,
  type IlanSartlari,
  type Kadro,
  type PersonelTuru,
  type PuanSarti,
} from "../types";
import type { IlanDosyasi } from "../sources/kamuilan";

const metin = (description?: string, nullable = false): Schema => ({ type: Type.STRING, description, nullable });
const sayi = (description?: string): Schema => ({ type: Type.NUMBER, description, nullable: true });
const liste = (items: Schema, description?: string): Schema => ({ type: Type.ARRAY, items, description });
const secenek = (degerler: string[], description?: string): Schema => ({ type: Type.STRING, enum: degerler, description });

const SEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    kurum: metin(),
    baslik: metin(),
    sonBasvuruTarihi: metin("YYYY-MM-DD", true),
    personelTuru: secenek(Object.keys(PERSONEL_TURLERI)),
    kadrolar: liste({
      type: Type.OBJECT,
      properties: {
        unvan: metin(),
        adet: sayi(),
        egitimSeviyesi: secenek(Object.keys(EGITIM_SEVIYELERI)),
        ustOgrenimKabul: { type: Type.BOOLEAN },
        herhangiBolum: { type: Type.BOOLEAN },
        bolumler: liste(metin()),
        bolumGruplari: liste(secenek(Object.keys(BOLUM_GRUPLARI))),
        benzerBolumlerKabul: { type: Type.BOOLEAN },
        nitelikKodlari: liste(metin()),
        puanSartlari: liste({
          type: Type.OBJECT,
          properties: { sinav: secenek(["KPSS", "ALES", "DIGER"]), puanTuru: metin(undefined, true), minPuan: sayi() },
          required: ["sinav", "puanTuru", "minPuan"],
        }),
        yabanciDil: {
          type: Type.OBJECT,
          properties: { gerekli: { type: Type.BOOLEAN }, minPuan: sayi(), aciklama: metin(undefined, true) },
          required: ["gerekli", "minPuan", "aciklama"],
        },
        yasSiniri: sayi(),
        minDeneyimYil: sayi(),
        deneyimAciklama: metin(undefined, true),
        cinsiyet: secenek(["erkek", "kadin", "farketmez"]),
        digerSartlar: liste(metin()),
      },
      required: [
        "unvan", "adet", "egitimSeviyesi", "ustOgrenimKabul", "herhangiBolum", "bolumler", "bolumGruplari",
        "benzerBolumlerKabul", "nitelikKodlari", "puanSartlari", "yabanciDil", "yasSiniri", "minDeneyimYil",
        "deneyimAciklama", "cinsiyet", "digerSartlar",
      ],
    }),
  },
  required: ["kurum", "baslik", "sonBasvuruTarihi", "personelTuru", "kadrolar"],
};

const TALIMAT = `Sen Türkiye'deki kamu personel alım ilanlarını analiz eden bir uzmansın. Ekteki ilanı oku ve başvuru şartlarını şemaya göre çıkar. Bu veri, adayların hangi kadrolara başvurabileceğini otomatik belirlemek için kullanılacak; yanlış eleme yapmamak çok önemli.

Kurallar:
- Her farklı kadro/pozisyon/unvan ayrı bir "kadrolar" öğesi olsun. Aynı unvan farklı bölüm veya puan şartlarıyla birden çok satırda geçiyorsa her satır ayrı öğe olsun.
- Genel şartlar (tüm kadrolar için geçerli olanlar: yaş, yabancı dil, puan vb.) her kadroya ayrı ayrı yansıtılmalı.
- bolumler: İlanda açıkça sayılan bölüm/program adlarını tam adıyla, her biri ayrı öğe olarak yaz ("veya", "ya da", "/" ile birleşenleri ayır). Örn: ["Bilgisayar Mühendisliği", "Yazılım Mühendisliği"].
- bolumGruplari: Bölümler fakülte/alan düzeyinde tarif edilmişse ilgili grupları seç. Örn: "Mühendislik Fakültelerinin bölümlerinden" -> ["muhendislik"]; "İktisadi ve İdari Bilimler Fakültesi" -> ["iktisadi_idari"]; "bilgisayar/bilişim ile ilgili bölümler" -> ["bilisim"]. Sadece tek tek bölüm sayılmışsa boş bırak.
- herhangiBolum: "herhangi bir lisans/önlisans programından mezun olmak" veya ÖSYM nitelik kodu 4001 (lisans), 3001 (önlisans), 2001 (ortaöğretim) gibi bölüm kısıtı yoksa true.
- benzerBolumlerKabul: "ilgili bölümler", "benzeri", "vb.", "eşdeğer bölümler" gibi açık uçlu ifadeler varsa true. YÖK denkliği ifadesi tek başına bunu true yapmaz.
- nitelikKodlari: ÖSYM nitelik kodları (4 haneli, örn. 4531) varsa yaz.
- puanSartlari: Kabul edilen sınav puanları. Biri yeterliyse (örn. "KPSS P3 veya ALES EA") her birini ayrı öğe olarak yaz. KPSS için puanTuru "P3", "P93", "P94", "P1" ... ; ALES için "SAY", "SOZ", "EA". Asgari puan yoksa minPuan null. Puan şartı yoksa boş liste.
- yabanciDil: YDS/YÖKDİL/e-YDS veya eşdeğeri zorunluysa gerekli=true ve asgari puan minPuan. Sadece tercih sebebiyse gerekli=false.
- yasSiniri: "X yaşını doldurmamış olmak" veya "X yaşından gün almamış olmak" ise X. Yoksa null.
- minDeneyimYil: Asgari mesleki deneyim (yıl). Deneyimin belirli bir alanda olması gerekiyorsa deneyimAciklama'ya kısaca yaz (örn. "yazılım geliştirme").
- ustOgrenimKabul: Lisans ve üstü kadrolarda true. Ortaöğretim/önlisans kadrolarında yalnızca üst öğrenim mezunlarının başvurabileceği açıkça yazıyorsa true.
- personelTuru: memur, sozlesmeli_4b (657 4/B), sozlesmeli_bilisim (bilişim personeli), kariyer_uzman (uzman/denetçi/müfettiş yardımcılığı), kalkinma_ajansi, kurumsal_sozlesmeli (KİT, kurum kanununa tabi sözleşmeli), akademik, isci, askeri, yargi, diger.
- sonBasvuruTarihi: YYYY-MM-DD.
- digerSartlar: Önemli ek şartlar, en fazla 5 kısa madde (sertifika, ehliyet, programlama dili bilgisi vb.).
- Bilmediğin değerleri uydurma; null veya boş liste bırak.`;

let istemci: GoogleGenAI | null = null;
let sonIstek = 0;

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function siraBekle() {
  const kalan = sonIstek + config.geminiIstekAraligiMs - Date.now();
  if (kalan > 0) await bekle(kalan);
  sonIstek = Date.now();
}

const anahtarMi = <T extends object>(nesne: T, k: unknown): k is keyof T => typeof k === "string" && k in nesne;
const metinListesi = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()) : []);
const sayiVeyaNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const metinVeyaNull = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);

function kadroTemizle(h: any): Kadro {
  const egitimSeviyesi: EgitimSeviyesi = anahtarMi(EGITIM_SEVIYELERI, h?.egitimSeviyesi) ? h.egitimSeviyesi : "lisans";
  const puanSartlari: PuanSarti[] = (Array.isArray(h?.puanSartlari) ? h.puanSartlari : []).map((p: any) => ({
    sinav: ["KPSS", "ALES", "DIGER"].includes(p?.sinav) ? p.sinav : "DIGER",
    puanTuru: metinVeyaNull(p?.puanTuru),
    minPuan: sayiVeyaNull(p?.minPuan),
  }));
  return {
    unvan: metinVeyaNull(h?.unvan) ?? "Belirtilmemiş",
    adet: sayiVeyaNull(h?.adet),
    egitimSeviyesi,
    ustOgrenimKabul: typeof h?.ustOgrenimKabul === "boolean" ? h.ustOgrenimKabul : egitimSeviyesi !== "ortaogretim" && egitimSeviyesi !== "onlisans",
    herhangiBolum: h?.herhangiBolum === true,
    bolumler: metinListesi(h?.bolumler),
    bolumGruplari: metinListesi(h?.bolumGruplari).filter((g): g is BolumGrubu => anahtarMi(BOLUM_GRUPLARI, g)),
    benzerBolumlerKabul: h?.benzerBolumlerKabul === true,
    nitelikKodlari: metinListesi(h?.nitelikKodlari),
    puanSartlari,
    yabanciDil: {
      gerekli: h?.yabanciDil?.gerekli === true,
      minPuan: sayiVeyaNull(h?.yabanciDil?.minPuan),
      aciklama: metinVeyaNull(h?.yabanciDil?.aciklama),
    },
    yasSiniri: sayiVeyaNull(h?.yasSiniri),
    minDeneyimYil: sayiVeyaNull(h?.minDeneyimYil),
    deneyimAciklama: metinVeyaNull(h?.deneyimAciklama),
    cinsiyet: h?.cinsiyet === "erkek" || h?.cinsiyet === "kadin" ? h.cinsiyet : "farketmez",
    digerSartlar: metinListesi(h?.digerSartlar).slice(0, 5),
  };
}

export async function ilanSartlariniCikar(
  dosya: IlanDosyasi,
  ipucu: { kurum: string; baslik: string; bitis: string | null; tahminiTur: PersonelTuru | null },
): Promise<IlanSartlari> {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY tanımlı değil (.env dosyasına ekleyin)");
  istemci ??= new GoogleGenAI({ apiKey: config.geminiApiKey });

  const icerik =
    dosya.mime === "text/plain"
      ? { text: `İLAN METNİ:\n${dosya.veri.toString("utf8").slice(0, 400_000)}` }
      : { inlineData: { mimeType: dosya.mime, data: dosya.veri.toString("base64") } };
  const bilgi = `Portal bilgisi: Kurum "${ipucu.kurum}", başlık "${ipucu.baslik}", portaldaki son başvuru ${ipucu.bitis ?? "bilinmiyor"}.`;

  let sonHata: unknown;
  let modelSirasi = 0;
  for (let deneme = 0; deneme < config.geminiModelleri.length + 2; deneme++) {
    const model = config.geminiModelleri[modelSirasi % config.geminiModelleri.length]!;
    await siraBekle();
    try {
      const yanit = await istemci.models.generateContent({
        model,
        contents: [{ role: "user", parts: [icerik, { text: `${TALIMAT}\n\n${bilgi}` }] }],
        config: { responseMimeType: "application/json", responseSchema: SEMA, temperature: 0, httpOptions: { timeout: 90_000 } },
      });
      const ham = JSON.parse(yanit.text ?? "{}");
      return {
        kurum: metinVeyaNull(ham.kurum) ?? ipucu.kurum,
        baslik: metinVeyaNull(ham.baslik) ?? ipucu.baslik,
        sonBasvuruTarihi: /^\d{4}-\d{2}-\d{2}$/.test(ham.sonBasvuruTarihi ?? "") ? ham.sonBasvuruTarihi : ipucu.bitis,
        personelTuru: anahtarMi(PERSONEL_TURLERI, ham.personelTuru) ? ham.personelTuru : (ipucu.tahminiTur ?? "diger"),
        kadrolar: (Array.isArray(ham.kadrolar) ? ham.kadrolar : []).map(kadroTemizle),
      };
    } catch (hata: any) {
      sonHata = hata;
      const kota = hata?.status === 429 || /RESOURCE_EXHAUSTED|429/.test(String(hata?.message));
      const modelSorunu = hata?.status === 404 || hata?.status >= 500 || hata?.status == null;
      if (!kota && !modelSorunu && !(hata instanceof SyntaxError)) break;
      console.warn(`[gemini] ${model}: ${hata?.status ?? ""} ${String(hata?.message).slice(0, 120)}`);
      if (modelSorunu || kota) modelSirasi++;
      if (kota && modelSirasi % config.geminiModelleri.length === 0) await bekle(60_000);
    }
  }
  throw sonHata;
}
