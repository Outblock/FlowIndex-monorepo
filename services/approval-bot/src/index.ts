import { Hono } from 'hono'
import { handleApprovalWebhook } from './handlers/approval'
import { handleTelegramWebhook } from './handlers/commands'

const app = new Hono()
const PORT = Number(process.env.PORT || 3100)
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || ''
const STUDIO_BOT_TOKEN = process.env.STUDIO_BOT_TOKEN || ''

app.get('/health', (c) => c.json({ status: 'ok' }))

app.post('/telegram/webhook', async (c) => {
  const secret = c.req.header('x-telegram-bot-api-secret-token')
  if (secret !== TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'Invalid secret' }, 401)
  }
  const update = await c.req.json()
  await handleTelegramWebhook(update)
  return c.json({ ok: true })
})

app.post('/webhook/approval', async (c) => {
  const auth = c.req.header('authorization')
  if (auth !== `Bearer ${STUDIO_BOT_TOKEN}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const payload = await c.req.json()
  const result = await handleApprovalWebhook(payload)
  if (!result.success) {
    return c.json({ error: result.error }, result.status as 404)
  }
  return c.json({ ok: true })
})

console.log(`Approval bot starting on port ${PORT}`)

export default {
  port: PORT,
  fetch: app.fetch,
}
