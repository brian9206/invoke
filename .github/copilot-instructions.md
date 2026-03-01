# Copilot Instructions — Invoke Platform

## Project Structure

This is an npm workspaces monorepo. All services resolve `invoke-shared` from the `shared/` package.

---

## Database System

### Overview

All database access goes through **Sequelize v6 ORM**. There is **no raw `pg.Pool`** anywhere.
Do **not** use `database.query()`, `database.pool`, `new Pool()`, or `new Client()`.
Do **not** use raw SQL in application code — use Sequelize models and query methods.

### Shared Factories (in `invoke-shared`)

| Export                  | File                       | Purpose                                                 |
|-------------------------|----------------------------|---------------------------------------------------------|
| `createDatabase(opts)`  | `shared/database.js`       | Low-level Sequelize instance factory (reads env vars)   |
| `createServiceDatabase(opts)` | `shared/service-database.js` | Creates `{ sequelize, models, getConnectionConfig(), close() }` |
| `initModels(sequelize)` | `shared/models/index.js`   | Registers all 15 models + associations on a Sequelize instance |
| `createNotifyListener(channel, opts)` | `shared/pg-notify.js` | PostgreSQL LISTEN/NOTIFY subscriber via `pg-listen` |

### Per-Service `database.js`

Every service has a one-liner `database.js` that calls the shared factory:

```js
const { createServiceDatabase } = require('invoke-shared');
module.exports = createServiceDatabase({ poolMax: 20 });
```

The returned object exposes:

- `database.sequelize` — the Sequelize instance
- `database.models` — all models (`Function`, `ExecutionLog`, `User`, `Project`, etc.)
- `database.getConnectionConfig()` — returns `{ user, host, database, password, port }` from env vars
- `database.close()` — shuts down the Sequelize connection pool

Pool sizes: `poolMax: 20`.

### Environment Variables (database)

| Variable         | Default      | Notes                                    |
|------------------|--------------|------------------------------------------|
| `DB_HOST`        | `localhost`  |                                          |
| `DB_PORT`        | `5432`       |                                          |
| `DB_NAME`        | `invoke_db`  |                                          |
| `DB_USER`        | `postgres`   |                                          |
| `DB_PASSWORD`    | `postgres`   |                                          |
| `SEQUELIZE_LOG`  | `false`      | Set `true` to log SQL to console         |

### Rules for Database Access

1. **Always use Sequelize models** — `database.models.Function.findAll(...)`, not raw SQL.
2. **Never use `sequelize.query()` or `QueryTypes`** — use model methods (`findAll`, `findOne`, `create`, `update`, `destroy`, `count`, `sum`, etc.) and Sequelize operators (`Op`, `fn`, `col`, `literal`).
3. **Exception: migrations** — migrations use `queryInterface` which is raw DDL by nature. That is the ONLY place raw SQL is acceptable.
4. **Exception: migration-manager.js** — the migration infrastructure itself uses `sequelize.query()` for meta-table operations. Do not refactor this.
5. **If you need a raw connection string** (e.g. for Keyv/KeyvPostgres), use `database.getConnectionConfig()` — never reach into Sequelize internals.

---

## Models

All 15 models live in `shared/models/`. Each file exports a function `(sequelize) => Model`.

Associations are defined via `Model.associate(models)` in each model file and wired up by `initModels()`.

---

## Migration System

### Current System: Umzug + Sequelize

Migrations live in `shared/migrations/` as JavaScript files using the Umzug `up`/`down` pattern with `queryInterface`.

