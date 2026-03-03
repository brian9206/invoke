'use strict';

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
   * @param {object} sequelize - Connected Sequelize instance
   */
  constructor(sequelize) {
    this.sequelize = sequelize;

    const migrationsPath = (
      process.env.MIGRATIONS_DIR || path.resolve(__dirname, 'migrations')
    ).replace(/\\/g, '/');

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
        info: (msg) =>
          console.log(
            '  ℹ️ ',
            typeof msg === 'object' ? msg.event || JSON.stringify(msg) : msg,
          ),
        warn: (msg) => console.warn('  ⚠️ ', msg),
        error: (msg) => console.error('  ❌', msg),
        debug: () => {},
      },
    });
  }

  /**
   * Run all pending migrations.
   * Called automatically on server startup via db-init.
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
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ Migration failed:', message);
      throw error;
    }
  }

  /** Roll back the last applied migration. */
  async migrateDown() {
    await this.umzug.down();
  }

  /** Return a summary of applied and pending migrations. */
  async getMigrationStatus() {
    const [pending, executed] = await Promise.all([
      this.umzug.pending(),
      this.umzug.executed(),
    ]);

    return {
      total: pending.length + executed.length,
      applied: executed.length,
      pending: pending.length,
      migrations: [
        ...executed.map((m) => ({ name: m.name, applied: true })),
        ...pending.map((m) => ({ name: m.name, applied: false })),
      ],
    };
  }

  /**
   * One-time bootstrap: if the old schema_migrations table exists and
   * SequelizeMeta is not yet populated, create SequelizeMeta, mark all
   * known migrations as applied, then drop the legacy table.
   */
  async _bootstrapFromLegacy() {
    try {
      const tables = await this.sequelize.getQueryInterface().showAllTables();

      if (!tables.includes('schema_migrations')) return;

      if (tables.includes('SequelizeMeta')) {
        const [existing] = await this.sequelize.query(
          'SELECT name FROM "SequelizeMeta" LIMIT 1',
        );
        if (existing.length > 0) {
          await this.sequelize.query('DROP TABLE schema_migrations');
          console.log('🗑️  Dropped legacy schema_migrations table');
          return;
        }
      }

      console.log('🔄 Bootstrapping SequelizeMeta from legacy schema_migrations...');

      await this.sequelize.query(`
        CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
          name VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY
        )
      `);

      await this.sequelize.query(
        'INSERT INTO "SequelizeMeta" (name) VALUES ($1) ON CONFLICT DO NOTHING',
        { bind: ['001_initial_schema.js'] },
      );

      await this.sequelize.query('DROP TABLE schema_migrations');

      console.log(
        '✅ Seeded SequelizeMeta with 001_initial_schema.js and dropped legacy schema_migrations table',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️  Legacy bootstrap skipped (non-fatal):', message);
    }
  }
}

module.exports = MigrationManager;
