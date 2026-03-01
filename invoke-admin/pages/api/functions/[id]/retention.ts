import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { id } = req.query as { id: string }

    if (req.method === 'GET') {
      // Get function retention settings
      const { FunctionModel } = database.models;
      const fn = await FunctionModel.findByPk(id, {
        attributes: ['retention_type', 'retention_value', 'retention_enabled']
      });

      if (!fn) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }

      res.json(createResponse(true, {
        retention_type: fn.retention_type,
        retention_value: fn.retention_value,
        retention_enabled: fn.retention_enabled || false
      }, 'Function retention settings retrieved successfully'))

    } else if (req.method === 'PUT') {
      // Update function retention settings
      const { retention_type, retention_value, retention_enabled } = req.body
      const { FunctionModel } = database.models;

      await FunctionModel.update(
        { retention_type, retention_value, retention_enabled },
        { where: { id } }
      );

      res.json(createResponse(true, null, 'Function retention settings updated successfully'))

    } else {
      res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
    }

  } catch (error) {
    console.error('Function retention settings error:', error)
    res.status(500).json(createResponse(false, null, 'Internal server error'))
  }
}

export default withAuthOrApiKeyAndMethods(['GET', 'PUT'])(handler)