import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { renderToReadableStream } from 'react-dom/server.browser'

const app = new Hono()
app.get('/', async c => {
  const stream = await renderToReadableStream(<h1>Hello, Streaming SSR</h1>)

  return new Response(stream, {
    headers: { 'content-type': 'text/html' },
  })
})

serve(app, info => {
  console.log(`Listening on ${info.address}:${info.port}`)
})
