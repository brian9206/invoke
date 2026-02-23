/**
 * Database Initialization Module
 * Ensures database connection and migrations are run on server startup
 */

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
            await database.connect();
            
            // Run database migrations
            const MigrationManager = require('./migration-manager');
            const migrationManager = new MigrationManager(database.pool);
            await migrationManager.runMigrations();
            
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
