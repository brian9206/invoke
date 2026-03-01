const { Op, QueryTypes } = require('sequelize');
const database = require('./database');

class RetentionService {
    
    /**
     * Get global retention settings
     */
    async getGlobalSettings() {
        const { GlobalSetting } = database.models;
        const rows = await GlobalSetting.findAll({
            where: { setting_key: { [Op.like]: 'log_retention%' } },
        });

        const settings = {};
        rows.forEach(row => {
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
        const { GlobalSetting } = database.models;
        const queries = [];

        if (settings.type !== undefined) {
            queries.push(GlobalSetting.update(
                { setting_value: settings.type, updated_at: new Date() },
                { where: { setting_key: 'log_retention_type' } }
            ));
        }

        if (settings.value !== undefined) {
            queries.push(GlobalSetting.update(
                { setting_value: settings.value.toString(), updated_at: new Date() },
                { where: { setting_key: 'log_retention_value' } }
            ));
        }

        if (settings.enabled !== undefined) {
            queries.push(GlobalSetting.update(
                { setting_value: settings.enabled.toString(), updated_at: new Date() },
                { where: { setting_key: 'log_retention_enabled' } }
            ));
        }

        await Promise.all(queries);
    }
    
    /**
     * Get retention settings for a specific function
     */
    async getFunctionRetentionSettings(functionId) {
        const { Function: FunctionModel } = database.models;
        const func = await FunctionModel.findByPk(functionId, {
            attributes: ['id', 'retention_type', 'retention_value', 'retention_enabled'],
        });

        if (!func) {
            throw new Error('Function not found');
        }

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
        const { Function: FunctionModel } = database.models;
        await FunctionModel.update(
            {
                retention_type: settings.type,
                retention_value: settings.value,
                retention_enabled: settings.enabled,
            },
            { where: { id: functionId } }
        );
    }
    
    /**
     * Clean up execution logs based on retention settings
     */
    async cleanupExecutionLogs(functionId = null) {
        const { Function: FunctionModel, ExecutionLog } = database.models;
        let functions = [];

        if (functionId) {
            const func = await FunctionModel.findByPk(functionId, { attributes: ['id'] });
            if (func) functions = [func];
        } else {
            functions = await FunctionModel.findAll({ attributes: ['id'] });
        }

        let totalDeleted = 0;

        for (const func of functions) {
            try {
                const settings = await this.getFunctionRetentionSettings(func.id);

                if (!settings.enabled) {
                    continue;
                }

                let deleted = 0;

                if (settings.type === 'time') {
                    // Delete logs older than specified days
                    const cutoff = new Date(Date.now() - settings.value * 24 * 60 * 60 * 1000);
                    deleted = await ExecutionLog.destroy({
                        where: {
                            function_id: func.id,
                            executed_at: { [Op.lt]: cutoff },
                        },
                    });
                } else if (settings.type === 'count') {
                    // Keep only the latest N logs — requires a subquery DELETE (raw SQL)
                    const [, meta] = await database.sequelize.query(
                        `DELETE FROM execution_logs
                         WHERE function_id = :functionId
                           AND id NOT IN (
                               SELECT id FROM execution_logs
                               WHERE function_id = :functionId
                               ORDER BY executed_at DESC
                               LIMIT :limit
                           )`,
                        {
                            replacements: { functionId: func.id, limit: settings.value },
                            type: QueryTypes.DELETE,
                        }
                    );
                    deleted = meta?.rowCount ?? 0;
                } else {
                    continue; // Skip if type is 'none'
                }

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
     * Uses raw SQL for the GROUP BY / aggregation query.
     */
    async getRetentionStats() {
        const rows = await database.sequelize.query(
            `SELECT
                f.id,
                f.name,
                f.retention_type,
                f.retention_value,
                f.retention_enabled,
                COUNT(el.id) AS log_count,
                MIN(el.executed_at) AS oldest_log,
                MAX(el.executed_at) AS newest_log
             FROM functions f
             LEFT JOIN execution_logs el ON f.id = el.function_id
             GROUP BY f.id, f.name, f.retention_type, f.retention_value, f.retention_enabled
             ORDER BY f.name`,
            { type: QueryTypes.SELECT }
        );

        return rows;
    }
}

module.exports = new RetentionService();