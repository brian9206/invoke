import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    try {
        const { id: functionId, logId } = req.query
        const { ExecutionLog, Function: FunctionModel, Project, FunctionVersion } = database.models

        // Verify function exists
        const fn = await FunctionModel.findByPk(functionId, { attributes: ['id', 'name'] });

        if (!fn) {
            return res.status(404).json(createResponse(false, null, 'Function not found', 404))
        }

        // Get detailed execution log
        const logRecord = await ExecutionLog.findOne({
            where: { id: logId, function_id: functionId },
            include: [{
                model: FunctionModel,
                attributes: ['name', 'project_id', 'active_version_id'],
                required: true,
                include: [
                    { model: Project, attributes: ['name'], required: false },
                    { model: FunctionVersion, as: 'activeVersion', attributes: ['version'], required: false },
                ],
            }],
        }) as any

        if (!logRecord) {
            return res.status(404).json(createResponse(false, null, 'Execution log not found', 404))
        }
        const logRaw = logRecord.toJSON()
        const log: any = {
            ...logRaw,
            function_name: logRaw.Function?.name ?? null,
            project_id: logRaw.Function?.project_id ?? null,
            project_name: logRaw.Function?.Project?.name ?? null,
            function_version: logRaw.Function?.activeVersion?.version ?? null,
        }
        delete log.Function
        // Verify project membership for non-admins
        if (!req.user?.isAdmin) {
            const access = await checkProjectDeveloperAccess(req.user!.id, log.project_id, false)
            if (!access.allowed) {
                return res.status(403).json(createResponse(false, null, access.message || 'Access denied to this project', 403))
            }
        }
        
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

export default withAuthOrApiKeyAndMethods(['GET'])(handler)