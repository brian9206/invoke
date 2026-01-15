const database = require('./database');

class RetentionService {
    
    /**
     * Get global retention settings
     */
    async getGlobalSettings() {
        const result = await database.query(`
            SELECT setting_key, setting_value 
            FROM global_settings 
            WHERE setting_key LIKE 'log_retention%'
        `);
        
        const settings = {};
        result.rows.forEach(row => {
            const key = row.setting_key.replace('log_retention_', '');
            settings[key] = row.setting_value;
        });
        
        return {
            type: settings.type || 'time',
            value: parseInt(settings.value) || 7,
            enabled: settings.enabled === 'true'
        };
    }
    
    /**
     * Update global retention settings
     */
    async updateGlobalSettings(settings) {
        const queries = [];
        
        if (settings.type !== undefined) {
            queries.push(database.query(
                'UPDATE global_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2',
                [settings.type, 'log_retention_type']
            ));
        }
        
        if (settings.value !== undefined) {
            queries.push(database.query(
                'UPDATE global_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2',
                [settings.value.toString(), 'log_retention_value']
            ));
        }
        
        if (settings.enabled !== undefined) {
            queries.push(database.query(
                'UPDATE global_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2',
                [settings.enabled.toString(), 'log_retention_enabled']
            ));
        }
        
        await Promise.all(queries);
    }
    
    /**
     * Get retention settings for a specific function
     */
    async getFunctionRetentionSettings(functionId) {
        const result = await database.query(`
            SELECT retention_type, retention_value, retention_enabled 
            FROM functions 
            WHERE id = $1
        `, [functionId]);
        
        if (result.rows.length === 0) {
            throw new Error('Function not found');
        }
        
        const func = result.rows[0];
        
        // If function doesn't have custom settings, use global
        if (!func.retention_enabled) {
            return await this.getGlobalSettings();
        }
        
        return {
            type: func.retention_type || 'time',
            value: func.retention_value || 7,
            enabled: func.retention_enabled
        };
    }
    
    /**
     * Update retention settings for a specific function
     */
    async updateFunctionRetentionSettings(functionId, settings) {
        await database.query(`
            UPDATE functions 
            SET retention_type = $1, retention_value = $2, retention_enabled = $3
            WHERE id = $4
        `, [settings.type, settings.value, settings.enabled, functionId]);
    }
    
    /**
     * Clean up execution logs based on retention settings
     */
    async cleanupExecutionLogs(functionId = null) {
        let functions = [];
        
        if (functionId) {
            // Clean specific function
            const result = await database.query('SELECT id FROM functions WHERE id = $1', [functionId]);
            functions = result.rows;
        } else {
            // Clean all functions
            const result = await database.query('SELECT id FROM functions');
            functions = result.rows;
        }
        
        let totalDeleted = 0;
        
        for (const func of functions) {
            try {
                const settings = await this.getFunctionRetentionSettings(func.id);
                
                if (!settings.enabled) {
                    continue;
                }
                
                let deleteQuery;
                let params;
                
                if (settings.type === 'time') {
                    // Delete logs older than specified days
                    deleteQuery = `
                        DELETE FROM execution_logs 
                        WHERE function_id = $1 
                        AND executed_at < NOW() - INTERVAL '${settings.value} days'
                    `;
                    params = [func.id];
                } else if (settings.type === 'count') {
                    // Keep only the latest N logs
                    deleteQuery = `
                        DELETE FROM execution_logs 
                        WHERE function_id = $1 
                        AND id NOT IN (
                            SELECT id FROM execution_logs 
                            WHERE function_id = $1 
                            ORDER BY executed_at DESC 
                            LIMIT $2
                        )
                    `;
                    params = [func.id, settings.value];
                } else {
                    continue; // Skip if type is 'none'
                }
                
                const result = await database.query(deleteQuery, params);
                const deleted = result.rowCount || 0;
                totalDeleted += deleted;
                
                if (deleted > 0) {
                    console.log(`Cleaned ${deleted} logs for function ${func.id}`);
                }
                
            } catch (error) {
                console.error(`Error cleaning logs for function ${func.id}:`, error);
            }
        }
        
        return { deleted: totalDeleted, functions: functions.length };
    }
    
    /**
     * Get retention statistics
     */
    async getRetentionStats() {
        const result = await database.query(`
            SELECT 
                f.id,
                f.name,
                f.retention_type,
                f.retention_value,
                f.retention_enabled,
                COUNT(el.id) as log_count,
                MIN(el.executed_at) as oldest_log,
                MAX(el.executed_at) as newest_log
            FROM functions f
            LEFT JOIN execution_logs el ON f.id = el.function_id
            GROUP BY f.id, f.name, f.retention_type, f.retention_value, f.retention_enabled
            ORDER BY f.name
        `);
        
        return result.rows;
    }
}

module.exports = new RetentionService();