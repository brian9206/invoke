/**
 * Database Initialization Module
 * Ensures database connection and migrations are run on server startup
 */

const path = require('path');
const { spawnSync } = require('child_process');
const database = require('./database');

let initialized = false;
let initializationPromise = null;

/**
 * Initialize database connection and run migrations
 * This is called once on server startup
 */
async function initializeDatabase() {
    if (initialized) {
        return true;
    }

    if (initializationPromise) {
        // Initialization already in progress, wait for it
        return initializationPromise;
    }

    initializationPromise = (async () => {
        try {
            console.log('🚀 Initializing database on server startup...');
            await database.sequelize.authenticate();
            console.log('✅ Database connected successfully');

            // Run database migrations in a child process to avoid
            // webpack bundling issues with dynamic require() in umzug
            const migrateScript = path.resolve(process.cwd(), 'scripts/migrate.js');
            console.log('🔄 Running migrations via child process...');
            const result = spawnSync(process.execPath, [migrateScript], {
                stdio: 'inherit',
                env: process.env,
            });
            if (result.status !== 0) {
                throw new Error(`Migration process exited with code ${result.status}`);
            }
            
            initialized = true;
            console.log('✅ Database initialization complete\n');
            return true;
        } catch (error) {
            console.error('❌ Database initialization failed:', error, '\n', 'Server will not start without a database connection and successful migrations.');
            process.exit(1); // Exit the process if initialization fails
        }
    })();

    return initializationPromise;
}

/**
 * Get initialization status
 */
function isInitialized() {
    return initialized;
}

/**
 * Reset initialization state (useful for testing)
 */
function resetInitialization() {
    initialized = false;
    initializationPromise = null;
}

module.exports = {
    initializeDatabase,
    isInitialized,
    resetInitialization
};
