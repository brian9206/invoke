import { NextApiRequest, NextApiResponse } from 'next'
const { createResponse } = require('../../../../../lib/utils')
const database = require('../../../../../lib/database')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
    }

    try {
        await database.connect()

        const { id: functionId, logId } = req.query
        // Verify function exists
        const functionResult = await database.query(
            'SELECT id, name FROM functions WHERE id = $1',
            [functionId]
        )

        if (functionResult.rows.length === 0) {
            return res.status(404).json(createResponse(false, null, 'Function not found', 404))
        }

        // Get detailed execution log
        const result = await database.query(`
            SELECT 
                el.*,
                f.name as function_name,
                fv.version as function_version
            FROM execution_logs el
            JOIN functions f ON el.function_id = f.id
            LEFT JOIN function_versions fv ON f.active_version_id = fv.id
            WHERE el.id = $1 AND el.function_id = $2
        `, [logId, functionId])

        if (result.rows.length === 0) {
            return res.status(404).json(createResponse(false, null, 'Execution log not found', 404))
        }

        const log = result.rows[0]
        
        // Safe JSON parsing function
        const safeJSONParse = (field: any, defaultValue: any) => {
            if (!field) return defaultValue
            if (typeof field === 'object') return field  // Already parsed
            if (typeof field === 'string') {
                try {
                    return JSON.parse(field)
                } catch (e) {
                    console.warn(`Failed to parse JSON field:`, field, e)
                    return defaultValue
                }
            }
            return defaultValue
        }
        
        // Parse JSON fields safely
        const parsedLog = {
            ...log,
            console_output: safeJSONParse(log.console_logs, []),
            request_headers: safeJSONParse(log.request_headers, {}),
            response_headers: safeJSONParse(log.response_headers, {})
        }

        res.json(createResponse(true, parsedLog, 'Execution log details retrieved successfully'))
    } catch (error) {
        console.error('Execution log details error:', error)
        res.status(500).json(createResponse(false, null, 'Internal server error'))
    }
}