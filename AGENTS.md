# Invoke Platform

## Project Structure

This is an npm workspaces monorepo. All services resolve `invoke-shared` from the `shared/` package.

When scanning the codebase, ignore code inside `.next/`, `dist/`, and `.cache/` — those are build output and cache directories.

---

## UI Components

### Modal/Dialog Usage

Use the shared `invoke-admin/components/Modal.tsx` for all modal and dialog UI in `invoke-admin` pages and feature components.

**Do:**

- Use `Modal` from `invoke-admin/components/Modal.tsx` for all page-level and feature-level dialogs.

**Don't:**

- Don't import or use `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, or `DialogDescription` directly in page-level or feature-level code.
- Don't use `invoke-admin/components/ui/dialog.tsx` directly outside of low-level shared dialog infrastructure.

**When a modal needs different behavior** (different width, rich title content, custom body actions), extend `Modal.tsx` rather than bypassing it.

If you find an existing direct `Dialog` usage while editing a file, migrate it to `Modal` unless the user explicitly says otherwise.

---

## Database Access

All database access goes through **Sequelize v6 ORM**.

**Do:**

- Use Sequelize model methods (`findAll`, `findOne`, `create`, `update`, `destroy`, `count`, `sum`, etc.) and operators (`Op`, `fn`, `col`, `literal`).
- For raw connection strings (e.g. Keyv), use `database.getConnectionConfig()`.

**Don't:**

- Don't use raw `pg.Pool`, `new Pool()`, or `new Client()`.
- Don't use `database.query()`, `database.pool`, `sequelize.query()`, or `QueryTypes` in application code.
- Don't write raw SQL in application code.
- Don't reach into Sequelize internals.

**Migrations** are the only acceptable place for raw SQL — and only DDL that `queryInterface` can't express (triggers, PL/pgSQL functions). `migration-manager.js` itself also uses raw queries for meta-table operations; do not refactor it.

---

## Sequelize Models

All 15 models live in `shared/models/`, registered via `initModels()`. Associations are defined in each model file's `Model.associate(models)`.

### Function Model Naming

`Function` is a reserved word in JavaScript. The model is registered as `Function` in `database.models` (not `FunctionModel`). Always destructure with an alias:

```js
const { Function: FunctionModel } = database.models
```

---

## Migrations

Migrations live in `shared/migrations/` using the Umzug `up`/`down` pattern with `queryInterface`. They run automatically when `invoke-admin` starts, or directly via `invoke-admin/scripts/migrate.js`.

### Migration Rules

**Do:**

- Use sequential numbering (`NNN_description.js`).
- Always include a `down()` method for rollback capability.
- Use `queryInterface` methods (`createTable`, `addColumn`, `removeColumn`, `addIndex`, `addConstraint`).
- Update the corresponding model in `shared/models/` if you added/removed a column or table.
- Register any new models in `shared/models/index.js`.

**Don't:**

- Don't modify an existing migration file — create a new one instead. (In Plan mode, ask the user first.)
- Don't delete a migration file — they are historical records.
- Don't use the Umzug v2 signature `(queryInterface, Sequelize)` — this project uses **v3** and the destructure is `{ context: { queryInterface } }`. The old signature silently fails.

### Schema Change Workflow

1. Create a new migration in `shared/migrations/NNN_description.js`.
2. Update the model in `shared/models/`.
3. Register any new models in `shared/models/index.js`.
4. Test by running `cd invoke-admin && node scripts/migrate.js` (recommended — avoids Next.js hot-reload race conditions).

---

## PostgreSQL LISTEN/NOTIFY

The platform uses LISTEN/NOTIFY for cache invalidation. If you add a new table that should invalidate caches, add the appropriate trigger in a new migration.

## Code Quality

**Do:**

- Commit after every logical change, even small ones.
- Read files before modifying them — understand existing code before suggesting changes.

**Don't:**

- Don't push commits.
- Don't start or stop running services — just tell the user what commands to run.
- Don't over-engineer. Only make changes that are directly requested or clearly necessary.
- Don't create unnecessary files, comments, type annotations, or abstractions.
- Don't use destructive actions as shortcuts or bypass safety checks.

---

## Non-Negotiable Rules

1. **Commit after every logical change** — even small ones.
2. **Never push commits.**
