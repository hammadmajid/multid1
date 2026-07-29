import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMultiD1Client,
  ReferentialIntegrityError,
  resetDatabases,
} from '../src/db'
import {
  generateCartId,
  generateCartItemId,
  isValidId,
} from '../src/utils/ulid'

describe('Cart Prefixed ULID Generator', () => {
  it('generates cart and cart item IDs with correct prefixes', () => {
    const cartId = generateCartId()
    expect(cartId).toMatch(/^crt_[0-9A-HJKMNP-TV-Z]{26}$/i)
    expect(isValidId(cartId, 'crt')).toBe(true)

    const cartItemId = generateCartItemId()
    expect(cartItemId).toMatch(/^cit_[0-9A-HJKMNP-TV-Z]{26}$/i)
    expect(isValidId(cartItemId, 'cit')).toBe(true)
  })
})

describe('Cart & Concurrent Operations Slice (MultiD1Client)', () => {
  beforeEach(async () => {
    await resetDatabases(env)
  })

  it('creates an anonymous cart without user_id', async () => {
    const client = createMultiD1Client(env)
    const cart = await client.createCart()

    expect(cart.id).toMatch(/^crt_/)
    expect(isValidId(cart.id, 'crt')).toBe(true)
    expect(cart.userId).toBeNull()
    expect(cart.createdAt).toBeInstanceOf(Date)
    expect(cart.updatedAt).toBeInstanceOf(Date)
  })

  it('creates a cart associated with a valid user', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({ email: 'cartuser@example.com', name: 'Cart User' })
    const cart = await client.createCart({ userId: user.id })

    expect(cart.userId).toBe(user.id)
  })

  it('throws ReferentialIntegrityError when creating a cart for non-existent user', async () => {
    const client = createMultiD1Client(env)
    await expect(client.createCart({ userId: 'usr_nonexistent12345678901234' })).rejects.toThrow(
      ReferentialIntegrityError
    )
  })

  it('adds items to cart and updates quantity when adding same variant', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({ name: 'Gadget', price: 999 })
    const variant = await client.createVariant({ productId: product.id, name: 'Red Gadget' })
    const cart = await client.createCart()

    const item1 = await client.addItemToCart({ cartId: cart.id, variantId: variant.id, quantity: 2 })
    expect(item1.id).toMatch(/^cit_/)
    expect(isValidId(item1.id, 'cit')).toBe(true)
    expect(item1.cartId).toBe(cart.id)
    expect(item1.variantId).toBe(variant.id)
    expect(item1.quantity).toBe(2)

    const item2 = await client.addItemToCart({ cartId: cart.id, variantId: variant.id, quantity: 3 })
    expect(item2.id).toBe(item1.id)
    expect(item2.quantity).toBe(5)
  })

  it('throws ReferentialIntegrityError when adding non-existent variant to cart', async () => {
    const client = createMultiD1Client(env)
    const cart = await client.createCart()
    await expect(
      client.addItemToCart({ cartId: cart.id, variantId: 'var_nonexistent12345678901234' })
    ).rejects.toThrow(ReferentialIntegrityError)
  })

  it('throws ReferentialIntegrityError when adding item to non-existent cart', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({ name: 'Gadget', price: 999 })
    const variant = await client.createVariant({ productId: product.id, name: 'Blue Gadget' })
    await expect(
      client.addItemToCart({ cartId: 'crt_nonexistent12345678901234', variantId: variant.id })
    ).rejects.toThrow(ReferentialIntegrityError)
  })

  it('retrieves cart with items using getCartWithItems', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({ name: 'Phone', price: 69900 })
    const var1 = await client.createVariant({ productId: product.id, name: '128GB' })
    const var2 = await client.createVariant({ productId: product.id, name: '256GB' })

    const cart = await client.createCart()
    await client.addItemToCart({ cartId: cart.id, variantId: var1.id, quantity: 1 })
    await client.addItemToCart({ cartId: cart.id, variantId: var2.id, quantity: 2 })

    const cartWithItems = await client.getCartWithItems(cart.id)
    expect(cartWithItems).not.toBeNull()
    expect(cartWithItems?.id).toBe(cart.id)
    expect(cartWithItems?.items.length).toBe(2)
  })

  it('returns null for getCartWithItems on non-existent cart ID', async () => {
    const client = createMultiD1Client(env)
    const cartWithItems = await client.getCartWithItems('crt_nonexistent12345678901234')
    expect(cartWithItems).toBeNull()
  })

  it('clears cart items using clearCart', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({ name: 'Laptop', price: 129900 })
    const variant = await client.createVariant({ productId: product.id, name: '16GB RAM' })

    const cart = await client.createCart()
    await client.addItemToCart({ cartId: cart.id, variantId: variant.id, quantity: 1 })

    let cartWithItems = await client.getCartWithItems(cart.id)
    expect(cartWithItems?.items.length).toBe(1)

    await client.clearCart(cart.id)

    cartWithItems = await client.getCartWithItems(cart.id)
    expect(cartWithItems?.items.length).toBe(0)
  })

  it('throws ReferentialIntegrityError when clearing non-existent cart', async () => {
    const client = createMultiD1Client(env)
    await expect(client.clearCart('crt_nonexistent12345678901234')).rejects.toThrow(
      ReferentialIntegrityError
    )
  })

  it('handles high-concurrency parallel cart operations across multiple carts and variants', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({ name: 'Bulk Product', price: 100 })
    const variants = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        client.createVariant({ productId: product.id, name: `Variant ${i + 1}` })
      )
    )

    const cartsList = await Promise.all(Array.from({ length: 10 }, () => client.createCart()))

    // Dispatch 50 concurrent addItemToCart calls across carts and variants
    const operations = []
    for (let i = 0; i < 50; i++) {
      const targetCart = cartsList[i % cartsList.length]
      const targetVariant = variants[(i * 3) % variants.length]
      operations.push(
        client.addItemToCart({
          cartId: targetCart.id,
          variantId: targetVariant.id,
          quantity: 1,
        })
      )
    }

    await Promise.all(operations)

    // Verify each cart has items populated correctly without database corruption
    for (const c of cartsList) {
      const cartWithItems = await client.getCartWithItems(c.id)
      expect(cartWithItems).not.toBeNull()
      expect(cartWithItems?.items.length).toBeGreaterThan(0)
      const totalQuantity = cartWithItems!.items.reduce((sum, item) => sum + item.quantity, 0)
      expect(totalQuantity).toBe(5)
    }
  })
})
