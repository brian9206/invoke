const config = require('../config/settings');

// Simulate in-memory database for demo purposes
let mockData = {
    users: 150,
    requests: 2847,
    uptime: Date.now() - (24 * 60 * 60 * 1000), // 24 hours ago
    errors: 12
};

/**
 * Get database statistics
 * @returns {Promise<Object>} Database stats
 */
async function getStats() {
    console.log('Fetching database statistics');
    
    // Simulate async database call
    await new Promise(resolve => setTimeout(resolve, 20));
    
    return {
        total_users: mockData.users,
        total_requests: mockData.requests,
        uptime_since: new Date(mockData.uptime).toISOString(),
        error_count: mockData.errors,
        database_version: config.database.version,
        connection_pool: {
            active: 5,
            idle: 3,
            max: 10
        }
    };
}

/**
 * Simulate data insertion
 * @param {string} table - Table name
 * @param {Object} data - Data to insert
 * @returns {Promise<Object>} Insert result
 */
async function insert(table, data) {
    console.log(`Inserting data into ${table}`);
    
    // Simulate database insert
    await new Promise(resolve => setTimeout(resolve, 30));
    
    // Update mock counters
    if (table === 'users') mockData.users++;
    if (table === 'requests') mockData.requests++;
    
    return {
        id: Math.floor(Math.random() * 10000),
        inserted_at: new Date().toISOString(),
        table: table,
        success: true
    };
}

/**
 * Simulate data query
 * @param {string} table - Table name
 * @param {Object} conditions - Query conditions
 * @returns {Promise<Array>} Query results
 */
async function query(table, conditions = {}) {
    console.log(`Querying ${table} with conditions:`, conditions);
    
    // Simulate database query
    await new Promise(resolve => setTimeout(resolve, 25));
    
    // Return mock results based on table
    const results = {
        users: [
            { id: 1, name: 'Admin User', role: 'admin' },
            { id: 2, name: 'Test User', role: 'user' }
        ],
        requests: [
            { id: 1, method: 'GET', status: 200, timestamp: new Date().toISOString() },
            { id: 2, method: 'POST', status: 201, timestamp: new Date().toISOString() }
        ]
    };
    
    return results[table] || [];
}

module.exports = {
    getStats,
    insert,
    query
};