import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    try {
        const { id: functionId, logId } = req.query
        const { FunctionLog, Function: FunctionModel, Project, FunctionVersion } = database.models

        // Verify function exists
        const fn = await FunctionModel.findByPk(functionId, { attributes: ['id', 'name'] });

        if (!fn) {
            return res.status(404).json(createResponse(false, null, 'Function not found', 404))
        }

        // Get detailed execution log
        const logRecord = await FunctionLog.findOne({
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
            id: logRaw.id,
            function_id: logRaw.function_id,
            executed_at: logRaw.executed_at,
            payload: logRaw.payload,
            function_name: logRaw.Function?.name ?? null,
            project_id: logRaw.Function?.project_id ?? null,
            project_name: logRaw.Function?.Project?.name ?? null,
            function_version: logRaw.Function?.activeVersion?.version ?? null,
        }
        // Verify project membership for non-admins
        if (!req.user?.isAdmin) {
            const access = await checkProjectDeveloperAccess(req.user!.id, log.project_id, false)
            if (!access.allowed) {
                return res.status(403).json(createResponse(false, null, access.message || 'Access denied to this project', 403))
            }
        }

        res.json(createResponse(true, log, 'Execution log details retrieved successfully'))
    } catch (error) {
        console.error('Execution log details error:', error)
        res.status(500).json(createResponse(false, null, 'Internal server error'))
    }
}

export default withAuthOrApiKeyAndMethods(['GET'])(handler)