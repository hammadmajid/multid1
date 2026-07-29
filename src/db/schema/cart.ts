import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const carts = sqliteTable('carts', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const cartItems = sqliteTable('cart_items', {
  id: text('id').primaryKey(),
  cartId: text('cart_id')
    .notNull()
    .references(() => carts.id, { onDelete: 'cascade' }),
  variantId: text('variant_id').notNull(),
  quantity: integer('quantity').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export type Cart = typeof carts.$inferSelect
export type NewCart = typeof carts.$inferInsert
export type CartItem = typeof cartItems.$inferSelect
export type NewCartItem = typeof cartItems.$inferInsert

export type CartWithItems = Cart & {
  items: CartItem[]
}

export const CREATE_CART_TABLES_SQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY NOT NULL,
  cart_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  quantity INTEGER DEFAULT 1 NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (cart_id) REFERENCES carts(id) ON UPDATE NO ACTION ON DELETE CASCADE
);
`
