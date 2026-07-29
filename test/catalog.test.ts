import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import { createMultiD1Client, ReferentialIntegrityError, resetDatabases } from '../src/db'
import { generateId, generateProductId, generateVariantId, isValidId } from '../src/utils/ulid'

describe('Catalog Prefixed ULID Generator', () => {
  it('generates product and variant IDs with correct prefixes', () => {
    const productId = generateProductId()
    expect(productId).toMatch(/^prd_[0-9A-HJKMNP-TV-Z]{26}$/i)
    expect(isValidId(productId, 'prd')).toBe(true)

    const variantId = generateVariantId()
    expect(variantId).toMatch(/^var_[0-9A-HJKMNP-TV-Z]{26}$/i)
    expect(isValidId(variantId, 'var')).toBe(true)
  })
})

describe('Catalog & Product Variant Slice (MultiD1Client)', () => {
  beforeEach(async () => {
    await resetDatabases(env)
  })

  it('creates and retrieves a product', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({
      name: 'Mechanical Keyboard',
      description: 'Tactile Wireless Keyboard',
      price: 14999,
      sku: 'MK-100',
    })

    expect(product.id).toMatch(/^prd_/)
    expect(isValidId(product.id, 'prd')).toBe(true)
    expect(product.name).toBe('Mechanical Keyboard')
    expect(product.description).toBe('Tactile Wireless Keyboard')
    expect(product.price).toBe(14999)
    expect(product.sku).toBe('MK-100')
    expect(product.createdAt).toBeInstanceOf(Date)
    expect(product.updatedAt).toBeInstanceOf(Date)

    const retrieved = await client.getProduct(product.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved?.id).toBe(product.id)
    expect(retrieved?.name).toBe('Mechanical Keyboard')
  })

  it('returns null for non-existent product ID', async () => {
    const client = createMultiD1Client(env)
    const nonExistent = await client.getProduct('prd_nonexistent12345678901234')
    expect(nonExistent).toBeNull()
  })

  it('allows specifying custom prefixed product ID', async () => {
    const client = createMultiD1Client(env)
    const customId = generateId('prd')
    const product = await client.createProduct({
      id: customId,
      name: 'Custom Ergonomic Mouse',
      price: 5999,
    })

    expect(product.id).toBe(customId)
    const retrieved = await client.getProduct(customId)
    expect(retrieved?.name).toBe('Custom Ergonomic Mouse')
  })

  it('creates and retrieves a product variant', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({
      name: 'T-Shirt',
      price: 2500,
    })

    const variant = await client.createVariant({
      productId: product.id,
      name: 'Size L - Black',
      sku: 'TS-BLK-L',
      price: 2700,
      stock: 50,
    })

    expect(variant.id).toMatch(/^var_/)
    expect(isValidId(variant.id, 'var')).toBe(true)
    expect(variant.productId).toBe(product.id)
    expect(variant.name).toBe('Size L - Black')
    expect(variant.sku).toBe('TS-BLK-L')
    expect(variant.price).toBe(2700)
    expect(variant.stock).toBe(50)

    const retrieved = await client.getVariant(variant.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved?.id).toBe(variant.id)
    expect(retrieved?.productId).toBe(product.id)
  })

  it('retrieves product with all its variants via getProductWithVariants', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({
      name: 'Running Shoes',
      price: 8999,
    })

    const v1 = await client.createVariant({
      productId: product.id,
      name: 'Size 9',
      stock: 10,
    })

    const v2 = await client.createVariant({
      productId: product.id,
      name: 'Size 10',
      stock: 15,
    })

    const result = await client.getProductWithVariants(product.id)
    expect(result).not.toBeNull()
    expect(result?.id).toBe(product.id)
    expect(result?.name).toBe('Running Shoes')
    expect(result?.variants).toHaveLength(2)
    expect(result?.variants.map((v) => v.id)).toEqual(
      expect.arrayContaining([v1.id, v2.id])
    )
  })

  it('returns null for getProductWithVariants on non-existent product ID', async () => {
    const client = createMultiD1Client(env)
    const result = await client.getProductWithVariants('prd_nonexistent12345678901234')
    expect(result).toBeNull()
  })

  it('throws ReferentialIntegrityError when creating variant for non-existent product', async () => {
    const client = createMultiD1Client(env)
    const nonExistentProductId = generateId('prd')

    await expect(
      client.createVariant({
        productId: nonExistentProductId,
        name: 'Invalid Variant',
        stock: 5,
      })
    ).rejects.toThrow(ReferentialIntegrityError)
  })

  it('enforces SQLite foreign key ON DELETE CASCADE when a product is deleted', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({ name: 'Laptop', price: 99900 })
    const variant = await client.createVariant({ productId: product.id, name: '16GB RAM', stock: 10 })

    expect(await client.getVariant(variant.id)).not.toBeNull()

    await env.DB_CATALOG.prepare('DELETE FROM products WHERE id = ?').bind(product.id).run()

    expect(await client.getVariant(variant.id)).toBeNull()
  })
})
