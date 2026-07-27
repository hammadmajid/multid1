import { eq, inArray } from 'drizzle-orm'
import {
  orders,
  orderItems,
  type Order,
  type OrderItem,
  type OrderWithItems,
  type OrderDetails,
  type OrderItemDetail,
} from './schema/orders'
import { productVariants } from './schema/catalog'
import { ReferentialIntegrityError } from './errors'
import { generateId } from '../utils/ulid'
import type { MultiD1Client } from './client'

export async function checkoutCartToOrder(
  client: MultiD1Client,
  cartIdOrData: string | { cartId: string; userId?: string },
  optionalUserId?: string
): Promise<OrderWithItems> {
  const cartId = typeof cartIdOrData === 'string' ? cartIdOrData : cartIdOrData.cartId
  const userId = typeof cartIdOrData === 'string' ? optionalUserId : (cartIdOrData.userId ?? optionalUserId)

  const cart = await client.getCartWithItems(cartId)
  if (!cart) {
    throw new ReferentialIntegrityError(`Cart with id '${cartId}' does not exist`)
  }

  if (cart.items.length === 0) {
    throw new Error(`Cart '${cartId}' is empty`)
  }

  const finalUserId = userId ?? cart.userId
  if (!finalUserId) {
    throw new ReferentialIntegrityError('User ID is required for checkout')
  }

  const user = await client.getUser(finalUserId)
  if (!user) {
    throw new ReferentialIntegrityError(`User with id '${finalUserId}' does not exist`)
  }

  let totalAmount = 0
  const itemsToInsert: Array<{ variantId: string; quantity: number; price: number }> = []

  for (const item of cart.items) {
    const variant = await client.getVariant(item.variantId)
    if (!variant) {
      throw new ReferentialIntegrityError(`Product variant with id '${item.variantId}' does not exist`)
    }

    if (variant.stock < item.quantity) {
      throw new Error(`Insufficient stock for variant '${item.variantId}'`)
    }

    let unitPrice = variant.price
    if (unitPrice === null || unitPrice === undefined) {
      const product = await client.getProduct(variant.productId)
      unitPrice = product?.price ?? 0
    }

    totalAmount += unitPrice * item.quantity
    itemsToInsert.push({
      variantId: item.variantId,
      quantity: item.quantity,
      price: unitPrice,
    })
  }

  const orderId = generateId('ord')
  const now = new Date()

  await client.db.orders.insert(orders).values({
    id: orderId,
    userId: finalUserId,
    status: 'pending',
    totalAmount,
    createdAt: now,
    updatedAt: now,
  })

  const orderItemsToInsert: OrderItem[] = itemsToInsert.map((item) => ({
    id: generateId('ori'),
    orderId,
    variantId: item.variantId,
    quantity: item.quantity,
    price: item.price,
    createdAt: now,
    updatedAt: now,
  }))

  await client.db.orders.insert(orderItems).values(orderItemsToInsert)
  await client.clearCart(cartId)

  return {
    id: orderId,
    userId: finalUserId,
    status: 'pending',
    totalAmount,
    createdAt: now,
    updatedAt: now,
    items: orderItemsToInsert,
  }
}

export async function getOrderDetails(
  client: MultiD1Client,
  orderId: string
): Promise<OrderDetails | null> {
  const order = await client.db.orders
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .get()

  if (!order) return null

  const itemsList = await client.db.orders
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all()

  const variantIds = Array.from(new Set(itemsList.map((item) => item.variantId)))

  const [userRecord, variantList] = await Promise.all([
    client.getUser(order.userId),
    variantIds.length > 0
      ? client.db.catalog
          .select()
          .from(productVariants)
          .where(inArray(productVariants.id, variantIds))
          .all()
      : Promise.resolve([]),
  ])

  const variantMap = new Map(variantList.map((v) => [v.id, v]))
  const itemDetails: OrderItemDetail[] = itemsList.map((item) => ({
    ...item,
    variant: variantMap.get(item.variantId) ?? null,
  }))

  return {
    ...order,
    user: userRecord ?? null,
    items: itemDetails,
  }
}

export async function getOrdersForUser(
  client: MultiD1Client,
  userId: string
): Promise<OrderWithItems[]> {
  const userOrders = await client.db.orders
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .all()

  if (userOrders.length === 0) return []

  const orderIds = userOrders.map((o) => o.id)
  const allItems = await client.db.orders
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .all()

  const itemsByOrder = new Map<string, OrderItem[]>()
  for (const item of allItems) {
    const list = itemsByOrder.get(item.orderId) ?? []
    list.push(item)
    itemsByOrder.set(item.orderId, list)
  }

  return userOrders.map((order) => ({
    ...order,
    items: itemsByOrder.get(order.id) ?? [],
  }))
}

export async function getOrder(
  client: MultiD1Client,
  orderId: string
): Promise<OrderWithItems | null> {
  const order = await client.db.orders
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .get()

  if (!order) return null

  const items = await client.db.orders
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all()

  return {
    ...order,
    items,
  }
}

export async function createOrder(
  client: MultiD1Client,
  data: {
    id?: string
    userId: string
    items: Array<{ variantId: string; quantity: number; price: number }>
    status?: string
  }
): Promise<OrderWithItems> {
  const user = await client.getUser(data.userId)
  if (!user) {
    throw new ReferentialIntegrityError(`User with id '${data.userId}' does not exist`)
  }

  for (const item of data.items) {
    const variant = await client.getVariant(item.variantId)
    if (!variant) {
      throw new ReferentialIntegrityError(`Product variant with id '${item.variantId}' does not exist`)
    }
  }

  const orderId = data.id ?? generateId('ord')
  const now = new Date()
  const totalAmount = data.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const status = data.status ?? 'pending'

  await client.db.orders.insert(orders).values({
    id: orderId,
    userId: data.userId,
    status,
    totalAmount,
    createdAt: now,
    updatedAt: now,
  })

  const orderItemsToInsert: OrderItem[] = data.items.map((item) => ({
    id: generateId('ori'),
    orderId,
    variantId: item.variantId,
    quantity: item.quantity,
    price: item.price,
    createdAt: now,
    updatedAt: now,
  }))

  await client.db.orders.insert(orderItems).values(orderItemsToInsert)

  return {
    id: orderId,
    userId: data.userId,
    status,
    totalAmount,
    createdAt: now,
    updatedAt: now,
    items: orderItemsToInsert,
  }
}
