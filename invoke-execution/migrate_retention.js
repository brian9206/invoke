const database = require('./services/database');

(async () => {
    try {
        await database.connect();
        console.log('Connected to database');
        
        const fs = require('fs');
        const path = require('path');
        
        const sql = fs.readFileSync(path.join(__dirname, '../database/retention_settings.sql'), 'utf8');
        
        // Split by semicolon and execute each statement
        const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
        
        for (const statement of statements) {
            console.log('Executing:', statement.trim().substring(0, 50) + '...');
            await database.query(statement);
        }
        
        console.log('✅ Retention settings migration completed successfully');
        process.exit();
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
})();