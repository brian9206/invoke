const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Database Migration Manager
 * Handles automatic database migrations on server startup
 */
class MigrationManager {
    constructor(pool) {
        this.pool = pool;
        
        // Use MIGRATIONS_DIR env var, fallback to './database' relative to project root
        const migrationsPath = process.env.MIGRATIONS_DIR || './database';
        this.migrationsDir = path.isAbsolute(migrationsPath) 
            ? migrationsPath 
            : path.resolve(process.cwd(), migrationsPath);
        
        this.migrationTableName = 'schema_migrations';
    }

    /**
     * Run all pending migrations
     * This is the main entry point called on server startup
     */
    async runMigrations() {
        console.log('\n🔄 Starting database migration check...');
        const startTime = Date.now();

        try {
            // Check if migration table exists
            const tableExists = await this.migrationTableExists();
            
            if (!tableExists) {
                console.log('📋 First time setup: Migration table not found');
                await this.initializeMigrations();
            } else {
                console.log('✅ Migration table found');
                await this.runPendingMigrations();
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
     * Check if schema_migrations table exists
     */
    async migrationTableExists() {
        try {
            const result = await this.pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                );
            `, [this.migrationTableName]);
            
            return result.rows[0].exists;
        } catch (error) {
            console.error('Error checking migration table:', error);
            return false;
        }
    }

    /**
     * Initialize migrations (first time setup)
     * Creates migration table and runs all migrations
     */
    async initializeMigrations() {
        console.log('🚀 Initializing migration system...');
        
        // Get all migration files
        const migrations = await this.scanMigrationFiles();
        
        if (migrations.length === 0) {
            throw new Error('No migration files found in database directory');
        }

        // First, create the migration table (should be 000_create_migrations_table.sql)
        const migrationTableFile = migrations.find(m => m.version === '000');
        
        if (!migrationTableFile) {
            throw new Error('Migration table creation script (000_create_migrations_table.sql) not found');
        }

        console.log(`📝 Creating migration table: ${migrationTableFile.filename}`);
        await this.executeMigrationFile(migrationTableFile, false); // Don't record this one yet

        // Now run all other migrations and record them
        const otherMigrations = migrations.filter(m => m.version !== '000');
        
        for (const migration of otherMigrations) {
            console.log(`📝 Applying migration [${migration.version}]: ${migration.name}`);
            await this.executeMigrationFile(migration, true);
        }

        // Record the 000 migration retroactively
        await this.recordMigration(migrationTableFile, 0, true);

        console.log(`✅ Initialized with ${migrations.length} migrations`);
    }

    /**
     * Run only pending migrations
     */
    async runPendingMigrations() {
        // Get all migration files from disk
        const allMigrations = await this.scanMigrationFiles();
        
        // Get applied migrations from database
        const appliedMigrations = await this.getAppliedMigrations();
        const appliedVersions = new Set(appliedMigrations.map(m => m.version));

        // Find pending migrations
        const pendingMigrations = allMigrations.filter(m => !appliedVersions.has(m.version));

        if (pendingMigrations.length === 0) {
            console.log('✅ All migrations up to date (no pending migrations)');
            return;
        }

        console.log(`📝 Found ${pendingMigrations.length} pending migration(s)`);

        // Execute pending migrations in order
        for (const migration of pendingMigrations) {
            console.log(`⚡ Applying migration [${migration.version}]: ${migration.name}`);
            await this.executeMigrationFile(migration, true);
        }

        console.log(`✅ Applied ${pendingMigrations.length} new migration(s)`);
    }

    /**
     * Scan database directory for migration files
     */
    async scanMigrationFiles() {
        try {
            const files = await fs.readdir(this.migrationsDir);
            
            // Filter for .sql files only
            const sqlFiles = files.filter(f => f.endsWith('.sql'));
            
            // Parse migration files
            const migrations = sqlFiles.map(filename => {
                const match = filename.match(/^(\d+)_(.+)\.sql$/);
                
                if (!match) {
                    console.warn(`⚠️  Skipping invalid migration filename: ${filename}`);
                    return null;
                }

                return {
                    filename,
                    version: match[1],
                    name: match[2],
                    path: path.join(this.migrationsDir, filename)
                };
            }).filter(Boolean); // Remove nulls

            // Sort by version (alphanumeric)
            migrations.sort((a, b) => a.version.localeCompare(b.version));

            return migrations;
        } catch (error) {
            console.error('Error scanning migration files:', error);
            throw error;
        }
    }

    /**
     * Get list of applied migrations from database
     */
    async getAppliedMigrations() {
        try {
            const result = await this.pool.query(
                `SELECT version, name, applied_at, checksum, success 
                 FROM ${this.migrationTableName} 
                 ORDER BY version`
            );
            return result.rows;
        } catch (error) {
            console.error('Error fetching applied migrations:', error);
            throw error;
        }
    }

    /**
     * Execute a migration file
     */
    async executeMigrationFile(migration, recordToDb = true) {
        const startTime = Date.now();
        const client = await this.pool.connect();

        try {
            // Read migration file content
            const sqlContent = await fs.readFile(migration.path, 'utf8');
            const checksum = this.calculateChecksum(sqlContent);

            // Verify if migration was previously applied with different content
            if (recordToDb) {
                const existing = await this.pool.query(
                    `SELECT checksum FROM ${this.migrationTableName} WHERE version = $1`,
                    [migration.version]
                );

                if (existing.rows.length > 0 && existing.rows[0].checksum !== checksum) {
                    throw new Error(
                        `Migration ${migration.version} has been modified! ` +
                        `Checksum mismatch. Never modify applied migrations.`
                    );
                }
            }

            // Execute migration in transaction
            await client.query('BEGIN');
            
            // Execute the SQL content
            await client.query(sqlContent);
            
            await client.query('COMMIT');

            const executionTime = Date.now() - startTime;

            // Record migration in database
            if (recordToDb) {
                await this.recordMigration(migration, executionTime, true, checksum);
            }

            console.log(`   ✅ Success (${executionTime}ms)`);
            
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            
            // Try to record failure
            if (recordToDb) {
                try {
                    const executionTime = Date.now() - startTime;
                    const sqlContent = await fs.readFile(migration.path, 'utf8');
                    const checksum = this.calculateChecksum(sqlContent);
                    await this.recordMigration(migration, executionTime, false, checksum);
                } catch (recordError) {
                    console.error('Failed to record migration failure:', recordError);
                }
            }

            throw new Error(
                `Migration ${migration.version} (${migration.name}) failed: ${error.message}`
            );
        } finally {
            client.release();
        }
    }

    /**
     * Record migration execution in database
     */
    async recordMigration(migration, executionTimeMs, success = true, checksumOverride = null) {
        try {
            let checksum = checksumOverride;
            
            if (!checksum) {
                const sqlContent = await fs.readFile(migration.path, 'utf8');
                checksum = this.calculateChecksum(sqlContent);
            }

            await this.pool.query(
                `INSERT INTO ${this.migrationTableName} 
                 (version, name, checksum, execution_time_ms, success, applied_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (version) DO NOTHING`,
                [migration.version, migration.name, checksum, executionTimeMs, success]
            );
        } catch (error) {
            console.error('Error recording migration:', error);
            throw error;
        }
    }

    /**
     * Calculate SHA-256 checksum of content
     */
    calculateChecksum(content) {
        return crypto
            .createHash('sha256')
            .update(content, 'utf8')
            .digest('hex');
    }

    /**
     * Get migration status summary
     */
    async getMigrationStatus() {
        try {
            const allMigrations = await this.scanMigrationFiles();
            const appliedMigrations = await this.getAppliedMigrations();
            const appliedVersions = new Set(appliedMigrations.map(m => m.version));

            return {
                total: allMigrations.length,
                applied: appliedMigrations.length,
                pending: allMigrations.filter(m => !appliedVersions.has(m.version)).length,
                migrations: allMigrations.map(m => ({
                    ...m,
                    applied: appliedVersions.has(m.version),
                    appliedAt: appliedMigrations.find(am => am.version === m.version)?.applied_at
                }))
            };
        } catch (error) {
            console.error('Error getting migration status:', error);
            throw error;
        }
    }
}

module.exports = MigrationManager;
