#!/usr/bin/env node

/**
 * Manual Database Migration CLI Tool
 * 
 * Usage:
 *   node scripts/migrate.js              - Run pending migrations
 *   node scripts/migrate.js --status     - Show migration status
 *   npm run db:migrate                   - Run via npm script
 */

const { createDatabase } = require('invoke-shared');
const MigrationManager = require('../lib/migration-manager');

// Load environment variables from .env if available
try {
    require('dotenv').config();
} catch (error) {
    // dotenv not installed, use environment variables directly
}

async function main() {
    const args = process.argv.slice(2);
    const showStatus = args.includes('--status') || args.includes('-s');

    console.log('🗃️  Invoke Database Migration Tool\n');

    // Create Sequelize connection
    console.log('📡 Connecting to database...');
    const sequelize = createDatabase();
    try {
        await sequelize.authenticate();
        console.log(`✅ Connected to ${process.env.DB_NAME || 'invoke_db'}\n`);
    } catch (err) {
        throw new Error(`Cannot connect to database: ${err.message}`);
    }

    try {
        const migrationManager = new MigrationManager(sequelize);

        if (showStatus) {
            await showMigrationStatus(migrationManager);
        } else if (args.includes('--down') || args.includes('-d')) {
            await migrationManager.migrateDown();
            console.log('\n✅ Rolled back last migration');
        } else {
            await migrationManager.runMigrations();
        }

        console.log('\n✅ Migration tool completed successfully');
        process.exit(0);
    } finally {
        await sequelize.close();
    }
}

async function showMigrationStatus(migrationManager) {
    console.log('📊 Migration Status Report\n');
    console.log('═'.repeat(80));

    const status = await migrationManager.getMigrationStatus();

    console.log(`\n📈 Summary:`);
    console.log(`   Total migrations:   ${status.total}`);
    console.log(`   Applied:            ${status.applied}`);
    console.log(`   Pending:            ${status.pending}`);

    if (status.migrations.length > 0) {
        console.log(`\n📋 Migrations:\n`);
        for (const migration of status.migrations) {
            const icon = migration.applied ? '✅' : '⏳';
            const label = migration.applied ? 'Applied' : 'Pending';
            console.log(`   ${icon} ${migration.name}`);
            console.log(`      Status: ${label}\n`);
        }
    }

    console.log('═'.repeat(80));
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Migration interrupted by user');
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('\n\n⚠️  Migration terminated');
    process.exit(1);
});

// Run main function
main().catch((error) => {
    console.error('\n❌ Migration tool failed:', error.message);
    console.error(error.stack);
    process.exit(1);
});
