# Database Migration System

## Overview

This directory contains all database migration scripts for the Invoke application. The migration system automatically applies database changes when the invoke-admin server starts.

## 🚨 Important Guidelines for AI Agents

**When making ANY database structure changes:**

1. ✅ **ALWAYS create a new migration file** - Never modify existing migration files
2. ✅ **NEVER directly edit `001_initial_schema.sql` or any numbered migration** - These are historical records
3. ✅ **Follow the naming convention** - Use the next sequential number
4. ✅ **Test migrations locally** before committing
5. ✅ **Include rollback strategy** in your migration comments

## Migration System Features

- ✅ **Automatic execution** on server startup
- ✅ **Checksum verification** to detect tampering
- ✅ **Transaction safety** - each migration runs atomically
- ✅ **Ordered execution** - migrations run in alphanumeric order
- ✅ **Execution tracking** - all applied migrations are recorded
- ✅ **Fail-fast** - server won't start if migrations fail

## File Naming Convention

All migration files must follow this pattern:

```
{version}_{description}.sql
```

### Examples:
- `000_create_migrations_table.sql` - Infrastructure (migration tracking)
- `001_initial_schema.sql` - Base database schema
- `002_add_network_policies.sql` - Network security policies
- `003_add_user_roles.sql` - (future migration example)
- `004_add_audit_logging.sql` - (future migration example)

### Rules:
- **Version**: 3-digit zero-padded number (001, 002, 003...)
- **Description**: Snake_case, descriptive, concise
- **Extension**: Always `.sql`

## Creating a New Migration

### Step 1: Determine the next version number

```bash
# List existing migrations
ls database/

# The next number is the highest + 1
# If you see 000, 001, 002, then create 003
```

### Step 2: Create the migration file

```bash
# Example: Adding a new table
touch database/003_add_audit_logs.sql
```

### Step 3: Write the migration SQL

```sql
-- Migration: Add Audit Logs
-- Description: Track all administrative actions for compliance
-- Date: 2026-02-09
-- Author: Your Name

-- Create audit_logs table
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Add comments
COMMENT ON TABLE audit_logs IS 'Administrative action audit trail for compliance';
```

### Step 4: Test the migration

```bash
# Option 1: Restart the server (migrations run automatically)
npm run dev

# Option 2: Run migrations manually
npm run db:migrate
```

### Step 5: Verify migration was applied

```sql
-- Check the schema_migrations table
SELECT * FROM schema_migrations ORDER BY version;

-- Should show your new migration with:
-- - version: "003"
-- - name: "add_audit_logs"
-- - applied_at: timestamp
-- - success: true
```

## Migration Best Practices

### DO ✅

- **Use descriptive names** - `add_user_roles.sql` not `update.sql`
- **Include comments** - Explain what and why
- **Add indexes** - For foreign keys and frequently queried columns
- **Use transactions** - Migrations run in transactions automatically
- **Test rollback strategy** - Know how to undo if needed
- **Keep migrations small** - One logical change per migration
- **Use IF NOT EXISTS** - For idempotent migrations when appropriate

### DON'T ❌

- **Don't modify existing migrations** - Create new ones instead
- **Don't delete old migrations** - They're historical records
- **Don't skip version numbers** - Keep sequential order
- **Don't include DROP DATABASE** - Very dangerous
- **Don't mix DDL and DML** - Keep structure changes separate from data
- **Don't use hard-coded dates** - Use NOW() or CURRENT_TIMESTAMP

## Migration File Template

```sql
-- Migration: [Short Title]
-- Description: [Detailed explanation of what this migration does]
-- Date: [YYYY-MM-DD]
-- Author: [Your name or team]
-- 
-- Rollback Strategy:
-- [Explain how to manually rollback if needed]

-- Your SQL statements here
CREATE TABLE example (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_example_name ON example(name);

-- Add constraints
ALTER TABLE example ADD CONSTRAINT check_name_length CHECK (LENGTH(name) >= 3);

-- Add comments for documentation
COMMENT ON TABLE example IS 'Example table for demonstration';
COMMENT ON COLUMN example.name IS 'The name field must be at least 3 characters';
```

## Common Migration Patterns

### Adding a Column

```sql
-- Migration: Add email verification status
-- Date: 2026-02-09

ALTER TABLE users 
ADD COLUMN email_verified BOOLEAN DEFAULT false;

ALTER TABLE users 
ADD COLUMN email_verified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_users_email_verified ON users(email_verified);
```

### Creating a New Table with Foreign Keys

```sql
-- Migration: Add notification system
-- Date: 2026-02-09

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(user_id, is_read);
```

### Adding Constraints

