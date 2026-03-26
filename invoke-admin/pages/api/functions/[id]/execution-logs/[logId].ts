import { NextApiResponse } from 'next'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import { createResponse } from '@/lib/utils'
import { proxyToLogger } from '@/lib/logger-proxy'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    try {
        const { logId } = req.query as { id: string; logId: string }

        const result = await proxyToLogger(`/logs/${logId}`)

        if (!result.success) {
            return res.status(result.status).json(createResponse(false, null, result.message ?? 'Log not found', result.status))
        }

        const log = result.data as any

        // Verify project membership for non-admins using project_id from the log record
        if (!req.user?.isAdmin && log?.project_id) {
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