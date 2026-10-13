import "dotenv/config";
import path from "node:path";

const sayi = (deger: string | undefined, varsayilan: number) => {
  const n = Number(deger);
  return Number.isFinite(n) && n > 0 ? n : varsayilan;
};

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
  /** Sırayla denenir; yoğunluk/erişim hatasında bir sonrakine geçilir */
  geminiModelleri: (process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-3.8-flash")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  taramaAraligiDk: sayi(process.env.TARAMA_ARALIGI_DK, 30),
  geminiIstekAraligiMs: sayi(process.env.GEMINI_ISTEK_ARALIGI_MS, 7000),
  adminChatIds: (process.env.ADMIN_CHAT_IDS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n !== 0),
  veriKlasoru: path.resolve(process.env.VERI_KLASORU?.trim() || "data"),
};
