import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMultiD1Client,
  resetDatabases,
} from '../src/db'

describe('Automated System Audit Utility (auditSystemIntegrity)', () => {
  beforeEach(async () => {
    await resetDatabases(env)
  })

  it('returns valid system audit with zero orphans for empty databases', async () => {
    const client = createMultiD1Client(env)
    const audit = await client.auditSystemIntegrity()
    expect(audit.isValid).toBe(true)
    expect(audit.totalOrphanedCount).toBe(0)
    expect(audit.orphanedRecords).toHaveLength(0)
  })

  it('returns valid system audit after populating valid data across 5 D1 databases', async () => {
    const client = createMultiD1Client(env)

    const user = await client.createUser({ name: 'Alice', email: 'alice@example.com' })
    await client.createSession({ userId: user.id, expiresAt: new Date(Date.now() + 3600000) })

    const product = await client.createProduct({ name: 'Laptop', price: 99900 })
    const variant = await client.createVariant({ productId: product.id, name: '16GB RAM', stock: 10 })

    const cart = await client.createCart({ userId: user.id })
    await client.addItemToCart({ cartId: cart.id, variantId: variant.id, quantity: 1 })

    const order = await client.checkoutCartToOrder(cart.id, user.id)
    expect(order).not.toBeNull()

    const review = await client.createReview({
      userId: user.id,
      productId: product.id,
      rating: 5,
      comment: 'Great laptop!',
    })
    expect(review).not.toBeNull()

    const audit = await client.auditSystemIntegrity()
    expect(audit.isValid).toBe(true)
    expect(audit.totalOrphanedCount).toBe(0)
    expect(audit.orphanedRecords).toHaveLength(0)
  })

  it('detects orphaned records when invalid foreign keys exist', async () => {
    const client = createMultiD1Client(env)

    // Insert an orphaned order referencing a non-existent user directly via SQL
    await env.DB_ORDERS.prepare(
      `INSERT INTO orders (id, user_id, status, total_amount, created_at, updated_at)
       VALUES ('ord_orphan1', 'usr_nonexistent', 'pending', 100, ?, ?)`
    ).bind(Date.now(), Date.now()).run()

    // Insert an orphaned cart item referencing a non-existent variant directly via SQL
    await env.DB_CART.prepare(
      `INSERT INTO carts (id, user_id, created_at, updated_at) VALUES ('crt_orphan1', NULL, ?, ?)`
    ).bind(Date.now(), Date.now()).run()

    await env.DB_CART.prepare(
      `INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
       VALUES ('cit_orphan1', 'crt_orphan1', 'var_nonexistent', 1, ?, ?)`
    ).bind(Date.now(), Date.now()).run()

    // Insert an orphaned review referencing non-existent user and product
    await env.DB_REVIEWS.prepare(
      `INSERT INTO reviews (id, user_id, product_id, rating, created_at, updated_at)
       VALUES ('rev_orphan1', 'usr_nonexistent', 'prd_nonexistent', 4, ?, ?)`
    ).bind(Date.now(), Date.now()).run()

    const audit = await client.auditSystemIntegrity()

    expect(audit.isValid).toBe(false)
    expect(audit.totalOrphanedCount).toBe(4) // 1 order, 1 cart item, 1 review (2 orphans: user + product)
    expect(audit.summary.ordersWithoutUsers).toBe(1)
    expect(audit.summary.cartItemsWithoutVariants).toBe(1)
    expect(audit.summary.reviewsWithoutUsers).toBe(1)
    expect(audit.summary.reviewsWithoutProducts).toBe(1)
  })
})
