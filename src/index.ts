import { Hono } from 'hono'

export * from './db'
export * from './utils/ulid'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Multi-D1!')
})

export default app
