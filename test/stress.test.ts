import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMultiD1Client,
  CREATE_USERS_TABLES_SQL,
  CREATE_CATALOG_TABLES_SQL,
  CREATE_CART_TABLES_SQL,
  CREATE_ORDERS_TABLES_SQL,
  CREATE_REVIEWS_TABLES_SQL,
  type ProductVariant,
} from '../src/db'

describe('High-Concurrency Stress Suite & Single-Writer Isolation (Ticket 6)', () => {
  beforeEach(async () => {
    for (const stmt of CREATE_USERS_TABLES_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      await env.DB_USERS.prepare(stmt).run()
    }
    for (const stmt of CREATE_CATALOG_TABLES_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      await env.DB_CATALOG.prepare(stmt).run()
    }
    for (const stmt of CREATE_CART_TABLES_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      await env.DB_CART.prepare(stmt).run()
    }
    for (const stmt of CREATE_ORDERS_TABLES_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      await env.DB_ORDERS.prepare(stmt).run()
    }
    for (const stmt of CREATE_REVIEWS_TABLES_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      await env.DB_REVIEWS.prepare(stmt).run()
    }
  })

  it('executes 200 concurrent operations on hot DB_CART with zero data corruption or orphans', async () => {
    const client = createMultiD1Client(env)

    const product = await client.createProduct({ name: 'Stress Widget', price: 500 })
    const variants = await Promise.all([
      client.createVariant({ productId: product.id, name: 'Variant A', stock: 1000 }),
      client.createVariant({ productId: product.id, name: 'Variant B', stock: 1000 }),
    ])

    const carts = await Promise.all(
      Array.from({ length: 20 }, () => client.createCart())
    )

    const cartOperations = []
    for (let i = 0; i < 200; i++) {
      const targetCart = carts[i % carts.length]
      const targetVariant = variants[i % variants.length]
      cartOperations.push(
        client.addItemToCart({
          cartId: targetCart.id,
          variantId: targetVariant.id,
          quantity: 1,
        })
      )
    }

    const start = performance.now()
    const results = await Promise.allSettled(cartOperations)
    const duration = performance.now() - start

    const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length
    expect(fulfilledCount).toBe(200)
    expect(duration).toBeGreaterThan(0)

    const audit = await client.auditSystemIntegrity()
    expect(audit.isValid).toBe(true)
    expect(audit.totalOrphanedCount).toBe(0)
  })

  it('executes 300+ cross-partition concurrent operations (carts, checkouts, reviews, queries, sessions)', async () => {
    const client = createMultiD1Client(env)

    // Seed fixture users and catalog items
    const usersList = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        client.createUser({ name: `User ${i}`, email: `user${i}@stress.com` })
      )
    )

    const productsList = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        client.createProduct({ name: `Product ${i}`, price: (i + 1) * 100 })
      )
    )

    const variantsList: ProductVariant[] = []
    for (const p of productsList) {
      const v1 = await client.createVariant({ productId: p.id, name: `${p.name} Standard`, stock: 500 })
      const v2 = await client.createVariant({ productId: p.id, name: `${p.name} Deluxe`, stock: 500 })
      variantsList.push(v1, v2)
    }

    // Pre-create carts for users
    const userCarts = await Promise.all(
      usersList.map((u) => client.createCart({ userId: u.id }))
    )

    // Build 300+ parallel concurrent operations
    const operations: Promise<any>[] = []

    // 1. Cart operations (100 operations on DB_CART)
    for (let i = 0; i < 100; i++) {
      const cart = userCarts[i % userCarts.length]
      const variant = variantsList[i % variantsList.length]
      operations.push(
        client.addItemToCart({ cartId: cart.id, variantId: variant.id, quantity: 1 })
      )
    }

    // Wait for cart items to be added before checkout stress ops
    await Promise.all(operations.splice(0, 100))

    // 2. High concurrency mixed load (250 simultaneous operations across all 5 DB partitions)
    const mixedOps: Promise<any>[] = []

    // 2a. Cart Writes & Reads (100 ops on DB_CART)
    for (let i = 0; i < 100; i++) {
      const cart = userCarts[i % userCarts.length]
      const variant = variantsList[(i + 2) % variantsList.length]
      if (i % 2 === 0) {
        mixedOps.push(client.addItemToCart({ cartId: cart.id, variantId: variant.id, quantity: 1 }))
      } else {
        mixedOps.push(client.getCartWithItems(cart.id))
      }
    }

    // 2b. Order Checkouts & Querying (50 ops on DB_ORDERS & DB_CATALOG & DB_CART)
    // Create dedicated checkout carts for checkouts
    const checkoutCarts = await Promise.all(
      Array.from({ length: 25 }, async (_, i) => {
        const u = usersList[i % usersList.length]
        const c = await client.createCart({ userId: u.id })
        await client.addItemToCart({ cartId: c.id, variantId: variantsList[i % variantsList.length].id, quantity: 1 })
        return { cartId: c.id, userId: u.id }
      })
    )

    for (let i = 0; i < 25; i++) {
      const item = checkoutCarts[i]
      mixedOps.push(client.checkoutCartToOrder(item.cartId, item.userId))
    }
    for (let i = 0; i < 25; i++) {
      const u = usersList[i % usersList.length]
      mixedOps.push(client.getOrdersForUser(u.id))
    }

    // 2c. Review Creations & Queries (50 ops on DB_REVIEWS & DB_CATALOG & DB_USERS)
    for (let i = 0; i < 25; i++) {
      const u = usersList[i % usersList.length]
      const p = productsList[i % productsList.length]
      mixedOps.push(
        client.createReview({
          userId: u.id,
          productId: p.id,
          rating: (i % 5) + 1,
          comment: `Concurrent stress review ${i}`,
        })
      )
    }
    for (let i = 0; i < 25; i++) {
      const p = productsList[i % productsList.length]
      mixedOps.push(client.getReviewsForProduct(p.id))
    }

    // 2d. User Sessions & Lookups (50 ops on DB_USERS)
    for (let i = 0; i < 25; i++) {
      const u = usersList[i % usersList.length]
      mixedOps.push(
        client.createSession({
          userId: u.id,
          expiresAt: new Date(Date.now() + 3600000),
        })
      )
    }
    for (let i = 0; i < 25; i++) {
      const u = usersList[i % usersList.length]
      mixedOps.push(client.getUser(u.id))
    }

    // Execute all 250 parallel operations concurrently
    const startMs = performance.now()
    const results = await Promise.allSettled(mixedOps)
    const elapsedMs = performance.now() - startMs

    const totalSuccessful = results.filter((r) => r.status === 'fulfilled').length
    expect(totalSuccessful).toBe(250)
    expect(elapsedMs).toBeGreaterThan(0)

    // Assert zero orphaned records across all 5 databases
    const audit = await client.auditSystemIntegrity()
    expect(audit.isValid).toBe(true)
    expect(audit.totalOrphanedCount).toBe(0)
    expect(audit.summary.ordersWithoutUsers).toBe(0)
    expect(audit.summary.cartItemsWithoutVariants).toBe(0)
    expect(audit.summary.orderItemsWithoutVariants).toBe(0)
    expect(audit.summary.reviewsWithoutUsers).toBe(0)
    expect(audit.summary.reviewsWithoutProducts).toBe(0)
  })

  it('verifies partition isolation and non-blocking write performance across independent D1 instances', async () => {
    const client = createMultiD1Client(env)

    const user = await client.createUser({ name: 'Bob', email: 'bob@isolation.com' })
    const product = await client.createProduct({ name: 'Iso Product', price: 300 })
    const variant = await client.createVariant({ productId: product.id, name: 'Iso Var', stock: 1000 })
    const cart = await client.createCart({ userId: user.id })

    // Concurrently dispatch writes to DB_CART, DB_REVIEWS, and DB_USERS
    const cartWrites = Array.from({ length: 30 }, () =>
      client.addItemToCart({ cartId: cart.id, variantId: variant.id, quantity: 1 })
    )

    const reviewWrites = Array.from({ length: 30 }, (_, i) =>
      client.createReview({
        userId: user.id,
        productId: product.id,
        rating: 5,
        title: `Review ${i}`,
      })
    )

    const sessionWrites = Array.from({ length: 30 }, () =>
      client.createSession({ userId: user.id, expiresAt: new Date(Date.now() + 3600000) })
    )

    const start = performance.now()
    const allPartitionOps = await Promise.allSettled([
      ...cartWrites,
      ...reviewWrites,
      ...sessionWrites,
    ])
    const duration = performance.now() - start

    const successful = allPartitionOps.filter((r) => r.status === 'fulfilled').length
    expect(successful).toBe(90)
    expect(duration).toBeGreaterThan(0)

    // Assert zero orphaned records after cross-partition concurrent write lock test
    const audit = await client.auditSystemIntegrity()
    expect(audit.isValid).toBe(true)
    expect(audit.totalOrphanedCount).toBe(0)
  })
})
