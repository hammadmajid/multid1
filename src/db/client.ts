import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import * as usersSchema from './schema/users'
import { users, userSessions, type User, type UserSession } from './schema/users'
import {
  products,
  productVariants,
  type Product,
  type ProductVariant,
  type ProductWithVariants,
} from './schema/catalog'
import {
  carts,
  cartItems,
  type Cart,
  type CartItem,
  type CartWithItems,
} from './schema/cart'
import * as cartSchema from './schema/cart'
import * as catalogSchema from './schema/catalog'
import * as ordersSchema from './schema/orders'
import * as reviewsSchema from './schema/reviews'
import { type OrderWithItems, type OrderDetails } from './schema/orders'
import { type Review, type ReviewWithDetails } from './schema/reviews'
import {
  checkoutCartToOrder,
  getOrderDetails,
  getOrdersForUser,
  getOrder,
  createOrder,
} from './orders'
import {
  createReview,
  getReview,
  getReviewsForProduct,
  type CreateReviewData,
} from './reviews'
import { generateId } from '../utils/ulid'
import { ReferentialIntegrityError } from './errors'
import { auditSystemIntegrity, type AuditResult } from './audit'

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
  // --- CART OPERATIONS ---

  async createCart(data?: { id?: string; userId?: string | null }): Promise<Cart> {
    if (data?.userId) {
      const user = await this.getUser(data.userId)
      if (!user) {
        throw new ReferentialIntegrityError(`User with id '${data.userId}' does not exist`)
      }
    }

    const id = data?.id ?? generateId('crt')
    const now = new Date()
    const newCart = {
      id,
      userId: data?.userId ?? null,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.cart.insert(carts).values(newCart)
    const created = await this.getCart(id)
    if (!created) {
      throw new Error(`Failed to retrieve created cart ${id}`)
    }
    return created
  }

  async getCart(id: string): Promise<Cart | null> {
    const result = await this.db.cart
      .select()
      .from(carts)
      .where(eq(carts.id, id))
      .get()
    return result ?? null
  }

  async getCartItem(id: string): Promise<CartItem | null> {
    const result = await this.db.cart
      .select()
      .from(cartItems)
      .where(eq(cartItems.id, id))
      .get()
    return result ?? null
  }

  async addItemToCart(data: {
    id?: string
    cartId: string
    variantId: string
    quantity?: number
  }): Promise<CartItem> {
    const cart = await this.getCart(data.cartId)
    if (!cart) {
      throw new ReferentialIntegrityError(`Cart with id '${data.cartId}' does not exist`)
    }

    const variant = await this.getVariant(data.variantId)
    if (!variant) {
      throw new ReferentialIntegrityError(`Product variant with id '${data.variantId}' does not exist`)
    }

    const qty = data.quantity ?? 1
    const existingItem = await this.db.cart
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, data.cartId), eq(cartItems.variantId, data.variantId)))
      .get()

    if (existingItem && !data.id) {
      const updatedQuantity = existingItem.quantity + qty
      const now = new Date()
      await this.db.cart
        .update(cartItems)
        .set({ quantity: updatedQuantity, updatedAt: now })
        .where(eq(cartItems.id, existingItem.id))
      const updated = await this.getCartItem(existingItem.id)
      if (!updated) {
        throw new Error(`Failed to retrieve updated cart item ${existingItem.id}`)
      }
      return updated
    }

    const id = data.id ?? generateId('cit')
    const now = new Date()
    const newItem = {
      id,
      cartId: data.cartId,
      variantId: data.variantId,
      quantity: qty,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.cart.insert(cartItems).values(newItem)
    const created = await this.getCartItem(id)
    if (!created) {
      throw new Error(`Failed to retrieve created cart item ${id}`)
    }
    return created
  }

  async getCartWithItems(cartId: string): Promise<CartWithItems | null> {
    const cart = await this.getCart(cartId)
    if (!cart) return null

    const items = await this.db.cart
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, cartId))
      .all()

    return {
      ...cart,
      items,
    }
  }

  async clearCart(cartId: string): Promise<void> {
    const cart = await this.getCart(cartId)
    if (!cart) {
      throw new ReferentialIntegrityError(`Cart with id '${cartId}' does not exist`)
    }
    await this.db.cart.delete(cartItems).where(eq(cartItems.cartId, cartId))
  }

  // --- ORDER OPERATIONS ---

  async createOrder(data: {
    id?: string
    userId: string
    items: Array<{ variantId: string; quantity: number; price: number }>
    status?: string
  }): Promise<OrderWithItems> {
    return createOrder(this, data)
  }

  async getOrder(id: string): Promise<OrderWithItems | null> {
    return getOrder(this, id)
  }

  async checkoutCartToOrder(
    cartIdOrData: string | { cartId: string; userId?: string },
    userId?: string
  ): Promise<OrderWithItems> {
    return checkoutCartToOrder(this, cartIdOrData, userId)
  }

  async getOrderDetails(orderId: string): Promise<OrderDetails | null> {
    return getOrderDetails(this, orderId)
  }

  async getOrdersForUser(userId: string): Promise<OrderWithItems[]> {
    return getOrdersForUser(this, userId)
  }


  // --- REVIEW OPERATIONS ---

  async createReview(data: CreateReviewData): Promise<Review> {
    return createReview(this, data)
  }

  async getReview(id: string): Promise<Review | null> {
    return getReview(this, id)
  }

  async getReviewsForProduct(productId: string): Promise<ReviewWithDetails[]> {
    return getReviewsForProduct(this, productId)
  }

  // --- AUDIT OPERATIONS ---

  async auditSystemIntegrity(): Promise<AuditResult> {
    return auditSystemIntegrity(this)
  }
}

export function createMultiD1Client(env: Env): MultiD1Client {
  return new MultiD1Client(env)
}
