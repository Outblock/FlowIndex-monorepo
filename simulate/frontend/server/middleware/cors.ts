import { defineEventHandler, handleCors } from 'h3'

export default defineEventHandler((event) => {
  handleCors(event, {
    origin: [
      'https://run.flowindex.io',
      'http://localhost:5173',
      'http://localhost:5174',
    ],
    methods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: '86400',
  })
})
