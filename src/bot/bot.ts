import fs from "node:fs";
import { Bot, GrammyError, InlineKeyboard, InputFile, type Context } from "grammy";
import { config } from "../config";
import { bolumAra, bolumBul } from "../data/bolumler";
import { ilanlar, kullanicilar, type Kullanici } from "../db";
import { ilanEslestir, type IlanSonucu } from "../matching/eslestir";
import { acikIlanlariBildir, taramaSuruyor, taramaYap, type Bildirici } from "../tarama";
import { bugunIso, htmlKacir as h, tarihGoster } from "../text/metin";
import { BOLUM_GRUPLARI, EGITIM_SEVIYELERI, PERSONEL_TURLERI, type BolumGrubu, type Ilan, type PersonelTuru, type Profil } from "../types";
import { bildirimMetni, profilMetni, YARDIM } from "./mesajlar";
import { puanlariCoz } from "./puan";

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TUM_TURLER = Object.keys(PERSONEL_TURLERI) as PersonelTuru[];
const ATLA = /^(yok|geç|gec|atla|-|hayır|hayir)$/i;

type Adim = "bolum" | "bolum_grup" | "kpss" | "ales" | "yds" | "dogum" | "deneyim" | "turler";

function dosyaAdi(ilan: Ilan): string {
  const ad = `${ilan.kurum} - ${ilan.baslik}`.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 90).trim();
  const uzanti = ilan.dosyaYolu?.split(".").pop() ?? "pdf";
  return `${ad}.${uzanti}`;
}

