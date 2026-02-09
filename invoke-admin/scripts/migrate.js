#!/usr/bin/env node

/**
 * Manual Database Migration CLI Tool
 * 
 * Usage:
 *   node scripts/migrate.js              - Run pending migrations
 *   node scripts/migrate.js --status     - Show migration status
 *   npm run db:migrate                   - Run via npm script
 */

const { Pool } = require('pg');
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

    // Create database connection pool
    const pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'invoke_db',
        password: process.env.DB_PASSWORD || 'postgres',
        port: process.env.DB_PORT || 5432,
    });

    try {
        // Test connection
        console.log('📡 Connecting to database...');
        const client = await pool.connect();
        console.log(`✅ Connected to ${process.env.DB_NAME || 'invoke_db'}\n`);
        client.release();

        const migrationManager = new MigrationManager(pool);

        if (showStatus) {
            // Show migration status
            await showMigrationStatus(migrationManager);
        } else {
            // Run migrations
            await migrationManager.runMigrations();
        }

        console.log('\n✅ Migration tool completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Migration tool failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await pool.end();
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
            const statusIcon = migration.applied ? '✅' : '⏳';
            const appliedText = migration.applied 
                ? `Applied: ${new Date(migration.appliedAt).toISOString()}`
                : 'Pending';
            
            console.log(`   ${statusIcon} [${migration.version}] ${migration.name}`);
            console.log(`      Status: ${appliedText}`);
            console.log(`      File: ${migration.filename}\n`);
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
main();
