import { defineEventHandler, getRequestURL, setResponseHeaders } from 'h3'

const ALLOWED_ORIGINS = [
  'https://run.flowindex.io',
  'http://localhost:5173',
  'http://localhost:5174',
]

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/')) return

  const origin = event.headers.get('origin') ?? ''
  if (!ALLOWED_ORIGINS.includes(origin)) return

  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  })

  if (event.method === 'OPTIONS') {
    event.node.res.statusCode = 204
    return ''
  }
})
