/**
 * Astro Translator — Telegram Auth Bot
 *
 * Логика:
 * 1. Пользователь на сайте нажимает "Войти через Telegram"
 * 2. Сайт генерирует одноразовый токен → открывает бота с deep link:
 *    https://t.me/бот?start=TOKEN
 * 3. Пользователь нажимает Start в боте
 * 4. Бот получает TOKEN из /start, проверяет пользователя в managers,
 *    активирует токен в auth_tokens
 * 5. Сайт (polling) видит активированный токен → создаёт сессию → редирект
 *
 * Запуск: node index.js
 * Env: BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY, WEBAPP_URL
 */

require("dotenv").config({ path: ".env.local" })

const { Telegraf, Markup } = require("telegraf")
const { createClient } = require("@supabase/supabase-js")

const BOT_TOKEN    = process.env.BOT_TOKEN
const WEBAPP_URL   = (process.env.WEBAPP_URL || "https://your-domain.com").replace(/\/$/, "")
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

if (!BOT_TOKEN)    throw new Error("BOT_TOKEN is required in .env.local")
if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required in .env.local")
if (!SUPABASE_KEY) throw new Error("SUPABASE_KEY is required in .env.local")

const bot      = new Telegraf(BOT_TOKEN)
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────
const roleLabels = {
  "Admin":       "Администратор",
  "C-level":     "Руководство",
  "SeniorSales": "Старший Sales",
  "SeniorSMM":   "Старший SMM",
  "Sales":       "Sales",
  "Consultant":  "Консультант",
  "SMM":         "SMM",
}

function openButton() {
  return Markup.inlineKeyboard([
    Markup.button.url("🌐 Открыть Astro Translator", WEBAPP_URL)
  ])
}

// ── /start ────────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const telegramId = String(ctx.from.id)
  const payload    = ctx.startPayload // токен из ?start=TOKEN (пустая строка если нет)

  // Проверяем пользователя в базе
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

  // Если пришёл токен — активируем его (логин с сайта)
  if (payload && payload.length > 10) {
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("auth_tokens")
      .select("token, used, expires_at")
      .eq("token", payload)
      .single()

    if (tokenErr || !tokenRow) {
      await ctx.reply("⚠️ Ссылка недействительна. Попробуй войти снова.", openButton())
      return
    }

    if (tokenRow.used) {
      await ctx.reply("⚠️ Эта ссылка уже использована. Нажми кнопку для входа.", openButton())
      return
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      await ctx.reply("⏱ Ссылка устарела. Попробуй снова.", openButton())
      return
    }

    // Активируем токен
    await supabase
      .from("auth_tokens")
      .update({ used: true, manager_id: manager.id })
      .eq("token", payload)

    return ctx.reply(
      `✅ Привет, ${manager.name}! Ты авторизован.\n\nРоль: ${roleRu}\n\nВернись на сайт — страница обновится автоматически.`
    )
  }

  // Обычный /start без токена — показываем кнопку
  return ctx.reply(
    `👋 Привет, ${manager.name}!\n\nРоль: ${roleRu}\n\nНажми кнопку чтобы открыть переводчик:`,
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

  return ctx.reply("Используй кнопку чтобы открыть переводчик:", openButton())
})

// ── Launch ────────────────────────────────────────────────────────────────────
console.log(`🔧 WEBAPP_URL: ${WEBAPP_URL}`)

bot.launch()
  .then(() => console.log("✅ Astro Translator Bot запущен"))
  .catch((err) => console.error("❌ Ошибка запуска бота:", err.message))

process.once("SIGINT",  () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
