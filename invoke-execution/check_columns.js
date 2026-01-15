const database = require('./services/database');

(async () => {
    try {
        await database.connect();
        console.log('Connected to database');
        
        const result = await database.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'execution_logs'
            ORDER BY ordinal_position;
        `);
        
        console.log('execution_logs table columns:');
        result.rows.forEach(row => {
            console.log('- ' + row.column_name);
        });
        
        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
})();