```sql
-- Migration: Add data validation constraints
-- Date: 2026-02-09

ALTER TABLE projects 
ADD CONSTRAINT check_project_name_length 
CHECK (LENGTH(name) >= 3 AND LENGTH(name) <= 100);

ALTER TABLE functions 
ADD CONSTRAINT check_retention_value_positive 
CHECK (retention_value IS NULL OR retention_value > 0);
```

### Creating Indexes for Performance

```sql
-- Migration: Optimize query performance
-- Date: 2026-02-09

CREATE INDEX idx_execution_logs_compound 
ON execution_logs(function_id, executed_at DESC);

CREATE INDEX idx_functions_project_active 
ON functions(project_id, is_active) 
WHERE is_active = true;
```

## Schema Migration Table

The system maintains a `schema_migrations` table to track all applied migrations:

```sql
CREATE TABLE schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) UNIQUE NOT NULL,      -- e.g., "001", "002"
    name VARCHAR(255) NOT NULL,                -- e.g., "initial_schema"
    applied_at TIMESTAMP WITH TIME ZONE,       -- when executed
    checksum VARCHAR(64) NOT NULL,             -- SHA-256 hash
    execution_time_ms INTEGER,                 -- performance tracking
    success BOOLEAN DEFAULT true               -- execution status
);
```

## Troubleshooting

### Migration Failed During Startup

```
Error: Migration 003_add_audit_logs.sql failed
```

**Solution:**
1. Check the error message in console
2. Fix the SQL syntax error
3. Delete the failed migration record (if it was partially applied):
   ```sql
   DELETE FROM schema_migrations WHERE version = '003';
   ```
4. Restart the server

### Migration Already Applied But Need to Rerun

**Solution:**
1. Remove the migration record:
   ```sql
   DELETE FROM schema_migrations WHERE version = '003';
   ```
2. Restart the server or run `npm run db:migrate`

### Need to Rollback a Migration

**Manual rollback (no automatic rollback):**
1. Write reverse SQL statements
2. Execute manually in database
3. Remove migration record:
   ```sql
   DELETE FROM schema_migrations WHERE version = '003';
   ```

### Check Migration Status

```sql
-- View all applied migrations
SELECT 
    version,
    name,
    applied_at,
    execution_time_ms,
    success
FROM schema_migrations
ORDER BY version;

-- Check if specific migration applied
SELECT * FROM schema_migrations WHERE version = '003';
```

## Technical Details

### How It Works

1. **Server starts** → `database.connect()` is called
2. **Migration check** → `runMigrations()` is triggered
3. **Table check** → System checks if `schema_migrations` exists
4. **First run** → If table missing, creates it and runs all migrations
5. **Normal run** → Compares disk files vs database records
6. **Execute pending** → Runs any new migrations in order
7. **Record results** → Saves migration details to `schema_migrations`
8. **Server continues** → If all successful, server starts normally

### Migration Manager Location

- **Code**: `invoke-admin/lib/migration-manager.js`
- **Integration**: `invoke-admin/lib/database.js`
- **Manual CLI**: `invoke-admin/scripts/migrate.js`

### Checksum Verification

Each migration file is hashed (SHA-256) when applied. If you modify an existing migration file after it's been applied, the checksum will mismatch and the system will warn you.

**Why?** Once a migration is applied in production, it should never be modified. Create a new migration instead.

## Directory Structure

```
database/
├── README.md (this file)
├── 000_create_migrations_table.sql
├── 001_initial_schema.sql
├── 002_add_network_policies.sql
└── 003_your_new_migration.sql (example)
```

## Running Migrations

### Automatic (Default)

Migrations run automatically when invoke-admin starts:

```bash
cd invoke-admin
npm run dev
# or
npm start
```

### Manual Execution

```bash
cd invoke-admin
npm run db:migrate
```

## Environment Variables

Make sure these are set for database connection:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=invoke_db
DB_USER=postgres
DB_PASSWORD=your_password
```

### Optional Configuration

```bash
# Custom migrations directory (default: ./database)
MIGRATIONS_DIR=./database
# Can be absolute or relative path
# MIGRATIONS_DIR=/absolute/path/to/migrations
# MIGRATIONS_DIR=./custom/migrations/path
```

## CI/CD Integration

In your deployment pipeline:

```bash
# Build step
npm run build

# Migration step (before starting server)
npm run db:migrate

# Start server
npm start
```

## Questions?

For issues or questions about migrations:
1. Check this README
2. Review existing migration files as examples
3. Check `invoke-admin/lib/migration-manager.js` for implementation details

---

**Last Updated**: February 9, 2026
**System Version**: 1.0.0
