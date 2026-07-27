import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema/cart.ts',
  out: './drizzle/cart',
  dialect: 'sqlite',
})
