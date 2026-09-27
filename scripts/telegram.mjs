/**
 * Telegram bot setup and local development.
 *
 *   npm run telegram -- webhook https://your.site   point the bot at the deployed site
 *   npm run telegram -- info                         where the bot delivers updates now
 *   npm run telegram -- profile                      set the bot's name and descriptions
 *   npm run telegram -- poll [http://localhost:3001] local dev: fetch updates and pass
 *                                                    them to the local webhook route
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env.local. `poll`
 * removes the webhook (Telegram delivers one way or the other); run `webhook`
 * again when done.
 */

const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
if (!token || !secret) {
  console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local first.')
  process.exit(1)
}

async function api(method, payload = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`${method}: ${data.description}`)
  return data.result
}

/** The store's name, as in src/config/store.ts: the texts below say "NexStore". */
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME?.trim() || 'NexStore'
const named = (text) => text.replaceAll('NexStore', STORE_NAME)

const COMMANDS = {
  en: [{ command: 'menu', description: 'Show the menu' }],
  es: [{ command: 'menu', description: 'Mostrar el menú' }],
  ru: [{ command: 'menu', description: 'Показать меню' }],
}

/** What a user sees in the bot's profile and before pressing Start, per language. */
const PROFILE = {
  en: {
    short: 'Electronics, smart home and clothing. Search the catalogue, check an order, reach the team.',
    description:
      `Hi! I'm the NexStore shop assistant.

🔍 Find products by name, type or budget (“smart home under 60”)
🗂 Browse the catalogue
📦 Check an order's status
🚚 Delivery and returns
🙋 Write to the team

Press Start to begin.`,
  },
  es: {
    short: 'Electrónica, hogar inteligente y ropa. Busca en el catálogo, consulta un pedido, contacta con el equipo.',
    description:
      `¡Hola! Soy el asistente de la tienda NexStore.

🔍 Busca productos por nombre, tipo o presupuesto («hogar inteligente menos de 60»)
🗂 Explora el catálogo
📦 Consulta el estado de un pedido
🚚 Envíos y devoluciones
🙋 Escribe al equipo

Pulsa Iniciar para empezar.`,
  },
  ru: {
    short: 'Электроника, умный дом и одежда. Поиск по каталогу, статус заказа, связь с командой.',
    description:
      `Привет! Я помощник магазина NexStore.

🔍 Найду товар по названию, типу или бюджету («умный дом до 60»)
🗂 Покажу каталог
📦 Подскажу статус заказа
🚚 Расскажу о доставке и возврате
🙋 Передам сообщение команде

Нажмите «Запустить», чтобы начать.`,
  },
}

const [command = 'info', arg] = process.argv.slice(2)

if (command === 'webhook') {
  if (!arg?.startsWith('https://')) throw new Error('Give the site address: npm run telegram -- webhook https://your.site')
  const url = `${arg.replace(/\/$/, '')}/api/telegram/webhook`
  await api('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  })
  await api('setMyCommands', { commands: COMMANDS.en })
  for (const lang of ['es', 'ru']) await api('setMyCommands', { commands: COMMANDS[lang], language_code: lang })
  console.log(`Webhook set: ${url}`)
} else if (command === 'profile') {
  for (const [lang, text] of Object.entries(PROFILE)) {
    // English is also the default for every other language.
    const language_code = lang === 'en' ? undefined : lang
    await api('setMyName', { name: STORE_NAME, language_code })
    await api('setMyShortDescription', { short_description: named(text.short), language_code })
    await api('setMyDescription', { description: named(text.description), language_code })
  }
  await api('setMyCommands', { commands: COMMANDS.en })
  for (const lang of ['es', 'ru']) await api('setMyCommands', { commands: COMMANDS[lang], language_code: lang })
  console.log('Name, descriptions and commands set in EN/ES/RU.')
} else if (command === 'info') {
  const me = await api('getMe')
  const info = await api('getWebhookInfo')
  console.log(`@${me.username}: ${info.url || 'no webhook (polling)'}`)
  if (info.last_error_message) console.log(`Last error: ${info.last_error_message}`)
  if (info.pending_update_count) console.log(`Pending updates: ${info.pending_update_count}`)
} else if (command === 'poll') {
  const target = `${(arg ?? 'http://localhost:3001').replace(/\/$/, '')}/api/telegram/webhook`
  await api('deleteWebhook')
  console.log(`Polling; passing updates to ${target}. Ctrl+C to stop.`)
  let offset = 0
  for (;;) {
    const updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] })
    for (const update of updates) {
      offset = update.update_id + 1
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
        body: JSON.stringify(update),
      })
      console.log(`update ${update.update_id} -> ${res.status}`)
    }
  }
} else {
  console.error(`Unknown command: ${command}`)
  process.exit(1)
}
