import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import * as usersSchema from './schema/users'
import { users, userSessions, type User, type UserSession } from './schema/users'
import {
  products,
  productVariants,
  type Product,
  type ProductVariant,
  type ProductWithVariants,
} from './schema/catalog'
import * as cartSchema from './schema/cart'
import * as catalogSchema from './schema/catalog'
import * as ordersSchema from './schema/orders'
import * as reviewsSchema from './schema/reviews'
import { generateId } from '../utils/ulid'
import { ReferentialIntegrityError } from './errors'

export interface Env {
  DB_USERS: D1Database
  DB_CART: D1Database
  DB_CATALOG: D1Database
  DB_ORDERS: D1Database
  DB_REVIEWS: D1Database
}

export class MultiD1Client {
  public db: {
    users: DrizzleD1Database<typeof usersSchema>
    cart: DrizzleD1Database<typeof cartSchema>
    catalog: DrizzleD1Database<typeof catalogSchema>
    orders: DrizzleD1Database<typeof ordersSchema>
    reviews: DrizzleD1Database<typeof reviewsSchema>
  }

  constructor(env: Env) {
    this.db = {
      users: drizzle(env.DB_USERS, { schema: usersSchema }),
      cart: drizzle(env.DB_CART, { schema: cartSchema }),
      catalog: drizzle(env.DB_CATALOG, { schema: catalogSchema }),
      orders: drizzle(env.DB_ORDERS, { schema: ordersSchema }),
      reviews: drizzle(env.DB_REVIEWS, { schema: reviewsSchema }),
    }
  }

  // --- USER OPERATIONS ---

  async createUser(data: { id?: string; email: string; name: string }): Promise<User> {
    const id = data.id ?? generateId('usr')
    const newUser = {
      id,
      email: data.email,
      name: data.name,
      createdAt: new Date(),
    }
    await this.db.users.insert(users).values(newUser)
    const created = await this.getUser(id)
    if (!created) {
      throw new Error(`Failed to retrieve created user ${id}`)
    }
    return created
  }

  async getUser(id: string): Promise<User | null> {
    const result = await this.db.users
      .select()
      .from(users)
      .where(eq(users.id, id))
      .get()
    return result ?? null
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const result = await this.db.users
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get()
    return result ?? null
  }

  // --- SESSION OPERATIONS ---

  async createSession(data: {
    id?: string
    userId: string
    token?: string
    expiresAt: Date
  }): Promise<UserSession> {
    const user = await this.getUser(data.userId)
    if (!user) {
      throw new ReferentialIntegrityError(`User with id '${data.userId}' does not exist`)
    }

    const id = data.id ?? generateId('ses')
    const token = data.token ?? generateId('ses')
    const newSession = {
      id,
      userId: data.userId,
      token,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    }
    await this.db.users.insert(userSessions).values(newSession)
    const created = await this.getSession(id)
    if (!created) {
      throw new Error(`Failed to retrieve created session ${id}`)
    }
    return created
  }

  async getSession(idOrToken: string): Promise<UserSession | null> {
    const byId = await this.db.users
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, idOrToken))
      .get()
    if (byId) return byId

    const byToken = await this.db.users
      .select()
      .from(userSessions)
      .where(eq(userSessions.token, idOrToken))
      .get()
    return byToken ?? null
  }
  // --- CATALOG & VARIANT OPERATIONS ---

  async createProduct(data: {
    id?: string
    name: string
    description?: string | null
    price: number
    sku?: string | null
  }): Promise<Product> {
    const id = data.id ?? generateId('prd')
    const now = new Date()
    const newProduct = {
      id,
      name: data.name,
      description: data.description ?? null,
      price: data.price,
      sku: data.sku ?? null,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.catalog.insert(products).values(newProduct)
    const created = await this.getProduct(id)
    if (!created) {
      throw new Error(`Failed to retrieve created product ${id}`)
    }
    return created
  }

  async getProduct(id: string): Promise<Product | null> {
    const result = await this.db.catalog
      .select()
      .from(products)
      .where(eq(products.id, id))
      .get()
    return result ?? null
  }

  async createVariant(data: {
    id?: string
    productId: string
    name: string
    sku?: string | null
    price?: number | null
    stock?: number
  }): Promise<ProductVariant> {
    const product = await this.getProduct(data.productId)
    if (!product) {
      throw new ReferentialIntegrityError(`Product with id '${data.productId}' does not exist`)
    }

    const id = data.id ?? generateId('var')
    const now = new Date()
    const newVariant = {
      id,
      productId: data.productId,
      name: data.name,
      sku: data.sku ?? null,
      price: data.price ?? null,
      stock: data.stock ?? 0,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.catalog.insert(productVariants).values(newVariant)
    const created = await this.getVariant(id)
    if (!created) {
      throw new Error(`Failed to retrieve created product variant ${id}`)
    }
    return created
  }

  async getVariant(id: string): Promise<ProductVariant | null> {
    const result = await this.db.catalog
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, id))
      .get()
    return result ?? null
  }

  async getProductWithVariants(productId: string): Promise<ProductWithVariants | null> {
    const product = await this.getProduct(productId)
    if (!product) return null

    const variants = await this.db.catalog
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .all()

    return {
      ...product,
      variants,
    }
  }
}

export function createMultiD1Client(env: Env): MultiD1Client {
  return new MultiD1Client(env)
}
