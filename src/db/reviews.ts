import { eq, inArray } from 'drizzle-orm'
import { reviews, type Review, type ReviewWithDetails } from './schema/reviews'
import { users } from './schema/users'
import { ReferentialIntegrityError } from './errors'
import { generateId } from '../utils/ulid'
import type { MultiD1Client } from './client'

export interface CreateReviewData {
  id?: string
  userId: string
  productId: string
  rating: number
  title?: string | null
  comment?: string | null
}

export async function createReview(
  client: MultiD1Client,
  data: CreateReviewData
): Promise<Review> {
  const user = await client.getUser(data.userId)
  if (!user) {
    throw new ReferentialIntegrityError(`User with id '${data.userId}' does not exist`)
  }

  const product = await client.getProduct(data.productId)
  if (!product) {
    throw new ReferentialIntegrityError(`Product with id '${data.productId}' does not exist`)
  }

  const id = data.id ?? generateId('rev')
  const now = new Date()

  const newReview = {
    id,
    userId: data.userId,
    productId: data.productId,
    rating: data.rating,
    title: data.title ?? null,
    comment: data.comment ?? null,
    createdAt: now,
    updatedAt: now,
  }

  await client.db.reviews.insert(reviews).values(newReview)

  const created = await getReview(client, id)
  if (!created) {
    throw new Error(`Failed to retrieve created review ${id}`)
  }

  return created
}

export async function getReview(
  client: MultiD1Client,
  id: string
): Promise<Review | null> {
  const result = await client.db.reviews
    .select()
    .from(reviews)
    .where(eq(reviews.id, id))
    .get()

  return result ?? null
}

export async function getReviewsForProduct(
  client: MultiD1Client,
  productId: string
): Promise<ReviewWithDetails[]> {
  const productReviews = await client.db.reviews
    .select()
    .from(reviews)
    .where(eq(reviews.productId, productId))
    .all()

  if (productReviews.length === 0) {
    return []
  }

  const userIds = Array.from(new Set(productReviews.map((r) => r.userId)))

  const [productRecord, usersList] = await Promise.all([
    client.getProduct(productId),
    userIds.length > 0
      ? client.db.users
          .select()
          .from(users)
          .where(inArray(users.id, userIds))
          .all()
      : Promise.resolve([]),
  ])

  const userMap = new Map(usersList.map((u) => [u.id, u]))

  return productReviews.map((review) => ({
    ...review,
    user: userMap.get(review.userId) ?? null,
    product: productRecord ?? null,
  }))
}
