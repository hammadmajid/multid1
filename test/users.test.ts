import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import { createMultiD1Client, ReferentialIntegrityError } from '../src/db'
import { CREATE_USERS_TABLES_SQL } from '../src/db/schema/users'
import { generateId, isValidId } from '../src/utils/ulid'

describe('Prefixed ULID Generator', () => {
  it('generates IDs with correct prefixes', () => {
    const userId = generateId('usr')
    expect(userId).toMatch(/^usr_[0-9A-HJKMNP-TV-Z]{26}$/i)

    const sessionId = generateId('ses')
    expect(sessionId).toMatch(/^ses_[0-9A-HJKMNP-TV-Z]{26}$/i)

    const productId = generateId('prd')
    expect(productId).toMatch(/^prd_[0-9A-HJKMNP-TV-Z]{26}$/i)

    const variantId = generateId('var')
    expect(variantId).toMatch(/^var_[0-9A-HJKMNP-TV-Z]{26}$/i)

    const cartId = generateId('crt')
    expect(cartId).toMatch(/^crt_[0-9A-HJKMNP-TV-Z]{26}$/i)

    const orderId = generateId('ord')
    expect(orderId).toMatch(/^ord_[0-9A-HJKMNP-TV-Z]{26}$/i)

    const reviewId = generateId('rev')
    expect(reviewId).toMatch(/^rev_[0-9A-HJKMNP-TV-Z]{26}$/i)
  })

  it('validates IDs correctly', () => {
    const userId = generateId('usr')
    expect(isValidId(userId)).toBe(true)
    expect(isValidId(userId, 'usr')).toBe(true)
    expect(isValidId(userId, 'ses')).toBe(false)
    expect(isValidId('invalid_id')).toBe(false)
    expect(isValidId('usr_12345')).toBe(false)
    expect(isValidId('')).toBe(false)
  })
})

describe('User & Session Slice (MultiD1Client)', () => {
  beforeEach(async () => {
    // Initialize SQLite tables in DB_USERS binding
    const statements = CREATE_USERS_TABLES_SQL.split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      await env.DB_USERS.prepare(stmt).run()
    }
  })

  it('creates and retrieves a user', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({
      email: 'alice@example.com',
      name: 'Alice Developer',
    })

    expect(user.id).toMatch(/^usr_/)
    expect(user.email).toBe('alice@example.com')
    expect(user.name).toBe('Alice Developer')
    expect(user.createdAt).toBeInstanceOf(Date)

    const fetched = await client.getUser(user.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.id).toBe(user.id)
    expect(fetched?.email).toBe('alice@example.com')
  })

  it('retrieves user by email', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({
      email: 'dave@example.com',
      name: 'Dave Smith',
    })

    const fetched = await client.getUserByEmail('dave@example.com')
    expect(fetched).not.toBeNull()
    expect(fetched?.id).toBe(user.id)

    const nonExistent = await client.getUserByEmail('unknown@example.com')
    expect(nonExistent).toBeNull()
  })

  it('returns null for non-existent user ID', async () => {
    const client = createMultiD1Client(env)
    const nonExistent = await client.getUser('usr_nonexistent12345678901234')
    expect(nonExistent).toBeNull()
  })

  it('allows specifying custom prefixed user ID', async () => {
    const client = createMultiD1Client(env)
    const customId = generateId('usr')
    const user = await client.createUser({
      id: customId,
      email: 'bob@example.com',
      name: 'Bob Builder',
    })

    expect(user.id).toBe(customId)
    const fetched = await client.getUser(customId)
    expect(fetched?.name).toBe('Bob Builder')
  })

  it('creates and retrieves a session for a valid user', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({
      email: 'charlie@example.com',
      name: 'Charlie Brown',
    })

    const expiresAt = new Date(Date.now() + 86400 * 1000)
    const session = await client.createSession({
      userId: user.id,
      expiresAt,
    })

    expect(session.id).toMatch(/^ses_/)
    expect(session.userId).toBe(user.id)
    expect(session.expiresAt).toEqual(expiresAt)

    const fetchedById = await client.getSession(session.id)
    expect(fetchedById).not.toBeNull()
    expect(fetchedById?.id).toBe(session.id)

    const fetchedByToken = await client.getSession(session.token)
    expect(fetchedByToken).not.toBeNull()
    expect(fetchedByToken?.id).toBe(session.id)
  })

  it('creates multiple sessions for the same user', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({
      email: 'eve@example.com',
      name: 'Eve Online',
    })

    const expiresAt = new Date(Date.now() + 86400 * 1000)
    const s1 = await client.createSession({ userId: user.id, expiresAt })
    const s2 = await client.createSession({ userId: user.id, expiresAt })

    expect(s1.id).not.toBe(s2.id)
    expect(s1.userId).toBe(user.id)
    expect(s2.userId).toBe(user.id)
  })

  it('returns null for non-existent session ID or token', async () => {
    const client = createMultiD1Client(env)
    const nonExistent = await client.getSession('ses_nonexistent12345678901234')
    expect(nonExistent).toBeNull()
  })

  it('throws ReferentialIntegrityError when creating session for non-existent user', async () => {
    const client = createMultiD1Client(env)
    const nonExistentUserId = generateId('usr')
    const expiresAt = new Date(Date.now() + 86400 * 1000)

    await expect(
      client.createSession({
        userId: nonExistentUserId,
        expiresAt,
      })
    ).rejects.toThrow(ReferentialIntegrityError)
  })
})
