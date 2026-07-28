# Multi-D1 Cloudflare Architecture

Scalable multi-database e-commerce backend built on Cloudflare D1 and Drizzle ORM, partitioned across 5 independent database instances.

## Architecture & Database Partitioning

| Partition | Binding | Live D1 Database | Purpose |
| --- | --- | --- | --- |
| `DB_USERS` | `DB_USERS` | `multid1-users` | User accounts and session tokens |
| `DB_CATALOG` | `DB_CATALOG` | `multid1-catalog` | Products and product variants |
| `DB_CART` | `DB_CART` | `multid1-cart` | High-frequency write hot database for shopping carts |
| `DB_ORDERS` | `DB_ORDERS` | `multid1-orders` | Placed orders and order line items |
| `DB_REVIEWS` | `DB_REVIEWS` | `multid1-reviews` | Product ratings and reviews |

## Key Features

- **Drizzle ORM Type Safety**: End-to-end type safety using Drizzle ORM schemas and client instances instead of raw SQL strings.
- **Type-Prefixed ULIDs**: Globally unique, time-sortable string primary keys with domain prefixes (`usr_`, `ses_`, `prd_`, `var_`, `crt_`, `cit_`, `ord_`, `ori_`, `rev_`).
- **Application-Layer Joins**: Parallel `Promise.all` batching (`getOrderDetails`, `getReviewsForProduct`) stitching cross-partition DTOs in memory.
- **Cross-Database Integrity**: Pre-write referential checks throwing `ReferentialIntegrityError` on invalid parent IDs, combined with `auditSystemIntegrity()` for system-wide orphan detection.

## Getting Started

### Prerequisites
- Node.js >= 18
- `pnpm` package manager
- Authenticated Cloudflare account (`pnpm wrangler login`)

### Installation

```bash
pnpm install
```

### Local Unit & Integration Tests

Run the Vitest test suite powered by `@cloudflare/vitest-pool-workers`:

```bash
pnpm test
```

### Drizzle Database Migrations

Generate migration SQL files for all 5 database partitions:

```bash
pnpm db:generate
```

Apply migrations to live remote Cloudflare D1 instances:

```bash
pnpm db:migrate:remote
```

### Remote Production Load Benchmark

Execute a fully parallel high-concurrency load benchmark using 100% Drizzle ORM query builders against live remote Cloudflare D1 databases:

```bash
pnpm test:remote
```
