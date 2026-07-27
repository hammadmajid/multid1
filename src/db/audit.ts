import { eq } from 'drizzle-orm'
import type { MultiD1Client } from './client'
import { users, userSessions } from './schema/users'
import { products, productVariants } from './schema/catalog'
import { carts, cartItems } from './schema/cart'
import { orders, orderItems } from './schema/orders'
import { reviews } from './schema/reviews'

export interface OrphanedRecord {
  table: string
  id: string
  field: string
  referencedTable: string
  referencedId: string
  details?: string
}

export interface AuditSummary {
  ordersWithoutUsers: number
  cartItemsWithoutVariants: number
  orderItemsWithoutVariants: number
  reviewsWithoutUsers: number
  reviewsWithoutProducts: number
  sessionsWithoutUsers: number
  variantsWithoutProducts: number
  cartsWithoutUsers: number
  cartItemsWithoutCarts: number
  orderItemsWithoutOrders: number
}

export interface AuditResult {
  isValid: boolean
  totalOrphanedCount: number
  summary: AuditSummary
  orphanedRecords: OrphanedRecord[]
}

/**
 * Scans across all 5 D1 database partitions (DB_USERS, DB_CART, DB_CATALOG, DB_ORDERS, DB_REVIEWS)
 * to detect orphaned records and foreign key violations across database boundaries.
 */
