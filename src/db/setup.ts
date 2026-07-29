import type { Env } from './client'
import { CREATE_USERS_TABLES_SQL } from './schema/users'
import { CREATE_CART_TABLES_SQL } from './schema/cart'
import { CREATE_CATALOG_TABLES_SQL } from './schema/catalog'
import { CREATE_ORDERS_TABLES_SQL } from './schema/orders'
import { CREATE_REVIEWS_TABLES_SQL } from './schema/reviews'

async function executeSqlScript(db: D1Database, sqlScript: string) {
  await db.prepare('PRAGMA foreign_keys = ON;').run()
  const statements = sqlScript
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const stmt of statements) {
    await db.prepare(stmt).run()
  }
}

export async function setupDatabases(env: Env): Promise<void> {
  if (env.DB_USERS) await executeSqlScript(env.DB_USERS, CREATE_USERS_TABLES_SQL)
  if (env.DB_CATALOG) await executeSqlScript(env.DB_CATALOG, CREATE_CATALOG_TABLES_SQL)
  if (env.DB_CART) await executeSqlScript(env.DB_CART, CREATE_CART_TABLES_SQL)
  if (env.DB_ORDERS) await executeSqlScript(env.DB_ORDERS, CREATE_ORDERS_TABLES_SQL)
  if (env.DB_REVIEWS) await executeSqlScript(env.DB_REVIEWS, CREATE_REVIEWS_TABLES_SQL)
}

export async function resetDatabases(env: Env): Promise<void> {
  await setupDatabases(env)

  if (env.DB_REVIEWS) {
    await env.DB_REVIEWS.prepare('DELETE FROM reviews;').run()
  }
  if (env.DB_ORDERS) {
    await env.DB_ORDERS.prepare('DELETE FROM order_items;').run()
    await env.DB_ORDERS.prepare('DELETE FROM orders;').run()
  }
  if (env.DB_CART) {
    await env.DB_CART.prepare('DELETE FROM cart_items;').run()
    await env.DB_CART.prepare('DELETE FROM carts;').run()
  }
  if (env.DB_CATALOG) {
    await env.DB_CATALOG.prepare('DELETE FROM product_variants;').run()
    await env.DB_CATALOG.prepare('DELETE FROM products;').run()
  }
  if (env.DB_USERS) {
    await env.DB_USERS.prepare('DELETE FROM user_sessions;').run()
    await env.DB_USERS.prepare('DELETE FROM users;').run()
  }
}
