import { env } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMultiD1Client,
  ReferentialIntegrityError,
  CREATE_USERS_TABLES_SQL,
  CREATE_CATALOG_TABLES_SQL,
  CREATE_REVIEWS_TABLES_SQL,
} from '../src/db'
import {
  generateId,
  generateReviewId,
  isValidId,
} from '../src/utils/ulid'

describe('Review Prefixed ULID Generator', () => {
  it('generates review IDs with correct prefix', () => {
    const reviewId = generateReviewId()
    expect(reviewId).toMatch(/^rev_[0-9A-HJKMNP-TV-Z]{26}$/i)
    expect(isValidId(reviewId, 'rev')).toBe(true)

    const genericReviewId = generateId('rev')
    expect(genericReviewId).toMatch(/^rev_[0-9A-HJKMNP-TV-Z]{26}$/i)
    expect(isValidId(genericReviewId, 'rev')).toBe(true)
  })
})

describe('Reviews Database & Cross-DB Joins (MultiD1Client)', () => {
  beforeEach(async () => {
    for (const stmt of CREATE_USERS_TABLES_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      await env.DB_USERS.prepare(stmt).run()
    }
    for (const stmt of CREATE_CATALOG_TABLES_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      await env.DB_CATALOG.prepare(stmt).run()
    }
    for (const stmt of CREATE_REVIEWS_TABLES_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      await env.DB_REVIEWS.prepare(stmt).run()
    }
  })

  it('creates and retrieves a product review', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({ email: 'reviewer@example.com', name: 'Alice Smith' })
    const product = await client.createProduct({ name: 'Wireless Headphones', price: 9999 })

    const review = await client.createReview({
      userId: user.id,
      productId: product.id,
      rating: 5,
      title: 'Amazing sound',
      comment: 'Great battery life and clear sound quality.',
    })

    expect(review.id).toMatch(/^rev_/)
    expect(isValidId(review.id, 'rev')).toBe(true)
    expect(review.userId).toBe(user.id)
    expect(review.productId).toBe(product.id)
    expect(review.rating).toBe(5)
    expect(review.title).toBe('Amazing sound')
    expect(review.comment).toBe('Great battery life and clear sound quality.')
    expect(review.createdAt).toBeInstanceOf(Date)
    expect(review.updatedAt).toBeInstanceOf(Date)

    const retrieved = await client.getReview(review.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved?.id).toBe(review.id)
    expect(retrieved?.title).toBe('Amazing sound')
  })

  it('allows specifying custom prefixed review ID', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({ email: 'user2@example.com', name: 'Bob' })
    const product = await client.createProduct({ name: 'USB-C Cable', price: 1200 })

    const customId = generateReviewId()
    const review = await client.createReview({
      id: customId,
      userId: user.id,
      productId: product.id,
      rating: 4,
      comment: 'Good cable',
    })

    expect(review.id).toBe(customId)
  })

  it('throws ReferentialIntegrityError when user_id does not exist', async () => {
    const client = createMultiD1Client(env)
    const product = await client.createProduct({ name: 'Gaming Mouse', price: 4999 })

    const nonExistentUserId = generateId('usr')

    await expect(
      client.createReview({
        userId: nonExistentUserId,
        productId: product.id,
        rating: 4,
        comment: 'Nice mouse',
      })
    ).rejects.toThrow(ReferentialIntegrityError)

    await expect(
      client.createReview({
        userId: nonExistentUserId,
        productId: product.id,
        rating: 4,
      })
    ).rejects.toThrow(`User with id '${nonExistentUserId}' does not exist`)
  })

  it('throws ReferentialIntegrityError when product_id does not exist', async () => {
    const client = createMultiD1Client(env)
    const user = await client.createUser({ email: 'user3@example.com', name: 'Charlie' })

    const nonExistentProductId = generateId('prd')

    await expect(
      client.createReview({
        userId: user.id,
        productId: nonExistentProductId,
        rating: 3,
        comment: 'Unknown product',
      })
    ).rejects.toThrow(ReferentialIntegrityError)

    await expect(
      client.createReview({
        userId: user.id,
        productId: nonExistentProductId,
        rating: 3,
      })
    ).rejects.toThrow(`Product with id '${nonExistentProductId}' does not exist`)
  })

  it('queries stitched reviews for product using getReviewsForProduct', async () => {
    const client = createMultiD1Client(env)

    const alice = await client.createUser({ email: 'alice@example.com', name: 'Alice' })
    const bob = await client.createUser({ email: 'bob@example.com', name: 'Bob' })

    const keyboard = await client.createProduct({ name: 'Ergonomic Keyboard', price: 12999 })
    const monitor = await client.createProduct({ name: '4K Monitor', price: 34999 })

    await client.createReview({
      userId: alice.id,
      productId: keyboard.id,
      rating: 5,
      title: 'Best keyboard',
      comment: 'Super comfortable for typing.',
    })

    await client.createReview({
      userId: bob.id,
      productId: keyboard.id,
      rating: 4,
      title: 'Solid build',
      comment: 'Very quiet switches.',
    })

    await client.createReview({
      userId: alice.id,
      productId: monitor.id,
      rating: 5,
      title: 'Stunning colors',
      comment: 'Crisp text rendering.',
    })

    const keyboardReviews = await client.getReviewsForProduct(keyboard.id)
    expect(keyboardReviews.length).toBe(2)

    const aliceReview = keyboardReviews.find((r) => r.userId === alice.id)
    expect(aliceReview).toBeDefined()
    expect(aliceReview?.user?.name).toBe('Alice')
    expect(aliceReview?.product?.name).toBe('Ergonomic Keyboard')
    expect(aliceReview?.rating).toBe(5)
    expect(aliceReview?.comment).toBe('Super comfortable for typing.')

    const bobReview = keyboardReviews.find((r) => r.userId === bob.id)
    expect(bobReview).toBeDefined()
    expect(bobReview?.user?.name).toBe('Bob')
    expect(bobReview?.product?.name).toBe('Ergonomic Keyboard')
    expect(bobReview?.rating).toBe(4)

    const monitorReviews = await client.getReviewsForProduct(monitor.id)
    expect(monitorReviews.length).toBe(1)
    expect(monitorReviews[0].user?.name).toBe('Alice')
    expect(monitorReviews[0].product?.name).toBe('4K Monitor')

    const nonExistentReviews = await client.getReviewsForProduct('prd_nonexistent')
    expect(nonExistentReviews).toEqual([])
  })
})
