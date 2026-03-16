/**
 * Astro Translator — Telegram Auth Bot
 *
 * Логика:
 * 1. Пользователь пишет /start боту
 * 2. Бот проверяет telegram_id в таблице managers (Supabase)
 * 3. Если есть — отправляет кнопку открыть переводчик
 *    - HTTPS → WebApp кнопка (открывается внутри Telegram)
 *    - HTTP  → обычная URL кнопка (открывается в браузере, для локальной разработки)
 * 4. Если нет — отказывает в доступе
 *
 * Запуск: node index.js
 * Env: BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY, WEBAPP_URL
 */

require("dotenv").config({ path: ".env.local" })


const { Telegraf, Markup } = require("telegraf")
const { createClient } = require("@supabase/supabase-js")

const BOT_TOKEN = process.env.BOT_TOKEN
const WEBAPP_URL = (process.env.WEBAPP_URL || "https://your-domain.com").replace(/\/$/, "")
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required in .env.local")
if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required in .env.local")
if (!SUPABASE_KEY) throw new Error("SUPABASE_KEY is required in .env.local")

const IS_HTTPS = WEBAPP_URL.startsWith("https://")

const bot = new Telegraf(BOT_TOKEN)
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────
const roleLabels = {
  "Admin": "Администратор",
  "C-level": "Руководство",
  "SeniorSales": "Старший Sales",
  "SeniorSMM": "Старший SMM",
  "Sales": "Sales",
  "Consultant": "Консультант",
  "SMM": "SMM",
}

// Кнопка: WebApp (HTTPS) или обычная ссылка (HTTP для локалки)
function openButton() {
  if (IS_HTTPS) {
    return Markup.inlineKeyboard([
      Markup.button.webApp("🌐 Открыть Astro Translator", WEBAPP_URL)
    ])
  }
  return Markup.inlineKeyboard([
    Markup.button.url("🌐 Открыть Astro Translator", WEBAPP_URL)
  ])
}

// ── /start ────────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const telegramId = String(ctx.from.id)

  const { data: manager, error } = await supabase
    .from("managers")
    .select("id, name, role, status")
    .eq("telegram_id", telegramId)
    .eq("status", "active")
    .single()

  if (error || !manager) {
    return ctx.reply(
      `❌ У тебя нет доступа к Astro Translator.\n\nTelegram ID: <code>${telegramId}</code>\n\nОбратись к администратору.`,
      { parse_mode: "HTML" }
    )
  }

  const roleRu = roleLabels[manager.role] || manager.role

  return ctx.reply(
    `👋 Привет, ${manager.name}!\n\nРоль: ${roleRu}\n\nНажми кнопку ниже чтобы открыть переводчик:`,
    openButton()
  )
})

// ── /help ─────────────────────────────────────────────────────────────────────
bot.help((ctx) => {
  ctx.reply(
    "Astro Translator Bot\n\n/start — открыть переводчик\n\nДоступ только для сотрудников из базы данных."
  )
})

// ── Fallback ──────────────────────────────────────────────────────────────────
bot.on("message", async (ctx) => {
  const telegramId = String(ctx.from.id)

  const { data: manager } = await supabase
    .from("managers")
    .select("id, name")
    .eq("telegram_id", telegramId)
    .eq("status", "active")
    .single()

  if (!manager) {
    return ctx.reply("❌ Нет доступа. Напиши /start")
  }

  return ctx.reply("Используй кнопку ниже чтобы открыть переводчик:", openButton())
})

// ── Launch ────────────────────────────────────────────────────────────────────
console.log(`🔧 WEBAPP_URL: ${WEBAPP_URL}`)
console.log(`🔧 Режим кнопки: ${IS_HTTPS ? "WebApp (HTTPS)" : "URL (HTTP — локальная разработка)"}`)

bot.launch()
  .then(() => console.log("✅ Astro Translator Bot запущен"))
  .catch((err) => console.error("❌ Ошибка запуска бота:", err.message))

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
