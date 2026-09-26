/**
 * Telegram bot setup and local development.
 *
 *   npm run telegram -- webhook https://your.site   point the bot at the deployed site
 *   npm run telegram -- info                         where the bot delivers updates now
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

const COMMANDS = {
  en: [{ command: 'menu', description: 'Show the menu' }],
  es: [{ command: 'menu', description: 'Mostrar el menú' }],
  ru: [{ command: 'menu', description: 'Показать меню' }],
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
