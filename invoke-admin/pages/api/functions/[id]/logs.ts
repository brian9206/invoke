import { NextApiResponse } from 'next'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import { proxyToLogger } from '@/lib/logger-proxy'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { id } = req.query as { id: string }

    if (!id || typeof id !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Function ID is required', 400))
    }

    // Verify function exists using app DB
    const { Function: FunctionModel } = database.models
    const fn = await FunctionModel.findByPk(id, { attributes: ['id'] })
    if (!fn) {
      return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    }

    const status = req.query.status as string | undefined
    const kqlParts = ['source:execution']
    if (status === 'success') {
      kqlParts.push('response.status >= 200', 'response.status < 400')
    } else if (status === 'error') {
      kqlParts.push('response.status >= 400')
    }

    const result = await proxyToLogger('/logs/search', {
      query: {
        functionId: id,
        logType: 'request',
        q: kqlParts.join(' AND '),
        page: req.query.page as string,
        limit: req.query.limit as string
      }
    })

    res.status(result.status).json(createResponse(result.success, result.data, result.message ?? undefined))
  } catch (error) {
    console.error('Function logs API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthOrApiKeyAndMethods(['GET'])(handler)
