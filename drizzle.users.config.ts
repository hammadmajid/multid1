import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema/users.ts',
  out: './drizzle/users',
  dialect: 'sqlite',
})
