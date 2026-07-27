# Context & Domain Glossary

This document defines the ubiquitous language for `multid1`.

## Domain Entities

### User & Session (`DB_USERS`)
- **User**: An registered identity in the system. Primary key `id`.
- **User Session**: An active authentication session linked to a `User` (`user_id`).

### Catalog (`DB_CATALOG`)
- **Product**: A top-level product listing. Primary key `id`.
- **Product Variant**: A specific SKU or variation (e.g. size/color) belonging to a `Product` (`product_id`). Primary key `id`.

### Cart (`DB_CART`)
- **Cart**: A temporary container for items a user intends to buy. High-write, ephemeral workload. Linked to `user_id`. Primary key `id`.
- **Cart Item**: An entry inside a `Cart` referencing a `ProductVariant` (`variant_id`).

### Orders (`DB_ORDERS`)
- **Order**: A finalized purchase transaction created from a `Cart`. Primary key `id`. References `user_id`.
- **Order Item**: A snapshot record of a purchased `ProductVariant` inside an `Order` (`order_id`, `variant_id`).

### Reviews (`DB_REVIEWS`)
- **Review**: Customer evaluation and feedback for a `Product` (`product_id`) written by a `User` (`user_id`).

## Architecture Concepts

- **D1 Instance**: An isolated Cloudflare D1 SQLite database instance holding a subset of system tables.
- **Cross-Database Referential Integrity**: Application-enforced integrity checks ensuring foreign key identifiers (e.g. `order.user_id`) reference existing entities in separate D1 instances.
 - **Application-Layer Join**: Query pattern where separate D1 instances are queried independently and merged in application code.
 - **Type-Prefixed Key**: Globally unique string identifier with domain prefix (e.g., `usr_...`, `prd_...`, `crt_...`) used as primary and foreign keys.
 - **Typed Drizzle Client**: Drizzle ORM instance initialized per D1 database (`drizzle(env.DB_...)`), providing typed schema queries per partition.
