import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMultiD1Client,
  ReferentialIntegrityError,
  CREATE_USERS_TABLES_SQL,
  CREATE_CATALOG_TABLES_SQL,
  CREATE_CART_TABLES_SQL,
  CREATE_ORDERS_TABLES_SQL,
} from '../src/db'
import {
  generateOrderId,
  generateOrderItemId,
  isValidId,
} from '../src/utils/ulid'

describe('Order & Order Item Prefixed ULID Generator', () => {
  it('generates order and order item IDs with correct prefixes', () => {
    const orderId = generateOrderId()
    expect(orderId).toMatch(/^ord_[0-9A-HJKMNP-TV-Z]{26}$/i)
    expect(isValidId(orderId, 'ord')).toBe(true)

    const orderItemId = generateOrderItemId()
    expect(orderItemId).toMatch(/^ori_[0-9A-HJKMNP-TV-Z]{26}$/i)
    expect(isValidId(orderItemId, 'ori')).toBe(true)
  })
})

describe('Orders Database, Checkout Workflow & Cross-DB Joins (MultiD1Client)', () => {
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
  })

  it('performs checkoutCartToOrder transaction and clears cart', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({ email: 'buyer@example.com', name: 'Buyer' })
    const product = await client.createProduct({ name: 'Mechanical Keyboard', price: 15000 })
    const v1 = await client.createVariant({ productId: product.id, name: 'Red Switch', price: 15000, stock: 10 })
    const v2 = await client.createVariant({ productId: product.id, name: 'Blue Switch', price: 16000, stock: 5 })

    const cart = await client.createCart({ userId: user.id })
    await client.addItemToCart({ cartId: cart.id, variantId: v1.id, quantity: 2 })
    await client.addItemToCart({ cartId: cart.id, variantId: v2.id, quantity: 1 })

    const order = await client.checkoutCartToOrder(cart.id)

    expect(order.id).toMatch(/^ord_/)
    expect(isValidId(order.id, 'ord')).toBe(true)
    expect(order.userId).toBe(user.id)
    expect(order.status).toBe('pending')
    expect(order.totalAmount).toBe(15000 * 2 + 16000 * 1) // 46000
    expect(order.items.length).toBe(2)

    for (const item of order.items) {
      expect(item.id).toMatch(/^ori_/)
      expect(isValidId(item.id, 'ori')).toBe(true)
      expect(item.orderId).toBe(order.id)
    }

    // Verify cart was cleared after checkout
    const cartAfter = await client.getCartWithItems(cart.id)
    expect(cartAfter?.items.length).toBe(0)
  })

  it('throws ReferentialIntegrityError for non-existent cart on checkout', async () => {
    const client = createMultiD1Client(env)
    await expect(client.checkoutCartToOrder('crt_nonexistent12345678901234')).rejects.toThrow(
      ReferentialIntegrityError
    )
  })

  it('throws Error when checking out an empty cart', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({ email: 'empty@example.com', name: 'Empty' })
    const cart = await client.createCart({ userId: user.id })
    await expect(client.checkoutCartToOrder(cart.id)).rejects.toThrow('empty')
  })

  it('throws ReferentialIntegrityError when checking out without a valid user', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({ name: 'Mouse', price: 2999 })
    const variant = await client.createVariant({ productId: product.id, name: 'Wireless', stock: 10 })
    const cart = await client.createCart() // anonymous cart without user_id
    await client.addItemToCart({ cartId: cart.id, variantId: variant.id, quantity: 1 })

    await expect(client.checkoutCartToOrder(cart.id)).rejects.toThrow(ReferentialIntegrityError)
  })

  it('throws Error when requested item quantity exceeds stock', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({ email: 'stock@example.com', name: 'Stock Test' })
    const product = await client.createProduct({ name: 'Limited Edition', price: 99900 })
    const variant = await client.createVariant({ productId: product.id, name: 'Gold', stock: 1 })
    const cart = await client.createCart({ userId: user.id })
    await client.addItemToCart({ cartId: cart.id, variantId: variant.id, quantity: 5 })

    await expect(client.checkoutCartToOrder(cart.id)).rejects.toThrow('Insufficient stock')
  })

  it('performs getOrderDetails application-layer cross-DB join', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({ email: 'stitch@example.com', name: 'Stitched User' })
    const product = await client.createProduct({ name: 'Monitor', price: 30000 })
    const v1 = await client.createVariant({ productId: product.id, name: '4K 27"', price: 35000, stock: 20 })
    const v2 = await client.createVariant({ productId: product.id, name: '1080p 24"', price: 15000, stock: 20 })

    const cart = await client.createCart({ userId: user.id })
    await client.addItemToCart({ cartId: cart.id, variantId: v1.id, quantity: 1 })
    await client.addItemToCart({ cartId: cart.id, variantId: v2.id, quantity: 2 })

    const order = await client.checkoutCartToOrder(cart.id)
    const details = await client.getOrderDetails(order.id)

    expect(details).not.toBeNull()
    expect(details?.id).toBe(order.id)
    expect(details?.user).not.toBeNull()
    expect(details?.user?.id).toBe(user.id)
    expect(details?.user?.email).toBe('stitch@example.com')
    expect(details?.items.length).toBe(2)

    const item1 = details?.items.find((i) => i.variantId === v1.id)
    expect(item1?.variant).not.toBeNull()
    expect(item1?.variant?.name).toBe('4K 27"')
    expect(item1?.variant?.price).toBe(35000)

    const item2 = details?.items.find((i) => i.variantId === v2.id)
    expect(item2?.variant).not.toBeNull()
    expect(item2?.variant?.name).toBe('1080p 24"')
    expect(item2?.variant?.price).toBe(15000)
  })

  it('returns null for getOrderDetails with non-existent order ID', async () => {
    const client = createMultiD1Client(env)
    const details = await client.getOrderDetails('ord_nonexistent12345678901234')
    expect(details).toBeNull()
  })

  it('retrieves all orders for a user using getOrdersForUser', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({ email: 'multiorder@example.com', name: 'Multi Order' })
    const product = await client.createProduct({ name: 'Book', price: 1999 })
    const variant = await client.createVariant({ productId: product.id, name: 'Hardcover', stock: 100 })

    const cart1 = await client.createCart({ userId: user.id })
    await client.addItemToCart({ cartId: cart1.id, variantId: variant.id, quantity: 1 })
    await client.checkoutCartToOrder(cart1.id)

    const cart2 = await client.createCart({ userId: user.id })
    await client.addItemToCart({ cartId: cart2.id, variantId: variant.id, quantity: 3 })
    await client.checkoutCartToOrder(cart2.id)

    const userOrders = await client.getOrdersForUser(user.id)
    expect(userOrders.length).toBe(2)
    expect(userOrders[0].items.length).toBe(1)
    expect(userOrders[1].items.length).toBe(1)
  })
})
