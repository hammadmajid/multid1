import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema/catalog.ts',
  out: './drizzle/catalog',
  dialect: 'sqlite',
})
