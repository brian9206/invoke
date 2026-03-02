const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');

/**
 * Database Migration Manager
 *
 * Wraps umzug + Sequelize to run the shared JS migrations located in
 * shared/migrations/. Migration state is tracked in PostgreSQL via the
 * standard SequelizeMeta table (umzug default).
 *
 * For existing deployments that previously used the custom schema_migrations
 * table, _bootstrapFromLegacy() seeds SequelizeMeta from that table on
 * first startup so no migrations are replayed.
 */
class MigrationManager {
    /**
     * @param {import('sequelize').Sequelize} sequelize - Connected Sequelize instance
     */
    constructor(sequelize) {
        this.sequelize = sequelize;

        const migrationsPath = (process.env.MIGRATIONS_DIR
            || path.resolve(process.cwd(), '../shared/migrations'))
            .replace(/\\/g, '/');

        console.log('🔧 Initializing MigrationManager with migrations path:', migrationsPath);
        this.umzug = new Umzug({
            migrations: {
                glob: `${migrationsPath}/*.js`,
            },
            context: {
                queryInterface: sequelize.getQueryInterface(),
                Sequelize: sequelize.constructor,
            },
            storage: new SequelizeStorage({ sequelize }),
            logger: {
                info:  (msg) => console.log('  ℹ️ ', typeof msg === 'object' ? msg.event || JSON.stringify(msg) : msg),
                warn:  (msg) => console.warn('  ⚠️ ', msg),
                error: (msg) => console.error('  ❌', msg),
                debug: () => {},
            },
        });
    }

    /**
     * Run all pending migrations.
     * Called automatically on server startup via db-init.js.
     */
    async runMigrations() {
        console.log('\n🔄 Starting database migration check...');
        const startTime = Date.now();

        try {
            await this._bootstrapFromLegacy();

            const pending = await this.umzug.pending();

            if (pending.length === 0) {
                console.log('✅ All migrations up to date (no pending migrations)');
            } else {
                console.log(`📝 Found ${pending.length} pending migration(s)`);
                await this.umzug.up();
                console.log(`✅ Applied ${pending.length} new migration(s)`);
            }

            const totalTime = Date.now() - startTime;
            console.log(`✅ Migration check completed in ${totalTime}ms\n`);
            return true;
        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            throw error;
        }
    }

    /**
     * Roll back the last applied migration.
     */
    async migrateDown() {
        await this.umzug.down();
    }

    /**
     * Return a summary of applied and pending migrations.
     */
    async getMigrationStatus() {
        const [pending, executed] = await Promise.all([
            this.umzug.pending(),
            this.umzug.executed(),
        ]);

        return {
            total:   pending.length + executed.length,
            applied: executed.length,
            pending: pending.length,
            migrations: [
                ...executed.map((m) => ({ name: m.name, applied: true  })),
                ...pending.map((m)  => ({ name: m.name, applied: false })),
            ],
        };
    }

    /**
     * One-time bootstrap: if the old schema_migrations table exists and
     * SequelizeMeta is still empty, seed SequelizeMeta from the legacy table
     * so existing deployments don't re-run already-applied migrations.
     */
    async _bootstrapFromLegacy() {
        try {
            const tables = await this.sequelize.getQueryInterface().showAllTables();

            if (!tables.includes('schema_migrations')) return;

            // If SequelizeMeta already has rows, nothing to do
            if (tables.includes('SequelizeMeta')) {
                const [existing] = await this.sequelize.query('SELECT name FROM "SequelizeMeta" LIMIT 1');
                if (existing.length > 0) return;
            }

            console.log('🔄 Bootstrapping SequelizeMeta from legacy schema_migrations...');

            const [applied] = await this.sequelize.query(
                "SELECT version FROM schema_migrations WHERE success = true ORDER BY version"
            );

            if (applied.length === 0) return;

            // Map old 3-digit version numbers to new migration filenames
            const VERSION_MAP = {
                '001': '001_initial_schema.js',
                '002': '002_add_network_policies.js',
                '003': '003_add_api_gateway.js',
                '004': '004_add_middleware_auth.js',
                '005': '005_auth_method_sort_order.js',
                '006': '006_add_execution_notify_triggers.js',
                '007': '007_jwt_mode_backfill.js',
            };

            await this.sequelize.query(`
                CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
                    name VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY
                )
            `);

            let seeded = 0;
            for (const row of applied) {
                const migrationName = VERSION_MAP[row.version];
                if (migrationName) {
                    await this.sequelize.query(
                        'INSERT INTO "SequelizeMeta" (name) VALUES ($1) ON CONFLICT DO NOTHING',
                        { bind: [migrationName] }
                    );
                    seeded++;
                }
            }

            console.log(`✅ Seeded SequelizeMeta with ${seeded} legacy migration(s)`);
        } catch (err) {
            // Non-fatal — umzug will handle first-run creation of SequelizeMeta
            console.warn('⚠️  Legacy bootstrap skipped (non-fatal):', err.message);
        }
    }
}

module.exports = MigrationManager;