export async function auditSystemIntegrity(client: MultiD1Client): Promise<AuditResult> {
  const [
    allUsers,
    allSessions,
    allProducts,
    allVariants,
    allCarts,
    allCartItems,
    allOrders,
    allOrderItems,
    allReviews,
  ] = await Promise.all([
    client.db.users.select({ id: users.id }).from(users),
    client.db.users.select({ id: userSessions.id, userId: userSessions.userId }).from(userSessions),
    client.db.catalog.select({ id: products.id }).from(products),
    client.db.catalog.select({ id: productVariants.id, productId: productVariants.productId }).from(productVariants),
    client.db.cart.select({ id: carts.id, userId: carts.userId }).from(carts),
    client.db.cart.select({ id: cartItems.id, cartId: cartItems.cartId, variantId: cartItems.variantId }).from(cartItems),
    client.db.orders.select({ id: orders.id, userId: orders.userId }).from(orders),
    client.db.orders.select({ id: orderItems.id, orderId: orderItems.orderId, variantId: orderItems.variantId }).from(orderItems),
    client.db.reviews.select({ id: reviews.id, userId: reviews.userId, productId: reviews.productId }).from(reviews),
  ])

  const userIds = new Set(allUsers.map((u) => u.id))
  const productIds = new Set(allProducts.map((p) => p.id))
  const variantIds = new Set(allVariants.map((v) => v.id))
  const cartIds = new Set(allCarts.map((c) => c.id))
  const orderIds = new Set(allOrders.map((o) => o.id))

  const orphanedRecords: OrphanedRecord[] = []

  // 1. Orders without valid Users
  let ordersWithoutUsersCount = 0
  for (const o of allOrders) {
    if (!userIds.has(o.userId)) {
      ordersWithoutUsersCount++
      orphanedRecords.push({
        table: 'orders',
        id: o.id,
        field: 'user_id',
        referencedTable: 'users',
        referencedId: o.userId,
        details: `Order '${o.id}' references non-existent user '${o.userId}'`,
      })
    }
  }

  // 2. Cart Items without valid Product Variants
  let cartItemsWithoutVariantsCount = 0
  for (const ci of allCartItems) {
    if (!variantIds.has(ci.variantId)) {
      cartItemsWithoutVariantsCount++
      orphanedRecords.push({
        table: 'cart_items',
        id: ci.id,
        field: 'variant_id',
        referencedTable: 'product_variants',
        referencedId: ci.variantId,
        details: `CartItem '${ci.id}' references non-existent variant '${ci.variantId}'`,
      })
    }
  }

  // 3. Order Items without valid Product Variants
  let orderItemsWithoutVariantsCount = 0
  for (const oi of allOrderItems) {
    if (!variantIds.has(oi.variantId)) {
      orderItemsWithoutVariantsCount++
      orphanedRecords.push({
        table: 'order_items',
        id: oi.id,
        field: 'variant_id',
        referencedTable: 'product_variants',
        referencedId: oi.variantId,
        details: `OrderItem '${oi.id}' references non-existent variant '${oi.variantId}'`,
      })
    }
  }

  // 4 & 5. Reviews without valid Users or Products
  let reviewsWithoutUsersCount = 0
  let reviewsWithoutProductsCount = 0
  for (const r of allReviews) {
    if (!userIds.has(r.userId)) {
      reviewsWithoutUsersCount++
      orphanedRecords.push({
        table: 'reviews',
        id: r.id,
        field: 'user_id',
        referencedTable: 'users',
        referencedId: r.userId,
        details: `Review '${r.id}' references non-existent user '${r.userId}'`,
      })
    }
    if (!productIds.has(r.productId)) {
      reviewsWithoutProductsCount++
      orphanedRecords.push({
        table: 'reviews',
        id: r.id,
        field: 'product_id',
        referencedTable: 'products',
        referencedId: r.productId,
        details: `Review '${r.id}' references non-existent product '${r.productId}'`,
      })
    }
  }

  // 6. User Sessions without valid Users
  let sessionsWithoutUsersCount = 0
  for (const s of allSessions) {
    if (!userIds.has(s.userId)) {
      sessionsWithoutUsersCount++
      orphanedRecords.push({
        table: 'user_sessions',
        id: s.id,
        field: 'user_id',
        referencedTable: 'users',
        referencedId: s.userId,
        details: `Session '${s.id}' references non-existent user '${s.userId}'`,
      })
    }
  }

  // 7. Product Variants without valid Products
  let variantsWithoutProductsCount = 0
  for (const v of allVariants) {
    if (!productIds.has(v.productId)) {
      variantsWithoutProductsCount++
      orphanedRecords.push({
        table: 'product_variants',
        id: v.id,
        field: 'product_id',
        referencedTable: 'products',
        referencedId: v.productId,
        details: `ProductVariant '${v.id}' references non-existent product '${v.productId}'`,
      })
    }
  }

  // 8. Carts without valid Users
  let cartsWithoutUsersCount = 0
  for (const c of allCarts) {
    if (c.userId !== null && !userIds.has(c.userId)) {
      cartsWithoutUsersCount++
      orphanedRecords.push({
        table: 'carts',
        id: c.id,
        field: 'user_id',
        referencedTable: 'users',
        referencedId: c.userId,
        details: `Cart '${c.id}' references non-existent user '${c.userId}'`,
      })
    }
  }

  // 9. Cart Items without valid Carts
  let cartItemsWithoutCartsCount = 0
  for (const ci of allCartItems) {
    if (!cartIds.has(ci.cartId)) {
      cartItemsWithoutCartsCount++
      orphanedRecords.push({
        table: 'cart_items',
        id: ci.id,
        field: 'cart_id',
        referencedTable: 'carts',
        referencedId: ci.cartId,
        details: `CartItem '${ci.id}' references non-existent cart '${ci.cartId}'`,
      })
    }
  }

  // 10. Order Items without valid Orders
  let orderItemsWithoutOrdersCount = 0
  for (const oi of allOrderItems) {
    if (!orderIds.has(oi.orderId)) {
      orderItemsWithoutOrdersCount++
      orphanedRecords.push({
        table: 'order_items',
        id: oi.id,
        field: 'order_id',
        referencedTable: 'orders',
        referencedId: oi.orderId,
        details: `OrderItem '${oi.id}' references non-existent order '${oi.orderId}'`,
      })
    }
  }

  const summary: AuditSummary = {
    ordersWithoutUsers: ordersWithoutUsersCount,
    cartItemsWithoutVariants: cartItemsWithoutVariantsCount,
    orderItemsWithoutVariants: orderItemsWithoutVariantsCount,
    reviewsWithoutUsers: reviewsWithoutUsersCount,
    reviewsWithoutProducts: reviewsWithoutProductsCount,
    sessionsWithoutUsers: sessionsWithoutUsersCount,
    variantsWithoutProducts: variantsWithoutProductsCount,
    cartsWithoutUsers: cartsWithoutUsersCount,
    cartItemsWithoutCarts: cartItemsWithoutCartsCount,
    orderItemsWithoutOrders: orderItemsWithoutOrdersCount,
  }

  const totalOrphanedCount = orphanedRecords.length

  return {
    isValid: totalOrphanedCount === 0,
    totalOrphanedCount,
    summary,
    orphanedRecords,
  }
}
