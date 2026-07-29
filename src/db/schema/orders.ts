import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import type { User } from './users'
import type { ProductVariant } from './catalog'

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  status: text('status').notNull().default('pending'),
  totalAmount: integer('total_amount').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const orderItems = sqliteTable('order_items', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  variantId: text('variant_id').notNull(),
  quantity: integer('quantity').notNull(),
  price: integer('price').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderItem = typeof orderItems.$inferSelect
export type NewOrderItem = typeof orderItems.$inferInsert

export type OrderWithItems = Order & {
  items: OrderItem[]
}

export type OrderItemDetail = OrderItem & {
  variant: ProductVariant | null
}

export type OrderDetails = Order & {
  user: User | null
  items: OrderItemDetail[]
}

export const CREATE_ORDERS_TABLES_SQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  total_amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE NO ACTION ON DELETE CASCADE
);
`
