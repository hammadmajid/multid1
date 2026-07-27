import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import type { User } from './users'
import type { Product } from './catalog'

export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  productId: text('product_id').notNull(),
  rating: integer('rating').notNull(),
  title: text('title'),
  comment: text('comment'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export type Review = typeof reviews.$inferSelect
export type NewReview = typeof reviews.$inferInsert

export type ReviewWithDetails = Review & {
  user: User | null
  product: Product | null
}

export const CREATE_REVIEWS_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  title TEXT,
  comment TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`

export const CREATE_REVIEWS_TABLE_SQL = CREATE_REVIEWS_TABLES_SQL
