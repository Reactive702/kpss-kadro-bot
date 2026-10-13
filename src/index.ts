import { config } from "./config";
import { botOlustur } from "./bot/bot";
import { taramaYap } from "./tarama";

if (!config.telegramToken) {
  console.error("TELEGRAM_BOT_TOKEN tanımlı değil. .env.example dosyasını .env olarak kopyalayıp doldurun.");
  process.exit(1);
}
if (!config.geminiApiKey) {
  console.warn("UYARI: GEMINI_API_KEY tanımlı değil; ilanlar indirilir ama ayrıştırılamaz, bildirim gitmez.");
}

const { bot, bildir } = botOlustur();

async function periyodikTarama() {
  try {
    const ozet = await taramaYap(bildir);
    if (ozet) console.log(`[tarama] ${new Date().toLocaleString("tr-TR")}`, ozet);
  } catch (hata) {
    console.error("[tarama] hata:", (hata as Error).message);
  }
}

await bot.api.setMyCommands([
  { command: "ilanlar", description: "Sana uygun açık ilanlar" },
  { command: "profil", description: "Profilini gör / güncelle" },
  { command: "nitelik", description: "ÖSYM nitelik kodlarını ekle" },
  { command: "durdur", description: "Bildirimleri durdur" },
  { command: "devam", description: "Bildirimleri aç" },
  { command: "tara", description: "Şimdi tara" },
  { command: "yardim", description: "Yardım" },
]);

setInterval(periyodikTarama, config.taramaAraligiDk * 60_000);
void periyodikTarama();

const durdur = () => bot.stop().finally(() => process.exit(0));
process.once("SIGINT", durdur);
process.once("SIGTERM", durdur);

console.log(`Bot başlatılıyor... (tarama her ${config.taramaAraligiDk} dk, modeller: ${config.geminiModelleri.join(", ")})`);
await bot.start({ onStart: (b) => console.log(`@${b.username} çalışıyor. Telegram'da /start yazın.`) });
