import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema/orders.ts',
  out: './drizzle/orders',
  dialect: 'sqlite',
})