export function botOlustur() {
  const bot = new Bot(config.telegramToken);

  const bildir: Bildirici = async (chatId, ilan, sonuc) => {
    try {
      await bot.api.sendMessage(chatId, bildirimMetni(ilan, sonuc), HTML);
      if (ilan.dosyaYolu && fs.existsSync(ilan.dosyaYolu)) {
        await bot.api.sendDocument(chatId, new InputFile(ilan.dosyaYolu, dosyaAdi(ilan)));
      }
      await bekle(1100);
    } catch (hata) {
      if (hata instanceof GrammyError && hata.error_code === 403) kullanicilar.aktifAyarla(chatId, false);
      throw hata;
    }
  };

  // ---------- Profil oluşturma ----------

  const adimaGec = (chatId: number, adim: Adim | null, taslak: Record<string, any>) => kullanicilar.adimAyarla(chatId, adim, taslak);

  async function seviyeSor(ctx: Context) {
    const kb = new InlineKeyboard();
    for (const [k, ad] of Object.entries(EGITIM_SEVIYELERI)) kb.text(ad, `sv:${k}`).row();
    await ctx.reply("1/7 🎓 <b>En yüksek mezuniyet düzeyin nedir?</b>", { ...HTML, reply_markup: kb });
  }

  async function grupSor(ctx: Context, secili: BolumGrubu[], duzenle = false) {
    const kb = new InlineKeyboard();
    Object.entries(BOLUM_GRUPLARI).forEach(([k, ad], i) => {
      kb.text(`${secili.includes(k as BolumGrubu) ? "☑️" : "▫️"} ${ad}`, `bg:${k}`);
      if (i % 2 === 1) kb.row();
    });
    kb.row().text("✅ Tamam", "bg:_tamam");
    const metin = "Bölümün hangi alan/fakülte gruplarına giriyor? (Birden fazla seçebilirsin; fakülte düzeyindeki kadrolar için kullanılır)";
    if (duzenle) await ctx.editMessageReplyMarkup({ reply_markup: kb });
    else await ctx.reply(metin, { reply_markup: kb });
  }

  async function turSor(ctx: Context, secili: PersonelTuru[], duzenle = false) {
    const kb = new InlineKeyboard();
    for (const [k, ad] of Object.entries(PERSONEL_TURLERI)) kb.text(`${secili.includes(k as PersonelTuru) ? "☑️" : "▫️"} ${ad}`, `tr:${k}`).row();
    kb.text("✅ Kaydet ve bitir", "tr:_tamam");
    if (duzenle) await ctx.editMessageReplyMarkup({ reply_markup: kb });
    else await ctx.reply("7/7 🔔 <b>Hangi tür ilanlarla ilgileniyorsun?</b> (Hepsi seçili, istemediklerini kaldırabilirsin)", { ...HTML, reply_markup: kb });
  }

  const sorular: Record<Exclude<Adim, "bolum_grup" | "turler">, string> = {
    bolum: "2/7 📚 <b>Mezun olduğun bölümü yaz.</b>\nÖrn: <i>bilgisayar mühendisliği</i>",
    kpss: "3/7 📝 <b>KPSS puanlarını yaz.</b>\nÖrn: <code>P3 78.5 P94 81</code>\nBilmiyorsan veya yoksa <code>yok</code> yaz. (Puanı bilinmeyen ilanlar yine de \"olası\" olarak gelir.)",
    ales: "4/7 📝 <b>ALES puanların?</b>\nÖrn: <code>SAY 75 EA 70</code> — yoksa <code>yok</code>",
    yds: "5/7 🌍 <b>YDS / YÖKDİL / e-YDS (veya eşdeğeri) puanın?</b>\nÖrn: <code>72.5</code> — yoksa <code>yok</code>",
    dogum: "6/7 🎂 <b>Doğum yılın?</b> (Yaş sınırlarını kontrol etmek için)\nÖrn: <code>1998</code> — atlamak için <code>geç</code>",
    deneyim: "6/7 💼 <b>Toplam iş deneyimin kaç yıl?</b>\nÖrn: <code>2</code> (yoksa <code>0</code>) — atlamak için <code>geç</code>",
  };

  async function sor(ctx: Context, adim: keyof typeof sorular) {
    await ctx.reply(sorular[adim], HTML);
  }

  async function profiliBitir(ctx: Context, k: Kullanici) {
    const t = k.taslak;
    const profil: Profil = {
      egitimSeviyesi: t.egitimSeviyesi ?? "lisans",
      bolumId: t.bolumId ?? null,
      bolumAdi: t.bolumAdi ?? null,
      bolumGruplari: t.bolumGruplari ?? [],
      nitelikKodlari: k.profil?.nitelikKodlari ?? [],
      kpss: t.kpss ?? {},
      ales: t.ales ?? {},
      yds: t.yds ?? null,
      dogumYili: t.dogumYili ?? null,
      deneyimYil: t.deneyimYil ?? null,
      ilgiTurleri: t.ilgiTurleri ?? TUM_TURLER,
    };
    kullanicilar.profilKaydet(k.chatId, profil);
    await ctx.reply(`${profilMetni(profil)}\n\n✅ Profil kaydedildi. Açık ilanları senin için tarıyorum; uygun olanları birazdan göndereceğim.`, HTML);

    // Uzun sürebilir; bot diğer mesajlara cevap verebilsin diye beklenmez.
    void (async () => {
      const gonderilen = await acikIlanlariBildir(bildir, k.chatId);
      const ozet = taramaSuruyor() ? null : await taramaYap(bildir);
      if (ozet && gonderilen + ozet.bildirim === 0) {
        await bot.api.sendMessage(k.chatId, "Şu an açık ilanlar arasında sana uygun kadro bulamadım. Yeni ilan çıktığında haber vereceğim. 🔔");
      }
    })().catch((e) => console.error("[profil sonrası tarama]", e));
  }

  bot.command("start", async (ctx) => {
    const k = kullanicilar.olustur(ctx.chat.id, ctx.from?.first_name ?? null);
    await ctx.reply(YARDIM, HTML);
    if (k.profil) {
      await ctx.reply("Profilin zaten kayıtlı. Güncellemek için /profil yazabilirsin.");
      return;
    }
    adimaGec(ctx.chat.id, null, {});
    await ctx.reply("Hadi profilini oluşturalım 👇");
    await seviyeSor(ctx);
  });

  bot.callbackQuery(/^sv:(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const k = kullanicilar.olustur(ctx.chat!.id, ctx.from.first_name);
    const egitimSeviyesi = ctx.match[1];
    await ctx.editMessageText(`🎓 Eğitim: <b>${EGITIM_SEVIYELERI[egitimSeviyesi as keyof typeof EGITIM_SEVIYELERI]}</b>`, HTML);
    if (egitimSeviyesi === "ortaogretim") {
      adimaGec(k.chatId, "kpss", { egitimSeviyesi, bolumGruplari: [] });
      await sor(ctx, "kpss");
    } else {
      adimaGec(k.chatId, "bolum", { egitimSeviyesi });
      await sor(ctx, "bolum");
    }
  });

  bot.callbackQuery(/^bl:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const k = kullanicilar.getir(ctx.chat!.id);
    if (!k) return;
    const secim = ctx.match[1]!;
    if (secim === "_ozel") {
      await ctx.editMessageText(`📚 Bölüm: <b>${h(k.taslak.bolumYazilan ?? "")}</b>`, HTML);
      adimaGec(k.chatId, "bolum_grup", { ...k.taslak, bolumId: null, bolumAdi: k.taslak.bolumYazilan, bolumGruplari: [] });
      await grupSor(ctx, []);
      return;
    }
    const tanim = bolumBul(secim);
    if (!tanim) return;
    await ctx.editMessageText(`📚 Bölüm: <b>${h(tanim.ad)}</b>\n🧩 Alanlar: ${tanim.gruplar.map((g) => BOLUM_GRUPLARI[g]).join(", ")}`, HTML);
    adimaGec(k.chatId, "kpss", { ...k.taslak, bolumId: tanim.id, bolumAdi: tanim.ad, bolumGruplari: tanim.gruplar });
    await sor(ctx, "kpss");
  });

  bot.callbackQuery(/^bg:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const k = kullanicilar.getir(ctx.chat!.id);
    if (!k || k.adim !== "bolum_grup") return;
    const secim = ctx.match[1]!;
    const secili: BolumGrubu[] = k.taslak.bolumGruplari ?? [];
    if (secim === "_tamam") {
      await ctx.editMessageText(`🧩 Alanlar: ${secili.map((g) => BOLUM_GRUPLARI[g]).join(", ") || "—"}`);
      adimaGec(k.chatId, "kpss", k.taslak);
      await sor(ctx, "kpss");
      return;
    }
    const g = secim as BolumGrubu;
    const yeni = secili.includes(g) ? secili.filter((x) => x !== g) : [...secili, g];
    adimaGec(k.chatId, "bolum_grup", { ...k.taslak, bolumGruplari: yeni });
    await grupSor(ctx, yeni, true);
  });

  bot.callbackQuery(/^tr:(.+)$/, async (ctx) => {
    const k = kullanicilar.getir(ctx.chat!.id);
    const secim = ctx.match[1]!;
    const secili: PersonelTuru[] = k?.taslak.ilgiTurleri ?? TUM_TURLER;
    await ctx.answerCallbackQuery(secim === "_tamam" && secili.length === 0 ? { text: "En az bir tür seçmelisin" } : undefined);
    if (!k || k.adim !== "turler") return;
    if (secim === "_tamam") {
      if (secili.length === 0) return;
      await ctx.editMessageText(`🔔 Türler: ${secili.length === TUM_TURLER.length ? "Hepsi" : secili.map((t) => PERSONEL_TURLERI[t]).join(", ")}`);
      await profiliBitir(ctx, k);
      return;
    }
    const t = secim as PersonelTuru;
    const yeni = secili.includes(t) ? secili.filter((x) => x !== t) : [...secili, t];
    adimaGec(k.chatId, "turler", { ...k.taslak, ilgiTurleri: yeni });
    await turSor(ctx, yeni, true);
  });

  async function metinAdimi(ctx: Context, k: Kullanici, metin: string) {
    const t = k.taslak;
    switch (k.adim as Adim) {
      case "bolum": {
        const bulunan = bolumAra(metin);
        const kb = new InlineKeyboard();
        bulunan.forEach((b) => kb.text(b.ad, `bl:${b.id}`).row());
        kb.text(`✏️ "${metin.slice(0, 30)}" olarak kaydet`, "bl:_ozel");
        adimaGec(k.chatId, "bolum", { ...t, bolumYazilan: metin.slice(0, 100) });
        await ctx.reply(bulunan.length ? "Bölümünü seç:" : "Listemde bulamadım. Yazdığın gibi kaydedebilir veya farklı yazmayı deneyebilirsin:", { reply_markup: kb });
        return;
      }
      case "kpss":
      case "ales": {
        const ales = k.adim === "ales";
        let puanlar: Record<string, number> = {};
        if (!ATLA.test(metin)) {
          const cozulen = puanlariCoz(metin, ales ? "ales" : "kpss", t.egitimSeviyesi);
          if (!cozulen) {
            await ctx.reply(ales ? "Anlayamadım. Örn: <code>SAY 75 EA 70</code> veya <code>yok</code>" : "Anlayamadım. Örn: <code>P3 78.5</code> veya <code>yok</code>", HTML);
            return;
          }
          puanlar = cozulen;
        }
        adimaGec(k.chatId, ales ? "yds" : "ales", { ...t, [k.adim!]: puanlar });
        await sor(ctx, ales ? "yds" : "ales");
        return;
      }
      case "yds":
      case "dogum":
      case "deneyim": {
        let deger: number | null = null;
        if (!ATLA.test(metin)) {
          deger = Number(metin.replace(",", "."));
          const gecerli =
            k.adim === "yds" ? deger > 0 && deger <= 100 : k.adim === "dogum" ? Number.isInteger(deger) && deger > 1950 && deger < 2015 : deger >= 0 && deger < 50;
          if (!Number.isFinite(deger) || !gecerli) {
            await ctx.reply("Geçerli bir sayı yaz (veya atlamak için <code>geç</code>).", HTML);
            return;
          }
        } else if (k.adim === "deneyim" && /^yok$/i.test(metin)) {
          deger = 0;
        }
        const alan = { yds: "yds", dogum: "dogumYili", deneyim: "deneyimYil" }[k.adim as "yds" | "dogum" | "deneyim"];
        const sonraki = { yds: "dogum", dogum: "deneyim", deneyim: "turler" }[k.adim as "yds" | "dogum" | "deneyim"] as Adim;
        adimaGec(k.chatId, sonraki, { ...t, [alan]: deger });
        if (sonraki === "turler") await turSor(ctx, t.ilgiTurleri ?? TUM_TURLER);
        else await sor(ctx, sonraki as keyof typeof sorular);
        return;
      }
      default:
        await ctx.reply("Lütfen yukarıdaki butonlardan seçim yap.");
    }
  }

  // ---------- Komutlar ----------

  bot.command(["yardim", "help"], (ctx) => ctx.reply(YARDIM, HTML));

  bot.command("profil", async (ctx) => {
    const k = kullanicilar.getir(ctx.chat.id);
    if (!k?.profil) {
      await ctx.reply("Henüz profilin yok. /start ile oluşturabilirsin.");
      return;
    }
    await ctx.reply(profilMetni(k.profil), { ...HTML, reply_markup: new InlineKeyboard().text("✏️ Profili yeniden oluştur", "pr:yeni") });
  });

  bot.callbackQuery("pr:yeni", async (ctx) => {
    await ctx.answerCallbackQuery();
    kullanicilar.olustur(ctx.chat!.id, ctx.from.first_name);
    adimaGec(ctx.chat!.id, null, {});
    await seviyeSor(ctx);
  });

  bot.command("nitelik", async (ctx) => {
    const k = kullanicilar.getir(ctx.chat.id);
    if (!k?.profil) return void (await ctx.reply("Önce /start ile profilini oluştur."));
    const kodlar = [...new Set(ctx.match.match(/\b\d{4}\b/g) ?? [])];
    kullanicilar.profilKaydet(k.chatId, { ...k.profil, nitelikKodlari: kodlar });
    await ctx.reply(
      kodlar.length
        ? `🔢 Nitelik kodların kaydedildi: ${kodlar.join(", ")}`
        : "Nitelik kodların temizlendi. Eklemek için: <code>/nitelik 4531 4519</code>\n(Kodlarını ÖSYM KPSS tercih kılavuzundaki nitelik tablosundan bulabilirsin.)",
      HTML,
    );
    if (kodlar.length) await acikIlanlariBildir(bildir, k.chatId);
  });

  bot.command("ilanlar", async (ctx) => {
    const k = kullanicilar.getir(ctx.chat.id);
    if (!k?.profil) return void (await ctx.reply("Önce /start ile profilini oluştur."));
    const eslesenler: { ilan: Ilan; sonuc: IlanSonucu }[] = [];
    for (const ilan of ilanlar.acikAyristirilmis(bugunIso())) {
      const sonuc = ilanEslestir(k.profil, ilan.sartlar!);
      if (sonuc.durum !== "uygun_degil") eslesenler.push({ ilan, sonuc });
    }
    if (eslesenler.length === 0) {
      await ctx.reply(taramaSuruyor() ? "Şu an ilanlar taranıyor, uygun olanlar bulundukça gelecek." : "Şu an açık ilanlar arasında sana uygun kadro yok. 🔔 Yeni ilan çıkınca haber vereceğim.");
      return;
    }
    eslesenler.sort((a, b) => (a.sonuc.durum === b.sonuc.durum ? 0 : a.sonuc.durum === "uygun" ? -1 : 1));
    const liste = eslesenler.slice(0, 20);
    const kb = new InlineKeyboard();
    const satirlar = liste.map(({ ilan, sonuc }, i) => {
      kb.text(`${i + 1}`, `il:${ilan.id}`);
      if (i % 5 === 4) kb.row();
      return `${i + 1}. ${sonuc.durum === "uygun" ? "✅" : "🟡"} <b>${h(ilan.kurum)}</b> – ${h(ilan.baslik)} (son: ${tarihGoster(ilan.sartlar?.sonBasvuruTarihi ?? ilan.bitis)})`;
    });
    await ctx.reply(`<b>Sana uygun açık ilanlar (${eslesenler.length})</b>\n\n${satirlar.join("\n")}\n\nDetay ve PDF için numaraya bas:`, { ...HTML, reply_markup: kb });
  });

  bot.callbackQuery(/^il:(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const k = kullanicilar.getir(ctx.chat!.id);
    const ilan = ilanlar.getir(ctx.match[1]!);
    if (!k?.profil || !ilan?.sartlar) return;
    await bildir(k.chatId, ilan, ilanEslestir(k.profil, ilan.sartlar));
  });

  bot.command("durdur", async (ctx) => {
    kullanicilar.aktifAyarla(ctx.chat.id, false);
    await ctx.reply("🔕 Bildirimler durduruldu. Tekrar açmak için /devam");
  });

  bot.command("devam", async (ctx) => {
    kullanicilar.aktifAyarla(ctx.chat.id, true);
    await ctx.reply("🔔 Bildirimler açıldı.");
  });

  bot.command("tara", async (ctx) => {
    if (config.adminChatIds.length && !config.adminChatIds.includes(ctx.chat.id)) return;
    if (taramaSuruyor()) return void (await ctx.reply("Tarama zaten sürüyor."));
    await ctx.reply("🔎 Tarama başladı, bitince haber vereceğim.");
    const chatId = ctx.chat.id;
    void taramaYap(bildir)
      .then(async (ozet) => {
        if (!ozet) return;
        const s = ilanlar.sayilar();
        await bot.api.sendMessage(
          chatId,
          `Tarama bitti.\nListede: ${ozet.listedeki} · İndirilen: ${ozet.indirilen} · Ayrıştırılan: ${ozet.ayristirilan} · Hatalı: ${ozet.hatali} · Bildirim: ${ozet.bildirim}\n\nVeritabanı: ${Object.entries(s).map(([d, n]) => `${d} ${n}`).join(", ")}`,
        );
      })
      .catch(async (e) => bot.api.sendMessage(chatId, `Tarama hatası: ${(e as Error).message}`));
  });

  bot.on("message:text", async (ctx) => {
    const k = kullanicilar.getir(ctx.chat.id);
    if (k?.adim) await metinAdimi(ctx, k, ctx.message.text.trim());
    else await ctx.reply(k?.profil ? YARDIM : "Başlamak için /start yaz.", HTML);
  });

  bot.catch((hata) => console.error("[bot]", hata.error));

  return { bot, bildir };
}
