import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import * as usersSchema from './schema/users'
import { users, userSessions, type User, type UserSession } from './schema/users'
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
}

export function createMultiD1Client(env: Env): MultiD1Client {
  return new MultiD1Client(env)
}