The migration runner is `invoke-admin/lib/migration-manager.js`, which wraps [Umzug](https://github.com/sequelize/umzug) with `SequelizeStorage`. Migrations are tracked in the `SequelizeMeta` table.

Migrations run **automatically** when `invoke-admin` starts, via `invoke-admin/lib/db-init.js`.

### Creating a New Migration

#### Step 1: Determine the next version number

```bash
ls shared/migrations/
# Currently: 001 through 007. Next is 008.
```

#### Step 2: Create the migration file

```bash
touch shared/migrations/008_your_description.js
```

#### Step 3: Write the migration

```js
'use strict';

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Use queryInterface methods:
    //   createTable, addColumn, removeColumn, addIndex, addConstraint, etc.
    // For triggers/functions, use queryInterface.sequelize.query() (DDL only).
  },

  async down(queryInterface, Sequelize) {
    // Reverse the up() changes.
  },
};
```

#### Step 4: Update the model (if schema changed)

If you added/removed a column or table, update the corresponding model in `shared/models/`.

#### Step 5: Test

```bash
# Restart invoke-admin — migrations run on startup
cd invoke-admin && npm run dev
```

### Migration Rules

1. **NEVER modify an existing migration file** — create a new one unless user told to modify the existing one. If you are in Plan mode, please ask the user if they want to modify an existing migration or create a new one.
2. **NEVER delete a migration file** — they are historical records.
3. **Use sequential numbering** — `008`, `009`, `010`, etc.
4. **Always include a `down()` method** — for rollback capability.
5. **Use `queryInterface` methods** — not raw SQL, unless it's DDL that `queryInterface` can't express (triggers, PL/pgSQL functions).
6. **If you add a table**, create a corresponding model in `shared/models/` and register it in `shared/models/index.js`.
7. **If you add a column**, update the corresponding model definition.

### Migration File Naming

```
{NNN}_{snake_case_description}.js
```

Examples:
- `001_initial_schema.js`
- `008_add_audit_logs.js`
- `009_add_user_email_verified.js`

---

## PostgreSQL LISTEN/NOTIFY (Cache Invalidation)

The platform uses PostgreSQL's LISTEN/NOTIFY to invalidate in-memory caches instantly when data changes, via database triggers.

### Shared Factory

`createNotifyListener(channel, options)` in `shared/pg-notify.js` creates a listener using the `pg-listen` package. It handles:

- Automatic reconnection
- Per-key debouncing (collapses burst writes into a single callback)
- Configurable payload parsing

### Usage Pattern

```js
// In the service's server.js:
const { createNotifyListener } = require('invoke-shared');

const listener = createNotifyListener('my_channel', {
  parsePayload: (raw) => JSON.parse(raw),       // optional
  getDebounceKey: (payload) => payload.some_id,  // optional, for per-key debouncing
  debounceMs: 100,                               // default
});

await listener.connect(async (payload) => {
  // Handle cache invalidation
});

// On shutdown:
await listener.stop();
```

### Triggers

The PL/pgSQL trigger functions that emit NOTIFY are created in migrations:
- `shared/migrations/003_add_api_gateway.js` — `notify_gateway_change()`
- `shared/migrations/006_add_execution_notify_triggers.js` — `notify_execution_cache_change()`

If you add a new table that should trigger cache invalidation, create a new migration that adds the appropriate trigger.

---

## Quick Reference: How to Do Common Tasks

### Add a new API endpoint (invoke-admin)

1. Create or edit a file in `invoke-admin/pages/api/`.
2. Use `database.models.YourModel.findAll(...)` etc. for data access.
3. Never use `database.query()` or raw SQL.

### Add a new database table

1. Create a migration in `shared/migrations/NNN_description.js` using `queryInterface.createTable()`.
2. Create a model in `shared/models/YourModel.js`.
3. Register the model in `shared/models/index.js` (import, instantiate, add to `models` object).

### Add a column to an existing table

1. Create a migration using `queryInterface.addColumn()`.
2. Update the model definition in `shared/models/`.

### Query data with aggregations

```js
const { fn, col, literal, Op } = require('sequelize');

const result = await database.models.Function.findOne({
  attributes: [
    [fn('COUNT', col('id')), 'total'],
    [literal(`COUNT(*) FILTER (WHERE is_active = true)`), 'active'],
  ],
  where: { project_id: someId },
  raw: true,
});
```

### Build a connection string (e.g., for Keyv)

```js
const config = database.getConnectionConfig();
const uri = `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
```
