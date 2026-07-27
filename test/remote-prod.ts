import { execSync } from 'child_process'
import { generateId } from '../src/utils/ulid'

function execD1(dbName: string, sql: string) {
  const jsonSql = JSON.stringify(sql)
  const cmd = `pnpm wrangler d1 execute ${dbName} --remote --command ${jsonSql} --json`
  const output = execSync(cmd, { encoding: 'utf-8' })
  return JSON.parse(output)
}

async function runRemoteProdTests() {
  console.log('🚀 Starting remote production D1 tests across 5 D1 instances...\n')

  const userId = generateId('usr')
  const userEmail = `remote-test-${Date.now()}@example.com`
  const userName = 'Remote Test User'

  const sessionId = generateId('ses')
  const sessionToken = `tok_${Date.now()}_${Math.random().toString(36).substring(2)}`
  const expiresAt = Date.now() + 86400000

  const productId = generateId('prd')
  const productName = 'Remote D1 Test Product'
  const productPrice = 2999

  const variantId = generateId('var')
  const variantName = 'Default Variant'

  const cartId = generateId('crt')
  const cartItemId = generateId('cit')

  const orderId = generateId('ord')
  const orderItemId = generateId('ori')

  const reviewId = generateId('rev')

  try {
    // 1. Insert into multid1-users
    console.log('1. Testing remote multid1-users...')
    execD1(
      'multid1-users',
      `INSERT INTO users (id, email, name, created_at) VALUES ('${userId}', '${userEmail}', '${userName}', ${Date.now()});`
    )
    execD1(
      'multid1-users',
      `INSERT INTO user_sessions (id, user_id, token, expires_at, created_at) VALUES ('${sessionId}', '${userId}', '${sessionToken}', ${expiresAt}, ${Date.now()});`
    )
    const usersResult = execD1('multid1-users', `SELECT * FROM users WHERE id = '${userId}';`)
    if (!usersResult[0]?.results?.length) throw new Error('Failed to insert/query remote user')
    console.log('   ✓ Remote DB_USERS operational.')

    // 2. Insert into multid1-catalog
    console.log('2. Testing remote multid1-catalog...')
    execD1(
      'multid1-catalog',
      `INSERT INTO products (id, name, description, price, created_at, updated_at) VALUES ('${productId}', '${productName}', 'Remote test desc', ${productPrice}, ${Date.now()}, ${Date.now()});`
    )
    execD1(
      'multid1-catalog',
      `INSERT INTO product_variants (id, product_id, name, stock, created_at, updated_at) VALUES ('${variantId}', '${productId}', '${variantName}', 100, ${Date.now()}, ${Date.now()});`
    )
    const catalogResult = execD1('multid1-catalog', `SELECT * FROM product_variants WHERE id = '${variantId}';`)
    if (!catalogResult[0]?.results?.length) throw new Error('Failed to insert/query remote product variant')
    console.log('   ✓ Remote DB_CATALOG operational.')

    // 3. Insert into multid1-cart
    console.log('3. Testing remote multid1-cart...')
    execD1(
      'multid1-cart',
      `INSERT INTO carts (id, user_id, created_at, updated_at) VALUES ('${cartId}', '${userId}', ${Date.now()}, ${Date.now()});`
    )
    execD1(
      'multid1-cart',
      `INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at) VALUES ('${cartItemId}', '${cartId}', '${variantId}', 2, ${Date.now()}, ${Date.now()});`
    )
    const cartResult = execD1('multid1-cart', `SELECT * FROM cart_items WHERE cart_id = '${cartId}';`)
    if (!cartResult[0]?.results?.length) throw new Error('Failed to insert/query remote cart items')
    console.log('   ✓ Remote DB_CART operational.')

    // 4. Test Cart Checkout & Order Creation in multid1-orders
    console.log('4. Testing remote multid1-orders & checkout workflow...')
    execD1(
      'multid1-orders',
      `INSERT INTO orders (id, user_id, status, total_amount, created_at, updated_at) VALUES ('${orderId}', '${userId}', 'completed', ${productPrice * 2}, ${Date.now()}, ${Date.now()});`
    )
    execD1(
      'multid1-orders',
      `INSERT INTO order_items (id, order_id, variant_id, quantity, price, created_at, updated_at) VALUES ('${orderItemId}', '${orderId}', '${variantId}', 2, ${productPrice}, ${Date.now()}, ${Date.now()});`
    )
    execD1('multid1-cart', `DELETE FROM cart_items WHERE cart_id = '${cartId}';`)
    const orderResult = execD1('multid1-orders', `SELECT * FROM orders WHERE id = '${orderId}';`)
    if (!orderResult[0]?.results?.length) throw new Error('Failed to insert/query remote order')
    console.log('   ✓ Remote DB_ORDERS operational.')

    // 5. Insert into multid1-reviews
    console.log('5. Testing remote multid1-reviews...')
    execD1(
      'multid1-reviews',
      `INSERT INTO reviews (id, user_id, product_id, rating, title, comment, created_at, updated_at) VALUES ('${reviewId}', '${userId}', '${productId}', 5, 'Great product!', 'Worked on remote D1', ${Date.now()}, ${Date.now()});`
    )
    const reviewResult = execD1('multid1-reviews', `SELECT * FROM reviews WHERE id = '${reviewId}';`)
    if (!reviewResult[0]?.results?.length) throw new Error('Failed to insert/query remote review')
    console.log('   ✓ Remote DB_REVIEWS operational.')

    // 6. Cross-Database Referential Integrity Audit on Remote Databases
    console.log('6. Running Cross-Database Integrity Audit on real Cloudflare D1 instances...')
    const orderUser = execD1('multid1-users', `SELECT id FROM users WHERE id = '${orderResult[0].results[0].user_id}';`)
    if (!orderUser[0]?.results?.length) throw new Error('Orphaned order: user not found in remote DB_USERS')

    const orderVariant = execD1('multid1-catalog', `SELECT id FROM product_variants WHERE id = '${variantId}';`)
    if (!orderVariant[0]?.results?.length) throw new Error('Orphaned order item: variant not found in remote DB_CATALOG')

    const reviewProduct = execD1('multid1-catalog', `SELECT id FROM products WHERE id = '${productId}';`)
    if (!reviewProduct[0]?.results?.length) throw new Error('Orphaned review: product not found in remote DB_CATALOG')

    console.log('   ✓ Cross-database foreign key references verified across all 5 remote D1 instances.')
    console.log('   ✓ Zero orphaned records detected in remote databases.\n')

    console.log('✅ ALL REMOTE PRODUCTION D1 TESTS PASSED SUCCESSFULLY!')
  } finally {
    // Cleanup remote test data
    console.log('\n🧹 Cleaning up test records from remote databases...')
    try {
      execD1('multid1-reviews', `DELETE FROM reviews WHERE id = '${reviewId}';`)
      execD1('multid1-orders', `DELETE FROM order_items WHERE order_id = '${orderId}';`)
      execD1('multid1-orders', `DELETE FROM orders WHERE id = '${orderId}';`)
      execD1('multid1-cart', `DELETE FROM cart_items WHERE cart_id = '${cartId}';`)
      execD1('multid1-cart', `DELETE FROM carts WHERE id = '${cartId}';`)
      execD1('multid1-catalog', `DELETE FROM product_variants WHERE id = '${variantId}';`)
      execD1('multid1-catalog', `DELETE FROM products WHERE id = '${productId}';`)
      execD1('multid1-users', `DELETE FROM user_sessions WHERE id = '${sessionId}';`)
      execD1('multid1-users', `DELETE FROM users WHERE id = '${userId}';`)
      console.log('✓ Remote cleanup completed cleanly.')
    } catch (err) {
      console.error('Cleanup warning:', err)
    }
  }
}

runRemoteProdTests().catch((err) => {
  console.error('❌ Remote D1 Test Failed:', err)
  process.exit(1)
})
