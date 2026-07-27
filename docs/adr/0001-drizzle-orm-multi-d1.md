# 1. Use Drizzle ORM for Multi-D1 Database Access Layer

## Context

We are partitioning SQLite tables across 5 distinct Cloudflare D1 instances (`DB_USERS`, `DB_CART`, `DB_CATALOG`, `DB_ORDERS`, `DB_REVIEWS`) to scale write throughput and isolate hot workloads (such as shopping carts). 

We need a database access layer that provides full TypeScript type safety for table schemas, queries, and cross-database application-layer joins without resorting to untyped raw SQL strings.

## Decision

We will use **Drizzle ORM** (`drizzle-orm/d1`) to define schemas and instantiate 5 typed database clients, one for each Cloudflare D1 binding:

- `db.users` $\rightarrow$ `drizzle(env.DB_USERS, { schema: usersSchema })`
- `db.cart` $\rightarrow$ `drizzle(env.DB_CART, { schema: cartSchema })`
- `db.catalog` $\rightarrow$ `drizzle(env.DB_CATALOG, { schema: catalogSchema })`
- `db.orders` $\rightarrow$ `drizzle(env.DB_ORDERS, { schema: ordersSchema })`
- `db.reviews` $\rightarrow$ `drizzle(env.DB_REVIEWS, { schema: reviewsSchema })`

Application-layer joins and cross-database referential integrity checks will use Drizzle's typed query builders (`inArray`, `eq`, relational queries) across client instances.

## Consequences

- **Pros**: Full compile-time type safety across all 5 databases; schema definitions act as the source of truth; easy migrations and query construction with `inArray()` batching.
- **Cons**: Requires maintaining 5 separate Drizzle schema definitions and client instances instead of a single monolithic connection; cross-database joins must still be orchestrated at the application level.
